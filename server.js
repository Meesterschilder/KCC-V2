const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'changeme-in-production';

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Niet ingelogd' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sessie verlopen, log opnieuw in' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Geen toegang' });
  next();
}

// ─── AUTH ROUTES ───────────────────────────────────────────────────────────────
app.post('/api/auth/register', auth, adminOnly, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Naam, e-mail en wachtwoord zijn verplicht' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role',
      [name, email.toLowerCase(), hash, role || 'user']
    );
    res.json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'E-mailadres al in gebruik' });
    res.status(500).json({ error: 'Serverfout' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Vul e-mail en wachtwoord in' });
  try {
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'E-mailadres of wachtwoord onjuist' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'E-mailadres of wachtwoord onjuist' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch {
    res.status(500).json({ error: 'Serverfout' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  res.json(req.user);
});

// ─── GEBRUIKERS BEHEER (admin only) ───────────────────────────────────────────
app.get('/api/users', auth, adminOnly, async (req, res) => {
  const r = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at');
  res.json(r.rows);
});

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Je kunt jezelf niet verwijderen' });
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.patch('/api/users/:id/password', auth, adminOnly, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Wachtwoord minimaal 6 tekens' });
  const hash = await bcrypt.hash(password, 12);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.params.id]);
  res.json({ ok: true });
});

app.patch('/api/auth/me/password', auth, async (req, res) => {
  const { current, password } = req.body;
  const r = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  const ok = await bcrypt.compare(current, r.rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Huidig wachtwoord onjuist' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Nieuw wachtwoord minimaal 6 tekens' });
  const hash = await bcrypt.hash(password, 12);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
  res.json({ ok: true });
});

// ─── PROJECTEN ─────────────────────────────────────────────────────────────────
app.get('/api/projects', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM projects ORDER BY created_at');
  res.json(r.rows);
});

app.post('/api/projects', auth, async (req, res) => {
  const { id, name, corporation } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id en naam verplicht' });
  const r = await pool.query(
    'INSERT INTO projects (id, name, corporation, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
    [id, name, corporation || '', req.user.id]
  );
  res.json(r.rows[0]);
});

app.delete('/api/projects/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ─── BEWONERS ──────────────────────────────────────────────────────────────────
app.get('/api/projects/:pid/residents', auth, async (req, res) => {
  const res2 = await pool.query(
    `SELECT r.*, COALESCE(json_agg(e ORDER BY e.created_at) FILTER (WHERE e.id IS NOT NULL), '[]') AS events
     FROM residents r
     LEFT JOIN events e ON e.resident_id = r.id
     WHERE r.project_id = $1
     GROUP BY r.id
     ORDER BY r.created_at`,
    [req.params.pid]
  );
  res.json(res2.rows.map(formatResident));
});

app.post('/api/projects/:pid/residents', auth, async (req, res) => {
  const d = req.body;
  const r = await pool.query(
    `INSERT INTO residents (id, project_id, naam, adres, postcode, plaats, tel, email, corporation, status, pref_channels, belmoment, herwe)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [d.id, req.params.pid, d.naam, d.adres||'', d.postcode||'', d.plaats||'', d.tel||'', d.email||'', d.corporation||'', d.status||'todo', JSON.stringify(d.prefChannels||[]), d.belmoment||'', d.herwe||'']
  );
  res.json({ ...formatResident(r.rows[0]), events: [] });
});

app.patch('/api/residents/:id', auth, async (req, res) => {
  const d = req.body;
  const fields = [], vals = [];
  const allowed = ['naam','adres','postcode','plaats','tel','email','corporation','status','belmoment','herwe','last_contact'];
  allowed.forEach(f => {
    if (d[f] !== undefined) { fields.push(`${f}=$${vals.length+1}`); vals.push(d[f]); }
  });
  if (d.prefChannels !== undefined) { fields.push(`pref_channels=$${vals.length+1}`); vals.push(JSON.stringify(d.prefChannels)); }
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.id);
  await pool.query(`UPDATE residents SET ${fields.join(',')} WHERE id=$${vals.length}`, vals);
  res.json({ ok: true });
});

app.delete('/api/residents/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM residents WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ─── BULK IMPORT ───────────────────────────────────────────────────────────────
app.post('/api/projects/:pid/residents/bulk', auth, async (req, res) => {
  const { residents } = req.body;
  if (!Array.isArray(residents) || !residents.length) return res.status(400).json({ error: 'Geen bewoners' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const d of residents) {
      await client.query(
        `INSERT INTO residents (id, project_id, naam, adres, postcode, plaats, tel, email, corporation, status, pref_channels)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO NOTHING`,
        [d.id, req.params.pid, d.naam, d.adres||'', d.postcode||'', d.plaats||'', d.tel||'', d.email||'', d.corporation||'', 'todo', JSON.stringify([])]
      );
    }
    await client.query('COMMIT');
    res.json({ imported: residents.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Import mislukt: ' + e.message });
  } finally {
    client.release();
  }
});

// ─── CONTACTMOMENTEN ───────────────────────────────────────────────────────────
app.post('/api/residents/:rid/events', auth, async (req, res) => {
  const { type, result, note, ts } = req.body;
  const r = await pool.query(
    'INSERT INTO events (resident_id, type, result, note, user_name, ts) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.params.rid, type, result||'', note||'', req.user.name, ts]
  );
  await pool.query('UPDATE residents SET last_contact=$1 WHERE id=$2', [ts, req.params.rid]);
  res.json(r.rows[0]);
});

// ─── PORTAL ────────────────────────────────────────────────────────────────────
app.get('/api/projects/:pid/portal', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM portal_data WHERE project_id=$1', [req.params.pid]);
  res.json(r.rows[0] || {});
});

app.put('/api/projects/:pid/portal', auth, async (req, res) => {
  const { intro, startdatum, einddatum, uitvoerder, updates, fotos } = req.body;
  await pool.query(
    `INSERT INTO portal_data (project_id, intro, startdatum, einddatum, uitvoerder, updates, fotos, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (project_id) DO UPDATE SET intro=$2, startdatum=$3, einddatum=$4, uitvoerder=$5, updates=$6, fotos=$7, updated_at=NOW()`,
    [req.params.pid, intro||'', startdatum||'', einddatum||'', uitvoerder||'', JSON.stringify(updates||[]), JSON.stringify(fotos||[])]
  );
  res.json({ ok: true });
});

// ─── HELPERS ───────────────────────────────────────────────────────────────────
function formatResident(r) {
  return {
    id: r.id,
    naam: r.naam,
    adres: r.adres,
    postcode: r.postcode,
    plaats: r.plaats,
    tel: r.tel,
    email: r.email,
    corporation: r.corporation,
    status: r.status,
    prefChannels: r.pref_channels || [],
    belmoment: r.belmoment,
    herwe: r.herwe,
    lastContact: r.last_contact,
    events: (r.events || []).map(e => ({
      id: e.id,
      type: e.type,
      result: e.result,
      note: e.note,
      user: e.user_name,
      ts: e.ts
    }))
  };
}

// ─── CATCH-ALL → index.html ────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START ─────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`MSF KCC draait op poort ${PORT}`));
}).catch(err => {
  console.error('Database initialisatie mislukt:', err);
  process.exit(1);
});
