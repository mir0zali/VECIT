const crypto = require('crypto');
const { db } = require('./db');
const config = require('./config');

const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function createUser({ email, name, password }) {
  email = email.trim().toLowerCase();
  const isAdmin = config.adminEmail && email === config.adminEmail ? 1 : 0;
  const info = db.prepare(
    'INSERT INTO users (email, name, pass_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(email, name.trim(), hashPassword(password), isAdmin, Date.now());
  return Number(info.lastInsertRowid);
}

function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  res.cookie('sid', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.baseUrl.startsWith('https'),
    maxAge: SESSION_DAYS * 864e5,
  });
}

function destroySession(req, res) {
  if (req.cookies.sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.cookies.sid);
  res.clearCookie('sid');
}

function isPro(user) {
  return !!user && user.plan === 'pro' && (!user.pro_until || user.pro_until > Date.now());
}

// Attaches req.user (or null) and a CSRF token for forms.
function loadUser(req, res, next) {
  req.user = null;
  const token = req.cookies.sid;
  if (token) {
    const row = db.prepare(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'
    ).get(token, Date.now());
    if (row) req.user = row;
  }
  if (req.user) req.user.isPro = isPro(req.user);
  req.csrf = csrfFor(token);
  res.locals.user = req.user;
  res.locals.csrf = req.csrf;
  next();
}

function csrfFor(token) {
  return crypto.createHmac('sha256', token || 'anon').update('csrf').digest('hex').slice(0, 32);
}

function requireUser(req, res, next) {
  if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(404).send('Not found');
  next();
}

module.exports = {
  createUser, findUserByEmail, verifyPassword, createSession, destroySession,
  loadUser, requireUser, requireAdmin, isPro,
};
