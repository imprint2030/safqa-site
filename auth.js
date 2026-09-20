const crypto = require('crypto');
const { db } = require('./db');

function createSession(userId) {
  const id = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (id, user_id) VALUES (?, ?)').run(id, userId);
  return id;
}

function destroySession(id) {
  if (!id) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

function getUserFromSession(id) {
  if (!id) return null;
  const row = db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(id);
  if (!row) return null;
  return db.prepare('SELECT id, name, phone, email, city, is_admin, role, id_document, id_verified, prioritize_city, created_at FROM users WHERE id = ?').get(row.user_id);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

module.exports = { createSession, destroySession, getUserFromSession, parseCookies };
