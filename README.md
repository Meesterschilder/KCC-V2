# MSF KCC v2 — Supabase + Render

Gratis hosting: **Supabase** voor de PostgreSQL database, **Render** voor de Node.js app.

## Structuur

```
msf-kcc/
├── server.js          ← Express API (auth, projecten, bewoners, events, portal)
├── db.js              ← PostgreSQL verbinding + schema
├── package.json
├── render.yaml        ← Render Web Service configuratie
├── .gitignore
└── public/
    └── index.html     ← Frontend met loginscherm
```

---

## Stap 1 — Supabase database aanmaken

1. Ga naar [supabase.com](https://supabase.com) en maak een gratis account
2. Klik **New project**, geef het een naam (bijv. `msf-kcc`) en kies een wachtwoord
3. Wacht tot het project klaar is (~1 minuut)
4. Ga naar **Project Settings → Database**
5. Scroll naar **Connection string → URI**
6. Kopieer de connection string — die ziet er zo uit:
   ```
   postgresql://postgres:[JOUW-WACHTWOORD]@db.xxxx.supabase.co:5432/postgres
   ```
   ⚠️ Vervang `[JOUW-WACHTWOORD]` door het wachtwoord dat je in stap 2 hebt gekozen

De tabellen (users, projects, residents, events, portal_data) worden **automatisch aangemaakt** bij de eerste start van de app.

---

## Stap 2 — Push naar GitHub

```bash
git init
git add .
git commit -m "MSF KCC v2"
git remote add origin https://github.com/JOUW-NAAM/msf-kcc.git
git push -u origin main
```

---

## Stap 3 — Web Service aanmaken op Render

1. Ga naar [dashboard.render.com](https://dashboard.render.com)
2. Klik **New → Web Service**
3. Koppel je GitHub-repo
4. Instellingen:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. Scroll naar **Environment Variables** en voeg toe:

   | Key            | Value                                      |
   |----------------|--------------------------------------------|
   | `DATABASE_URL` | De connection string van Supabase (stap 1) |
   | `JWT_SECRET`   | Een willekeurige lange string, bijv. `msf-kcc-geheim-2026` |
   | `NODE_ENV`     | `production`                               |

6. Klik **Create Web Service**

Render deployt nu automatisch. Na ~2 minuten is de app live.

---

## Stap 4 — Eerste admin-account aanmaken

Dit doe je eenmalig via de Render **Shell**:

1. Ga in Render naar je Web Service → tabblad **Shell**
2. Voer dit commando in (pas naam, e-mail en wachtwoord aan):

```bash
node -e "
const {pool,initDB}=require('./db');
const bcrypt=require('bcryptjs');
async function run(){
  await initDB();
  const hash=await bcrypt.hash('JouwWachtwoord123',12);
  await pool.query(\"INSERT INTO users (name,email,password_hash,role) VALUES (\$1,\$2,\$3,'admin')\",['Jouw Naam','jij@msf.nl',hash]);
  console.log('Admin aangemaakt!');
  process.exit(0);
}
run().catch(e=>{console.error(e);process.exit(1);});
"
```

3. Log daarna in via de app-URL met het e-mailadres en wachtwoord uit het commando

---

## Stap 5 — Verdere gebruikers toevoegen

Vanuit de app zelf: **jouw naam (rechtsboven) → Gebruikersbeheer → Nieuwe gebruiker toevoegen**

---

## Omgevingsvariabelen samengevat

| Variabele      | Waar vandaan                          |
|----------------|---------------------------------------|
| `DATABASE_URL` | Supabase → Project Settings → Database → URI |
| `JWT_SECRET`   | Zelf kiezen, willekeurige lange string |
| `NODE_ENV`     | `production`                          |

---

## Lokaal draaien (optioneel)

```bash
npm install
```

Maak een `.env` bestand aan:
```
DATABASE_URL=postgresql://postgres:[wachtwoord]@db.xxxx.supabase.co:5432/postgres
JWT_SECRET=lokaal-geheim
NODE_ENV=development
```

Dan:
```bash
node server.js
```
