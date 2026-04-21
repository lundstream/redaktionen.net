const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'newsroom.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'rss',
      url TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'tech',
      enabled INTEGER DEFAULT 1,
      last_checked TEXT,
      check_interval INTEGER DEFAULT 3600
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER,
      external_id TEXT,
      title TEXT NOT NULL,
      url TEXT,
      summary TEXT,
      category TEXT NOT NULL DEFAULT 'tech',
      score REAL DEFAULT 0,
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES sources(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_ext ON leads(external_id);

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      title TEXT NOT NULL,
      summary TEXT,
      body TEXT,
      category TEXT NOT NULL DEFAULT 'tech',
      status TEXT DEFAULT 'draft',
      tone TEXT DEFAULT 'formal',
      image_url TEXT,
      image_prompt TEXT,
      source_urls TEXT DEFAULT '[]',
      byline TEXT DEFAULT 'Redaktionen',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      published_at TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE TABLE IF NOT EXISTS agent_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER,
      agent TEXT NOT NULL,
      action TEXT NOT NULL,
      input_text TEXT,
      output_text TEXT,
      model TEXT,
      tokens_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (article_id) REFERENCES articles(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // --- Migrations for new columns ---
  try { db.exec('ALTER TABLE articles ADD COLUMN views INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE articles ADD COLUMN publish_at TEXT'); } catch {}
  try { db.exec('ALTER TABLE articles ADD COLUMN priority INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE articles ADD COLUMN content_hash TEXT'); } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_articles_publish_at ON articles(publish_at)'); } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_articles_content_hash ON articles(content_hash)'); } catch {}

  // Seed default sources if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM sources').get().c;
  if (count === 0) {
    const insert = db.prepare('INSERT INTO sources (name, type, url, category) VALUES (?, ?, ?, ?)');
    // Swedish tech news sources
    insert.run('The Verge', 'rss', 'https://www.theverge.com/rss/index.xml', 'tech');
    insert.run('Ars Technica', 'rss', 'https://feeds.arstechnica.com/arstechnica/index', 'tech');
    insert.run('TechCrunch', 'rss', 'https://techcrunch.com/feed/', 'ai');
    insert.run('Wired', 'rss', 'https://www.wired.com/feed/rss', 'tech');
    insert.run('Hacker News', 'rss', 'https://hnrss.org/frontpage', 'tech');
    insert.run('MIT Technology Review', 'rss', 'https://www.technologyreview.com/feed/', 'ai');
    insert.run('Breakit', 'rss', 'https://www.breakit.se/feed/artiklar', 'tech');
    insert.run('Ny Teknik', 'rss', 'https://www.nyteknik.se/rss', 'hardware');
    insert.run('SweClockers', 'rss', 'https://www.sweclockers.com/feeds/nyheter', 'hardware');
    insert.run('The Register', 'rss', 'https://www.theregister.com/headlines.atom', 'tech');
    insert.run('404 Media', 'rss', 'https://www.404media.co/rss/', 'tech');
    insert.run('Tom\'s Hardware', 'rss', 'https://www.tomshardware.com/feeds/all', 'hardware');
    insert.run('IEEE Spectrum', 'rss', 'https://spectrum.ieee.org/feeds/feed.rss', 'ai');
    insert.run('BleepingComputer', 'rss', 'https://www.bleepingcomputer.com/feed/', 'tech');
    insert.run('Neowin', 'rss', 'https://www.neowin.net/rss/index.xml', 'enterprise');
    console.log('[DB] Seeded default tech news sources');
  }
}

// --- SOURCES ---
const sources = {
  all: () => getDb().prepare('SELECT * FROM sources ORDER BY name').all(),
  enabled: () => getDb().prepare('SELECT * FROM sources WHERE enabled = 1').all(),
  create: (s) => getDb().prepare('INSERT INTO sources (name, type, url, category) VALUES (?, ?, ?, ?)').run(s.name, s.type || 'rss', s.url, s.category || 'tech'),
  delete: (id) => getDb().prepare('DELETE FROM sources WHERE id = ?').run(id),
  touch: (id) => getDb().prepare("UPDATE sources SET last_checked = datetime('now') WHERE id = ?").run(id),
};

// --- LEADS ---
const leads = {
  create: (l) => getDb().prepare('INSERT OR IGNORE INTO leads (source_id, external_id, title, url, summary, category, score) VALUES (?, ?, ?, ?, ?, ?, ?)').run(l.source_id, l.external_id, l.title, l.url, l.summary, l.category, l.score || 0),
  pending: () => getDb().prepare("SELECT * FROM leads WHERE status = 'new' ORDER BY created_at DESC LIMIT 30").all(),
  setStatus: (id, status) => getDb().prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, id),
  exists: (extId) => !!getDb().prepare('SELECT 1 FROM leads WHERE external_id = ?').get(extId),
};

// --- ARTICLES ---
const articles = {
  create: (a) => {
    const r = getDb().prepare("INSERT INTO articles (lead_id, title, summary, body, category, status, tone, source_urls, byline, priority, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(a.lead_id, a.title, a.summary, a.body, a.category, a.status || 'draft', a.tone || 'formal', JSON.stringify(a.source_urls || []), a.byline || 'Redaktionen', a.priority || 0, a.content_hash || null);
    return r.lastInsertRowid;
  },
  get: (id) => getDb().prepare('SELECT * FROM articles WHERE id = ?').get(id),
  update: (id, a) => getDb().prepare("UPDATE articles SET title=?, summary=?, body=?, category=?, status=?, tone=?, image_url=?, image_prompt=?, source_urls=?, byline=?, priority=COALESCE(?,priority), updated_at=datetime('now') WHERE id=?").run(a.title, a.summary, a.body, a.category, a.status, a.tone, a.image_url || null, a.image_prompt || null, JSON.stringify(a.source_urls || []), a.byline, a.priority ?? null, id),
  approve: (id) => getDb().prepare("UPDATE articles SET status='approved', published_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(id),
  reject: (id) => getDb().prepare("UPDATE articles SET status='rejected', updated_at=datetime('now') WHERE id=?").run(id),
  delete: (id) => { getDb().prepare('DELETE FROM agent_log WHERE article_id = ?').run(id); getDb().prepare('DELETE FROM articles WHERE id = ?').run(id); },
  queue: () => getDb().prepare("SELECT * FROM articles WHERE status IN ('draft','pending') ORDER BY created_at DESC").all(),
  all: (limit) => getDb().prepare(`SELECT * FROM articles ORDER BY created_at DESC LIMIT ?`).all(limit || 100),
  latest: (limit) => getDb().prepare("SELECT * FROM articles WHERE status = 'approved' ORDER BY published_at DESC LIMIT ?").all(limit || 20),
  byCategory: (cat, limit) => getDb().prepare("SELECT * FROM articles WHERE status = 'approved' AND category = ? ORDER BY published_at DESC LIMIT ?").all(cat, limit || 20),
  count: () => {
    const d = getDb();
    return {
      total: d.prepare('SELECT COUNT(*) as c FROM articles').get().c,
      draft: d.prepare("SELECT COUNT(*) as c FROM articles WHERE status='draft'").get().c,
      pending: d.prepare("SELECT COUNT(*) as c FROM articles WHERE status='pending'").get().c,
      approved: d.prepare("SELECT COUNT(*) as c FROM articles WHERE status='approved'").get().c,
      rejected: d.prepare("SELECT COUNT(*) as c FROM articles WHERE status='rejected'").get().c,
      scheduled: d.prepare("SELECT COUNT(*) as c FROM articles WHERE status='scheduled'").get().c,
    };
  },
  // Scheduled publishing
  scheduled: () => getDb().prepare("SELECT * FROM articles WHERE status = 'scheduled' AND publish_at <= datetime('now') ORDER BY publish_at ASC").all(),
  schedule: (id, publishAt) => getDb().prepare("UPDATE articles SET status='scheduled', publish_at=?, updated_at=datetime('now') WHERE id=?").run(publishAt, id),
  publishScheduled: (id) => getDb().prepare("UPDATE articles SET status='approved', published_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(id),
  publishAllScheduled: () => getDb().prepare("UPDATE articles SET status='approved', published_at=datetime('now'), updated_at=datetime('now') WHERE status='scheduled'").run(),
  todayApprovedCount: () => getDb().prepare("SELECT COUNT(*) as c FROM articles WHERE status = 'approved' AND date(published_at) = date('now')").get().c,
  todayScheduledCount: () => {
    const d = getDb();
    const approved = d.prepare("SELECT COUNT(*) as c FROM articles WHERE status = 'approved' AND date(published_at) = date('now')").get().c;
    const scheduled = d.prepare("SELECT COUNT(*) as c FROM articles WHERE status = 'scheduled' AND date(publish_at) = date('now')").get().c;
    return approved + scheduled;
  },
  // View tracking
  incrementViews: (id) => getDb().prepare('UPDATE articles SET views = COALESCE(views, 0) + 1 WHERE id = ?').run(id),
  mostViewed: (limit, days) => getDb().prepare(`SELECT * FROM articles WHERE status = 'approved' AND published_at >= datetime('now', '-' || ? || ' days') ORDER BY views DESC LIMIT ?`).all(days || 7, limit || 10),
  // Search
  search: (q, limit) => getDb().prepare("SELECT * FROM articles WHERE status = 'approved' AND (title LIKE '%' || ? || '%' OR summary LIKE '%' || ? || '%') ORDER BY published_at DESC LIMIT ?").all(q, q, limit || 20),
  // Deduplication
  recentTitles: (hours) => getDb().prepare(`SELECT id, title, content_hash FROM articles WHERE created_at >= datetime('now', '-' || ? || ' hours')`).all(hours || 48),
  setContentHash: (id, hash) => getDb().prepare('UPDATE articles SET content_hash = ? WHERE id = ?').run(hash, id),
};

// --- AGENT LOG ---
const agentLog = {
  create: (l) => getDb().prepare('INSERT INTO agent_log (article_id, agent, action, input_text, output_text, model, tokens_used) VALUES (?, ?, ?, ?, ?, ?, ?)').run(l.article_id, l.agent, l.action, l.input_text, l.output_text, l.model, l.tokens_used || 0),
  forArticle: (id) => getDb().prepare('SELECT * FROM agent_log WHERE article_id = ? ORDER BY created_at').all(id),
  recent: (limit) => getDb().prepare('SELECT * FROM agent_log ORDER BY created_at DESC LIMIT ?').all(limit || 20),
  paginated: (limit, offset) => getDb().prepare('SELECT * FROM agent_log ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset),
};

// --- MESSAGES ---
const messages = {
  create: (m) => getDb().prepare('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)').run(m.name, m.email, m.message),
  all: () => getDb().prepare('SELECT * FROM messages ORDER BY created_at DESC').all(),
  unreadCount: () => getDb().prepare('SELECT COUNT(*) as c FROM messages WHERE read = 0').get().c,
  markRead: (id) => getDb().prepare('UPDATE messages SET read = 1 WHERE id = ?').run(id),
  delete: (id) => getDb().prepare('DELETE FROM messages WHERE id = ?').run(id),
};

// --- ADMIN USERS ---
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

const adminUsers = {
  all: () => getDb().prepare("SELECT id, username, role, created_at FROM admin_users ORDER BY id").all(),
  get: (id) => getDb().prepare("SELECT id, username, role, created_at FROM admin_users WHERE id = ?").get(id),
  getByUsername: (u) => getDb().prepare("SELECT * FROM admin_users WHERE username = ?").get(u),
  create: (u) => getDb().prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)').run(u.username, hashPassword(u.password), u.role || 'admin'),
  verify: (username, password) => {
    const user = getDb().prepare("SELECT * FROM admin_users WHERE username = ?").get(username);
    if (!user) return null;
    try { return verifyPassword(password, user.password_hash) ? user : null; } catch { return null; }
  },
  seed: (defaultPassword) => {
    const count = getDb().prepare('SELECT COUNT(*) as c FROM admin_users').get().c;
    if (count === 0) {
      adminUsers.create({ username: 'admin', password: defaultPassword || 'admin', role: 'admin' });
      console.log('[DB] Seeded default admin user');
    }
  },
  updatePassword: (id, password) => getDb().prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id),
  delete: (id) => getDb().prepare('DELETE FROM admin_users WHERE id = ?').run(id),
  count: () => getDb().prepare('SELECT COUNT(*) as c FROM admin_users').get().c,
};

const meta = {
  get: (key) => { const r = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key); return r ? r.value : null; },
  set: (key, value) => getDb().prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value),
};

module.exports = { getDb, sources, leads, articles, agentLog, messages, adminUsers, meta };
