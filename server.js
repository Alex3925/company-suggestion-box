// server.js
// SVRX Suggestions Web — Express + MySQL + Basic Auth
// -------------------------------------------------------------
// npm install express mysql2

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// MySQL connection settings
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'svrx_db';

// Admin credentials
const ADMIN_USER = process.env.ADMIN_USER || 'Fluxieee';
const ADMIN_PASS = process.env.ADMIN_PASS || 'SVRXTOP';

// Initialize DB pool
let pool;
async function initDb() {
  const tmp = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });
  await tmp.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );
  await tmp.end();

  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
  });

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

// Helpers
function makeId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function sanitize(s) {
  return typeof s === 'string' ? s.trim() : '';
}
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

// HTTP Basic Auth Middleware
function basicAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="SVRX Admin"');
    return res.status(401).send('Authentication required.');
  }

  const creds = Buffer.from(auth.split(' ')[1], 'base64').toString();
  const [user, pass] = creds.split(':');

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    return next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="SVRX Admin"');
    return res.status(403).send('Access denied.');
  }
}

// ➤ POST /api/feedback
app.post('/api/feedback', async (req, res) => {
  try {
    const { name, email, type, message, impact, extra } = req.body;

    const clean = {
      name: sanitize(name),
      email: sanitize(email),
      type: sanitize(type),
      message: sanitize(message),
      impact: sanitize(impact || ''),
      extra: sanitize(extra || ''),
    };

    if (!clean.name || !clean.email || !clean.type || !clean.message)
      return res.status(400).json({ ok: false, error: 'Missing required fields.' });

    const id = makeId();
    const created_at = new Date();

    await pool.execute(
      `INSERT INTO suggestions (id, name, email, type, message, impact, extra, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, clean.name, clean.email, clean.type, clean.message, clean.impact, clean.extra, created_at]
    );

    res.json({ ok: true, id });
  } catch (err) {
    console.error('POST /api/feedback', err);
    res.status(500).json({ ok: false, error: 'Server error.' });
  }
});

// ➤ GET /api/suggestions
app.get('/api/suggestions', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, type, message, impact, extra, created_at FROM suggestions ORDER BY created_at DESC LIMIT 1000'
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error('GET /api/suggestions', err);
    res.status(500).json({ ok: false, error: 'Server error.' });
  }
});

// ➤ GET /admin (protected)
app.get('/admin', basicAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, created_at, type, impact, name, email, message, extra FROM suggestions ORDER BY created_at DESC LIMIT 300'
    );
    const tableRows = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.id)}</td>
        <td>${escapeHtml(new Date(r.created_at).toISOString())}</td>
        <td>${escapeHtml(r.type)}</td>
        <td>${escapeHtml(r.impact)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.email)}</td>
        <td style="white-space:pre-wrap;max-width:420px">${escapeHtml(r.message)}</td>
        <td style="white-space:pre-wrap;max-width:300px">${escapeHtml(r.extra)}</td>
      </tr>`).join('');

    res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>SVRX Suggestions — Admin</title>
<style>
body{font-family:Inter,system-ui,sans-serif;background:#061226;color:#e8f5ff;padding:20px;margin:0}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{border:1px solid rgba(255,255,255,0.1);padding:8px;font-size:13px;vertical-align:top}
th{background:rgba(255,255,255,0.05);text-align:left}
tr:nth-child(even){background:rgba(255,255,255,0.02)}
.header{display:flex;align-items:center;justify-content:space-between}
.header h1{font-size:20px;margin:0;background:linear-gradient(90deg,#2b6ef6,#68a5ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
button{padding:8px 12px;border:0;border-radius:8px;background:#2b6ef6;color:#012033;cursor:pointer}
</style></head><body>
<div class="header"><h1>SVRX Suggestions Dashboard</h1><button onclick="location.reload()">Refresh</button></div>
<table><thead><tr><th>ID</th><th>Time</th><th>Type</th><th>Priority</th><th>Name</th><th>Email</th><th>Message</th><th>Extra</th></tr></thead><tbody>${tableRows}</tbody></table>
</body></html>`);
  } catch (err) {
    console.error('GET /admin', err);
    res.status(500).send('Server error');
  }
});

// ➤ Serve frontend
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) app.use('/', express.static(publicDir));

// ➤ Start server
initDb().then(() => {
  app.listen(PORT, () => console.log(`🚀 SVRX Suggestions Web running on port ${PORT}`));
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
