// server.js (MySQL version)
// Node 18+ recommended
// Install: npm install express cors mysql2

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// MySQL connection config via environment variables
// On Render set: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'svrx_db';

// Connection pool
let pool;

async function initDb() {
  // create a temporary connection to ensure database exists, then create pool
  const tmp = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });

  // Create database if not exists (safe)
  await tmp.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await tmp.end();

  // create pool
  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
  });

  // create table if not exists
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id VARCHAR(48) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(320) NOT NULL,
      type VARCHAR(60) NOT NULL,
      message TEXT NOT NULL,
      impact VARCHAR(30),
      extra TEXT,
      created_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log('✅ MySQL initialized and table ensured.');
}

// Utility: generate ID
function makeId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// Basic sanitization
function sanitizeString(s) {
  if (!s) return '';
  return String(s).trim();
}

// POST /api/feedback
app.post('/api/feedback', async (req, res) => {
  try {
    const { name, email, type, message, impact, extra } = req.body;

    const cleanName = sanitizeString(name);
    const cleanEmail = sanitizeString(email);
    const cleanType = sanitizeString(type);
    const cleanMessage = sanitizeString(message);
    const cleanImpact = sanitizeString(impact || '');
    const cleanExtra = sanitizeString(extra || '');

    if (!cleanName || !cleanEmail || !cleanType || !cleanMessage) {
      return res.status(400).json({ ok: false, error: 'Missing required fields (name, email, type, message).' });
    }
    if (cleanMessage.length < 3) {
      return res.status(400).json({ ok: false, error: 'Message too short.' });
    }

    const id = makeId();
    const created_at = new Date();

    // prepared statement insert
    const sql = `INSERT INTO suggestions (id, name, email, type, message, impact, extra, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    await pool.execute(sql, [id, cleanName, cleanEmail, cleanType, cleanMessage, cleanImpact, cleanExtra, created_at]);

    return res.json({ ok: true, item: { id, name: cleanName, email: cleanEmail, type: cleanType, message: cleanMessage, impact: cleanImpact, extra: cleanExtra, created_at } });
  } catch (err) {
    console.error('POST /api/feedback error', err);
    return res.status(500).json({ ok: false, error: 'Server error.' });
  }
});

// GET /api/suggestions
app.get('/api/suggestions', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, type, message, impact, extra, created_at FROM suggestions ORDER BY created_at DESC LIMIT 1000');
    return res.json({ ok: true, items: rows });
  } catch (err) {
    console.error('GET /api/suggestions error', err);
    return res.status(500).json({ ok: false, error: 'Server error.' });
  }
});

// Simple admin view (UNPROTECTED - secure in production)
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

app.get('/admin', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, created_at, type, impact, name, email, message, extra FROM suggestions ORDER BY created_at DESC LIMIT 200');
    const rowsHtml = rows.map(it => `
      <tr>
        <td>${escapeHtml(it.id)}</td>
        <td>${escapeHtml(new Date(it.created_at).toISOString())}</td>
        <td>${escapeHtml(it.type)}</td>
        <td>${escapeHtml(it.impact || '')}</td>
        <td>${escapeHtml(it.name)}</td>
        <td>${escapeHtml(it.email)}</td>
        <td style="max-width:420px;white-space:pre-wrap;">${escapeHtml(it.message)}</td>
        <td style="max-width:300px;white-space:pre-wrap;">${escapeHtml(it.extra || '')}</td>
      </tr>`).join('\n');

    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html>
<head><meta charset="utf-8"><title>SVRX Suggestions — Admin</title>
<style>
body{font-family:Inter,system-ui,sans-serif;background:#061226;color:#e8f5ff;padding:20px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{border:1px solid rgba(255,255,255,0.1);padding:8px;font-size:13px;vertical-align:top}
th{background:rgba(255,255,255,0.05);text-align:left}
tr:nth-child(even){background:rgba(255,255,255,0.02)}
.header{display:flex;align-items:center;justify-content:space-between}
.header h1{font-size:20px;margin:0;background:linear-gradient(90deg,#2b6ef6,#68a5ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
button{padding:8px 12px;border:0;border-radius:8px;background:#2b6ef6;color:#012033;cursor:pointer}
</style>
</head><body>
<div class="header"><h1>SVRX Suggestions Dashboard</h1><button onclick="location.reload()">Refresh</button></div>
<table><thead><tr><th>ID</th><th>Time</th><th>Type</th><th>Priority</th><th>Name</th><th>Email</th><th>Message</th><th>Extra</th></tr></thead><tbody>
${rowsHtml}
</tbody></table>
</body></html>`);
  } catch (err) {
    console.error('GET /admin error', err);
    res.status(500).send('Server error');
  }
});

// Serve static files from /public if exists
const publicDir = path.join(__dirname, 'public');
const fs = require('fs');
if (fs.existsSync(publicDir)) {
  app.use('/', express.static(publicDir));
}

// fallback
app.use((req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

// Start after DB initialized
initDb().then(() => {
  app.listen(PORT, () => console.log(`🚀 SVRX Suggestions Web listening on port ${PORT}`));
}).catch(err => {
  console.error('Failed to initialize DB', err);
  process.exit(1);
});
