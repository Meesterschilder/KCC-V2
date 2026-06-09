# MSF KCC v2 — met server & database

## Structuur

```
msf-kcc/
├── server.js          ← Express API (auth, projecten, bewoners, events, portal)
├── db.js              ← PostgreSQL verbinding + schema
├── package.json       ← Node.js dependencies
├── render.yaml        ← Render configuratie (Web Service + PostgreSQL)
└── public/
    └── index.html     ← Frontend met login
```

## Deployen op Render

### Stap 1 — Push naar GitHub
```bash
git init
git add .
git commit -m "MSF KCC v2 met backend"
git remote add origin https://github.com/JOUW-NAAM/msf-kcc.git
git push -u origin main
```

### Stap 2 — Render koppelen
1. Ga naar [dashboard.render.com](https://dashboard.render.com)
2. Klik **New → Blueprint** (dit leest `render.yaml` automatisch)
3. Koppel je GitHub-repo
4. Render maakt automatisch aan:
   - Een **Web Service** (Node.js app)
   - Een **PostgreSQL database**
   - Een **JWT_SECRET** (automatisch gegenereerd)

### Stap 3 — Eerste admin-account aanmaken
Na de eerste deploy moet je eenmalig een admin-account aanmaken via de Render **Shell**:

1. Ga in Render naar je Web Service → **Shell**
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

3. Log daarna in via de app-URL

### Stap 4 — Verdere gebruikers toevoegen
Dat doe je gewoon vanuit de app: **jouw naam (rechtsboven) → Gebruikersbeheer → Nieuwe gebruiker toevoegen**

## Omgevingsvariabelen

| Variabele       | Uitleg                                      |
|----------------|---------------------------------------------|
| `DATABASE_URL`  | Automatisch ingevuld door Render            |
| `JWT_SECRET`    | Automatisch gegenereerd door Render         |
| `NODE_ENV`      | `production` (ingesteld in render.yaml)     |
| `PORT`          | Automatisch ingesteld door Render           |

## Lokaal draaien

```bash
npm install
# Maak een .env bestand:
echo "DATABASE_URL=postgresql://localhost/msf_kcc_dev" > .env
echo "JWT_SECRET=dev-secret" >> .env
node server.js
```
