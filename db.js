const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        corporation TEXT DEFAULT '',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS residents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        naam TEXT NOT NULL,
        adres TEXT DEFAULT '',
        postcode TEXT DEFAULT '',
        plaats TEXT DEFAULT '',
        tel TEXT DEFAULT '',
        email TEXT DEFAULT '',
        corporation TEXT DEFAULT '',
        status TEXT DEFAULT 'todo',
        pref_channels JSONB DEFAULT '[]',
        belmoment TEXT DEFAULT '',
        herwe TEXT DEFAULT '',
        last_contact TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        result TEXT DEFAULT '',
        note TEXT DEFAULT '',
        user_name TEXT NOT NULL,
        ts TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS portal_data (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        intro TEXT DEFAULT '',
        startdatum TEXT DEFAULT '',
        einddatum TEXT DEFAULT '',
        uitvoerder TEXT DEFAULT 'Meesterschilders Friesland B.V.',
        updates JSONB DEFAULT '[]',
        fotos JSONB DEFAULT '[]',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('Database schema gereed');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
