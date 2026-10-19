const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(process.env.DB_PATH || path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  plan TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  pro_until INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  website TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  description TEXT,
  colors TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'brand-submitted',
  guidelines_url TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  submitted_by INTEGER REFERENCES users(id),
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS logos (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  dark_bg INTEGER NOT NULL DEFAULT 0,
  svg_file TEXT NOT NULL,
  source_file TEXT,
  source_ext TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logo_id INTEGER NOT NULL REFERENCES logos(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checkout_id TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_downloads_user ON downloads(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_logos_brand ON logos(brand_id);
`);

module.exports = { db, DATA_DIR };
