const express = require('express');
const fs = require('fs');
const { marked } = require('marked');
const path = require('path');

marked.setOptions({ breaks: true, gfm: true });

// Byline-to-photo mapping for AI team
const BYLINE_PHOTOS = {
  'Fuller Stackman':      '/images/team/fuller-stackman.png',
  'Sven Googlund':        '/images/team/sven-googlund.png',
  'Linus Kärna':          '/images/team/linus-karna.png',
  'Hardy Chipström':      '/images/team/hardy-chipstrom.png',
  'Albert Promtsson':     '/images/team/albert-promtsson.png',
  'Vera Workspace':        '/images/team/vera-workspace.png',
  'Glosa Grammar':        '/images/team/glosa-grammarsdottir.png',
  'Klara Faktelius':      '/images/team/klara-faktelius.png',
  'Pixel Peepgren':       '/images/team/pixel-peepgren.png',
};
function bylineHtml(byline, size) {
  const name = byline || 'Redaktionen';
  const photo = BYLINE_PHOTOS[name];
  const sz = size || 28;
  if (!photo) return name;
  return `<img src="${photo}" alt="" style="width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;border:1px solid var(--border);">${name}`;
}

const TEAM = [
  { name: 'Fuller Stackman',      role: 'Chefredaktör',              desc: 'Väljer, prioriterar och styr teknykheterna. Ser till att rätt stories lyfts.', photo: '/images/team/fuller-stackman.png' },
  { name: 'Sven Googlund',        role: 'Researcher',                desc: 'Kartlägger källor, trender och tekniska detaljer innan reportrarna sätter igång.', photo: '/images/team/sven-googlund.png' },
  { name: 'Linus Kärna',          role: 'Reporter — Tech',           desc: 'Bevakar tech, AI och produktlanseringar med nördigt engagemang.', photo: '/images/team/linus-karna.png' },
  { name: 'Hardy Chipström',      role: 'Reporter — Hardware',       desc: 'Expert på datorer, mobiler, chips och konsumentteknik.', photo: '/images/team/hardy-chipstrom.png' },
  { name: 'Albert Promtsson',     role: 'Reporter — AI & Internet',  desc: 'Djupdyker i AI-modeller, mjukvara, plattformar och webben.', photo: '/images/team/albert-promtsson.png' },
  { name: 'Vera Workspace',        role: 'Reporter — Enterprise',     desc: 'Företag, moln, system, produktivitet.', photo: '/images/team/vera-workspace.png' },
  { name: 'Glosa Grammar',        role: 'Språkgranskare',            desc: 'Slår vakt om struktur, ton och teknisk tydlighet i texter.', photo: '/images/team/glosa-grammarsdottir.png' },
  { name: 'Klara Faktelius',      role: 'Faktagranskare',            desc: 'Verifierar data, siffror, källor och påståenden innan publicering.', photo: '/images/team/klara-faktelius.png' },
  { name: 'Pixel Peepgren',       role: 'Grafisk formgivare',        desc: 'Skapar bilder, visualiseringar och illustrationer för techartiklar.', photo: '/images/team/pixel-peepgren.png' },
];

const app = express();
const PORT = 3040;

app.use(express.json());

// =====================================================================
// NEWSROOM — AI-driven tech news
// =====================================================================
const db = require('./newsroom-db');
const newsroom = require('./newsroom');

function utc(ts) { return ts && !ts.endsWith('Z') ? ts.replace(' ', 'T') + 'Z' : ts; }
function stockholmDayKey(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}
function formatPublicTimestamp(ts, options = {}) {
  if (!ts) return '';
  const { long = false, allowTodayLabel = true } = options;
  const date = new Date(utc(ts));
  if (allowTodayLabel && stockholmDayKey(date) === stockholmDayKey(new Date())) {
    const time = date.toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Stockholm'
    });
    return `Today ${time}`;
  }
  return date.toLocaleDateString('sv-SE', long
    ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Stockholm' }
    : { month: 'short', day: 'numeric', timeZone: 'Europe/Stockholm' });
}
function fixDates(a) {
  if (!a) return a;
  return { ...a,
    created_at: utc(a.created_at),
    updated_at: utc(a.updated_at),
    published_at: utc(a.published_at),
  };
}

let settings;
try { settings = require('./settings.json'); } catch { settings = {}; }

// --- Fail-to-ban for admin login ---
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

db.adminUsers.seed(settings.admin_password || 'admin');

function checkAdmin(req, res, next) {
  const ip = req.ip;
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
    const mins = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({ error: `Kontot är låst. Försök igen om ${mins} min.` });
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) return res.status(401).json({ error: 'Unauthorized' });
  const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
  const verified = db.adminUsers.verify(user, pass);
  if (!verified) {
    const current = loginAttempts.get(ip) || { count: 0, lockedUntil: null };
    current.count++;
    if (current.count >= MAX_LOGIN_ATTEMPTS) {
      current.lockedUntil = Date.now() + LOCKOUT_MS;
      console.log(`[Security] IP ${ip} locked out after ${current.count} failed login attempts`);
    }
    loginAttempts.set(ip, current);
    return res.status(401).json({ error: 'Bad credentials' });
  }

  loginAttempts.delete(ip);
  req.adminUser = verified;
  next();
}

// --- RSS feed ---
app.get('/rss', (req, res) => {
  const articles = db.articles.latest(20);
  const now = new Date().toUTCString();
  const items = articles.map(a => {
    const pubDate = new Date(utc(a.published_at) || utc(a.created_at)).toUTCString();
    const link = `https://redaktionen.net/artikel/${a.id}`;
    return `    <item>
      <title><![CDATA[${a.title}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description><![CDATA[${a.summary || ''}]]></description>
      <pubDate>${pubDate}</pubDate>
      <category>${a.category}</category>
      <dc:creator><![CDATA[${a.byline || 'Redaktionen'}]]></dc:creator>
    </item>`;
  }).join('\n');

  res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Redaktionen.net</title>
    <link>https://redaktionen.net</link>
    <atom:link href="https://redaktionen.net/rss" rel="self" type="application/rss+xml"/>
    <description>AI-driven teknikredaktion — tech-nyheter på svenska</description>
    <language>sv</language>
    <lastBuildDate>${now}</lastBuildDate>
${items}
  </channel>
</rss>`);
});

// --- Search API ---
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json([]);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const articles = db.articles.search(q, limit);
  res.json(articles.map(a => ({ ...fixDates(a), source_urls: JSON.parse(a.source_urls || '[]') })));
});

// --- Public article API ---
app.get('/api/articles', (req, res) => {
  const cat = req.query.category;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const articles = cat ? db.articles.byCategory(cat, limit) : db.articles.latest(limit);
  res.json(articles.map(a => ({ ...fixDates(a), source_urls: JSON.parse(a.source_urls || '[]') })));
});

app.get('/api/articles/most-viewed', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 20);
  const days = Math.min(parseInt(req.query.days) || 7, 30);
  const articles = db.articles.mostViewed(limit, days);
  res.json(articles.map(a => ({ ...fixDates(a), source_urls: JSON.parse(a.source_urls || '[]') })));
});

app.get('/api/articles/:id', (req, res) => {
  const article = db.articles.get(req.params.id);
  if (!article || article.status !== 'approved') return res.status(404).json({ error: 'Not found' });
  res.json({ ...fixDates(article), source_urls: JSON.parse(article.source_urls || '[]') });
});

// --- Admin API ---
app.get('/api/admin/queue', checkAdmin, (req, res) => {
  const queue = db.articles.queue();
  res.json(queue.map(a => ({ ...fixDates(a), source_urls: JSON.parse(a.source_urls || '[]') })));
});

app.get('/api/admin/articles', checkAdmin, (req, res) => {
  const all = db.articles.all(100);
  res.json(all.map(a => ({ ...fixDates(a), source_urls: JSON.parse(a.source_urls || '[]') })));
});

app.get('/api/admin/articles/:id', checkAdmin, (req, res) => {
  const article = db.articles.get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Not found' });
  const logs = db.agentLog.forArticle(article.id);
  res.json({ ...fixDates(article), source_urls: JSON.parse(article.source_urls || '[]'), logs });
});

app.put('/api/admin/articles/:id', checkAdmin, (req, res) => {
  const article = db.articles.get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Not found' });
  db.articles.update(req.params.id, {
    title: req.body.title || article.title,
    summary: req.body.summary || article.summary,
    body: req.body.body || article.body,
    category: req.body.category || article.category,
    status: req.body.status || article.status,
    tone: req.body.tone || article.tone,
    image_url: req.body.image_url ?? article.image_url,
    source_urls: req.body.source_urls || JSON.parse(article.source_urls || '[]'),
    byline: req.body.byline || article.byline,
  });
  res.json({ ok: true });
});

app.post('/api/admin/articles/:id/approve', checkAdmin, async (req, res) => {
  const article = db.articles.get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Not found' });

  let imageGenerated = !!article.image_url;
  let imageError = null;

  if (!article.image_url) {
    try {
      console.log(`[Admin] Generating image on publish for article ${req.params.id}`);
      const imgResult = await newsroom.graphicDesigner(req.params.id);
      imageGenerated = !!imgResult?.imageUrl;
      if (!imageGenerated) imageError = imgResult?.error || 'Bildgenerering gav inget resultat';
    } catch (e) {
      console.error(`[Admin] Image gen failed for ${req.params.id}:`, e.message);
      imageError = e.message;
    }
  }

  db.articles.approve(req.params.id);
  res.json({ ok: true, imageGenerated, imageError });
});

app.post('/api/admin/articles/:id/reject', checkAdmin, (req, res) => {
  db.articles.reject(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/articles/:id/rewrite', checkAdmin, async (req, res) => {
  const article = db.articles.get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Not found' });
  try {
    console.log(`[Admin] Rewrite pipeline started for article ${req.params.id}: ${article.title}`);
    const result = await newsroom.rewriteArticle(parseInt(req.params.id));
    res.json(result);
  } catch (e) {
    console.error(`[Admin] Rewrite failed for ${req.params.id}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/articles/:id', checkAdmin, (req, res) => {
  try {
    db.articles.delete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/articles-bulk/rejected', checkAdmin, (req, res) => {
  try {
    const rejected = db.getDb().prepare("SELECT id FROM articles WHERE status = 'rejected'").all();
    for (const a of rejected) db.articles.delete(a.id);
    res.json({ ok: true, deleted: rejected.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/articles-bulk/queue', checkAdmin, (req, res) => {
  try {
    const queued = db.getDb().prepare("SELECT id FROM articles WHERE status IN ('draft','pending')").all();
    for (const a of queued) db.articles.delete(a.id);
    res.json({ ok: true, deleted: queued.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/sources', checkAdmin, (req, res) => {
  res.json(db.sources.all());
});

app.post('/api/admin/sources', checkAdmin, (req, res) => {
  db.sources.create(req.body);
  res.json({ ok: true });
});

app.delete('/api/admin/sources/:id', checkAdmin, (req, res) => {
  db.sources.delete(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/stats', checkAdmin, (req, res) => {
  const counts = db.articles.count();
  const logs = db.agentLog.recent(20);
  res.json({ counts, recentLogs: logs });
});

app.get('/api/admin/logs', checkAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const logs = db.agentLog.paginated(limit, offset);
  res.json(logs);
});

app.get('/api/admin/health', checkAdmin, (req, res) => {
  const lastCycle = db.meta.get('last_cycle_at');
  const failures = parseInt(db.meta.get('cycle_failures') || '0', 10);
  const counts = db.articles.count();
  const elapsed = lastCycle ? Math.round((Date.now() - new Date(lastCycle).getTime()) / 60000) : null;
  res.json({
    status: failures >= 3 ? 'critical' : failures > 0 ? 'degraded' : 'ok',
    last_cycle: lastCycle,
    minutes_since_cycle: elapsed,
    consecutive_failures: failures,
    articles: counts,
  });
});

app.post('/api/admin/scan', checkAdmin, async (req, res) => {
  try {
    const result = await newsroom.runNewsCycle();
    // Force-publish all scheduled articles immediately on manual trigger
    const published = db.articles.publishAllScheduled();
    if (published.changes > 0) console.log(`[Admin] Force-published ${published.changes} scheduled articles`);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/publish-all', checkAdmin, (req, res) => {
  const result = db.articles.publishAllScheduled();
  console.log(`[Admin] Force-published ${result.changes} scheduled articles`);
  res.json({ published: result.changes });
});

app.post('/api/admin/chronicle', checkAdmin, async (req, res) => {
  try {
    await newsroom.generateWeeklyChronicle();
    // Force-publish any scheduled chronicles immediately
    const published = db.getDb().prepare(
      "UPDATE articles SET status='approved', published_at=datetime('now'), updated_at=datetime('now') WHERE status='scheduled' AND tone IN ('chronicle','analysis')"
    ).run();
    if (published.changes > 0) console.log(`[Admin] Force-published ${published.changes} chronicle(s)`);
    res.json({ ok: true, published: published.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/articles/:id/regenerate-image', checkAdmin, async (req, res) => {
  const article = db.articles.get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Not found' });
  try {
    console.log(`[Admin] Regenerating image for article ${req.params.id}: ${article.title}`);
    const imgResult = await newsroom.graphicDesigner(req.params.id);
    const updated = db.articles.get(req.params.id);
    res.json({ ok: true, image_url: updated?.image_url || null, imageGenerated: !!updated?.image_url });
  } catch (e) {
    console.error(`[Admin] Image regen failed for ${req.params.id}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/regenerate-images', checkAdmin, async (req, res) => {
  try {
    const all = db.articles.all();
    const missing = all.filter(a => !a.image_url);
    let done = 0;
    for (const a of missing) {
      try {
        console.log(`[Admin] Generating image for article ${a.id}: ${a.title}`);
        await newsroom.graphicDesigner(a.id);
        done++;
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[Admin] Image gen failed for ${a.id}:`, e.message);
      }
    }
    res.json({ total: missing.length, done });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Contact form API ---
const contactRateLimit = new Map();
const captchaStore = new Map();

app.get('/api/captcha', (req, res) => {
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  captchaStore.set(token, { answer: a + b, expires: Date.now() + 600000 });
  for (const [k, v] of captchaStore) { if (v.expires < Date.now()) captchaStore.delete(k); }
  res.json({ question: `${a} + ${b} = ?`, token });
});

app.post('/api/contact', (req, res) => {
  if (req.body.website) return res.json({ ok: true });

  const { name, email, message, captcha_token, captcha_answer } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Alla fält krävs' });
  if (name.length > 200 || email.length > 200 || message.length > 5000) return res.status(400).json({ error: 'För långt meddelande' });

  const stored = captchaStore.get(captcha_token);
  if (!stored || stored.expires < Date.now()) return res.status(400).json({ error: 'Captcha har gått ut, ladda om sidan' });
  if (parseInt(captcha_answer) !== stored.answer) return res.status(400).json({ error: 'Fel svar på säkerhetsfrågan' });
  captchaStore.delete(captcha_token);

  const ip = req.ip;
  const now = Date.now();
  const last = contactRateLimit.get(ip);
  if (last && now - last < 60000) return res.status(429).json({ error: 'Vänta en stund innan du skickar igen' });
  contactRateLimit.set(ip, now);

  db.messages.create({ name, email, message });
  res.json({ ok: true });
});

// --- Admin messages ---
app.get('/api/admin/messages', checkAdmin, (req, res) => {
  const msgs = db.messages.all();
  const unread = db.messages.unreadCount();
  res.json({ messages: msgs, unread });
});

app.post('/api/admin/messages/:id/read', checkAdmin, (req, res) => {
  db.messages.markRead(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/messages/:id', checkAdmin, (req, res) => {
  db.messages.delete(req.params.id);
  res.json({ ok: true });
});

// --- Admin user management ---
app.get('/api/admin/users', checkAdmin, (req, res) => {
  res.json(db.adminUsers.all());
});

app.post('/api/admin/users', checkAdmin, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Användarnamn och lösenord krävs' });
  if (username.length < 2 || username.length > 50) return res.status(400).json({ error: 'Användarnamn måste vara 2-50 tecken' });
  if (password.length < 6) return res.status(400).json({ error: 'Lösenordet måste vara minst 6 tecken' });
  if (db.adminUsers.getByUsername(username)) return res.status(409).json({ error: 'Användarnamnet finns redan' });
  try {
    db.adminUsers.create({ username, password, role: 'admin' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/users/:id/password', checkAdmin, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Lösenordet måste vara minst 6 tecken' });
  const user = db.adminUsers.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Användaren hittades inte' });
  db.adminUsers.updatePassword(req.params.id, password);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', checkAdmin, (req, res) => {
  if (db.adminUsers.count() <= 1) return res.status(400).json({ error: 'Kan inte ta bort sista administratören' });
  const user = db.adminUsers.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Användaren hittades inte' });
  db.adminUsers.delete(req.params.id);
  res.json({ ok: true });
});

// --- Shared page shell (dark tech theme) ---
function pageShell(title, activeCat, bodyHtml) {
  const catLabels = { tech: 'Tech', hardware: 'Hardware', ai: 'AI', enterprise: 'Enterprise' };
  return `<!DOCTYPE html><html lang="sv"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Redaktionen.net</title>
<link rel="alternate" type="application/rss+xml" title="Redaktionen.net RSS" href="/rss">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⌨</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1715654756257886" crossorigin="anonymous"></script>
<style>
  :root {
    --bg: #0d1117; --bg-elevated: #161b22; --card: #1c2128; --text: #e6edf3; --muted: #8b949e;
    --light: #6e7681; --border: #30363d; --accent: #58a6ff; --accent-dim: rgba(88,166,255,.15);
    --green: #3fb950; --green-bg: rgba(63,185,80,.1); --red: #f85149; --red-bg: rgba(248,81,73,.1);
    --orange: #d29922; --orange-bg: rgba(210,153,34,.1); --purple: #bc8cff; --purple-bg: rgba(188,140,255,.1);
    --cyan: #39d2c0; --cyan-bg: rgba(57,210,192,.1);
    --radius: 10px;
    --shadow: 0 1px 3px rgba(0,0,0,.3); --shadow-lg: 0 8px 24px rgba(0,0,0,.4);
    --mono: 'JetBrains Mono', 'Fira Code', monospace;
    --sans: 'Space Grotesk', 'Inter', system-ui, sans-serif;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: var(--sans); background: var(--bg); color: var(--text); min-height: 100vh; -webkit-font-smoothing: antialiased; }
  header { position: sticky; top: 0; z-index: 100; background: var(--bg); }
  .header-top { background: var(--bg); border-bottom: 1px solid var(--border); }
  .header-top-inner {
    max-width: 1360px; margin: 0 auto; padding: 20px 40px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  }
  .header-nav-bar { background: var(--bg-elevated); border-bottom: 1px solid var(--border); }
  .header-nav-inner {
    max-width: 1360px; margin: 0 auto; padding: 10px 40px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  }
  header h1 { font-family: var(--mono); font-size: 2rem; font-weight: 700; color: var(--text); letter-spacing: -.5px; line-height: 1.2; }
  header h1 a { color: var(--text); text-decoration: none; }
  header h1 .prompt { color: var(--accent); }
  header h1 .cursor { color: var(--green); animation: blink 1s step-end infinite; }
  .header-sub { font-family: var(--mono); font-size: 1rem; font-weight: 600; color: var(--accent); margin-top: 2px; letter-spacing: -.3px; }
  .header-tagline { font-family: var(--mono); font-size: .8rem; font-weight: 500; color: var(--muted); letter-spacing: -.2px; }
  .header-tagline .green { color: var(--green); }
  @keyframes blink { 50% { opacity: 0; } }
  nav { display: flex; gap: 4px; align-items: center; }
  nav a { color: var(--muted); text-decoration: none; font-size: .85rem; font-weight: 600; padding: 6px 12px; border-radius: 6px; transition: all .15s; text-transform: uppercase; }
  nav a::after { content: '_'; color: var(--green); margin-left: 1px; opacity: 0; }
  nav a:hover { color: var(--text); background: var(--accent-dim); }
  nav a:hover::after { opacity: 1; animation: blink 1s step-end infinite; }
  nav a.active { color: var(--accent); background: var(--accent-dim); }
  .header-clock { font-size: .85rem; color: var(--muted); font-family: var(--mono); font-weight: 400; }
  .header-search { position: relative; }
  .header-search input { width: 260px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 32px 6px 12px; color: var(--text); font-family: var(--sans); font-size: .85rem; outline: none; transition: border-color .15s; }
  .header-search input:focus { border-color: var(--accent); }
  .header-search input::placeholder { color: var(--light); }
  .header-search .search-icon { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--light); font-family: var(--mono); font-size: .85rem; pointer-events: none; }
  .header-search-results { position: absolute; top: calc(100% + 6px); right: 0; width: 380px; max-width: 90vw; max-height: 60vh; overflow-y: auto; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-lg); display: none; z-index: 200; }
  .header-search-results.open { display: block; }
  .search-result-item { display: block; text-decoration: none; color: var(--text); padding: 12px 18px; border-bottom: 1px solid var(--border); transition: background .1s; }
  .search-result-item:last-child { border-bottom: none; }
  .search-result-item:hover { background: var(--accent-dim); }
  .search-result-item h4 { font-size: .92rem; font-weight: 600; margin: 0; line-height: 1.35; }
  .cat-tag { display: inline-block; font-family: var(--mono); font-size: .62rem; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; padding: 2px 8px; border-radius: 4px; line-height: 1; white-space: nowrap; }
  .cat-tech { color: var(--green); border: 1px solid var(--green); }
  .cat-ai { color: var(--cyan); border: 1px solid var(--cyan); }
  .cat-hardware { color: var(--accent); border: 1px solid var(--accent); }
  .cat-enterprise { color: var(--red); border: 1px solid var(--red); }
  .ad-label { font-family: var(--mono); text-align: center; font-size: .6rem; color: var(--light); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; margin-top: 24px; margin-bottom: 6px; }
  .ad-banner { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 28px; text-align: center; font-size: .9rem; font-weight: 500; color: var(--text); margin-bottom: 24px; }
  .ad-banner a { color: var(--accent); font-weight: 600; text-decoration: none; margin-left: 6px; }
  .ad-banner a:hover { text-decoration: underline; }
  .ad-slot { background: var(--bg-elevated); border: 1px dashed var(--border); border-radius: var(--radius); padding: 20px; margin: 20px 0; text-align: center; min-height: 100px; display: flex; align-items: center; justify-content: center; }
  footer { max-width: 1360px; margin: 0 auto; padding: 0 40px 40px; color: var(--light); font-size: .8rem; }
  .footer-inner { border-top: 1px solid var(--border); padding-top: 32px; display: flex; flex-direction: column; align-items: center; gap: 18px; }
  .footer-brand { font-family: var(--mono); font-size: 1rem; color: var(--text); font-weight: 700; }
  .footer-brand .prompt { color: var(--accent); }
  .footer-nav { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; justify-content: center; }
  .footer-nav a { color: var(--muted); text-decoration: none; font-weight: 500; padding: 4px 10px; border-radius: 6px; transition: all .2s; }
  .footer-nav a::after { content: '_'; color: var(--green); margin-left: 1px; opacity: 0; }
  .footer-nav a:hover { background: var(--accent-dim); color: var(--text); }
  .footer-nav a:hover::after { opacity: 1; animation: blink 1s step-end infinite; }
  .footer-nav .sep { color: var(--border); font-size: .7rem; user-select: none; }
  .footer-tagline { color: var(--light); font-size: .75rem; }
  .footer-tagline a { color: var(--accent); }
  .mob-br { display: none; }
  @media (max-width: 900px) { .header-top-inner { padding: 14px 16px; flex-direction: column; gap: 8px; align-items: stretch; } .header-nav-inner { padding: 8px 16px; flex-direction: column; gap: 8px; align-items: stretch; } header h1 { font-size: 1.4rem; } .header-sub { font-size: .78rem; } .header-tagline { font-size: .65rem; } .header-clock { display: none; } .header-search input { width: 100%; } .header-search-results { width: 100%; right: 0; } nav { flex-wrap: wrap; justify-content: flex-start; } nav a { font-size: .72rem; padding: 5px 8px; } footer { padding: 0 16px 28px; } .footer-tagline { text-align: center; } .mob-br { display: block; } .mob-hide { display: none; } }
</style>
</head><body>
<header>
  <div class="header-top"><div class="header-top-inner">
    <div>
      <h1><a href="/"><span class="prompt">&gt;</span> redaktionen<span class="cursor">_</span></a></h1>
      <div class="header-sub">tech-nyheter.</div>
      <div class="header-tagline">snabbt. nördigt. <span class="green">ai-drivet.</span></div>
    </div>
    <div class="header-clock" id="clock"></div>
  </div></div>
  <div class="header-nav-bar"><div class="header-nav-inner">
    <nav>
      <a href="/" ${activeCat === 'hem' ? 'class="active"' : ''}>127.0.0.1</a>
      <a href="/tech" ${activeCat === 'tech' ? 'class="active"' : ''}>tech</a>
      <a href="/hardware" ${activeCat === 'hardware' ? 'class="active"' : ''}>hardware</a>
      <a href="/ai" ${activeCat === 'ai' ? 'class="active"' : ''}>ai</a>
      <a href="/enterprise" ${activeCat === 'enterprise' ? 'class="active"' : ''}>enterprise</a>
    </nav>
    <div class="header-search">
      <input id="search-input" type="text" placeholder="Sök artiklar..." oninput="handleSearch(event)" onfocus="if(this.value.trim().length>=2)document.getElementById('search-results').classList.add('open')">
      <span class="search-icon">⌕</span>
      <div id="search-results" class="header-search-results"></div>
    </div>
  </div></div>
</header>
<script>
(function updateClock(){
  const d=new Date();
  document.getElementById('clock').textContent=d.toLocaleDateString('sv-SE',{weekday:'short',month:'short',day:'numeric'})+' '+d.toTimeString().slice(0,5);
  setTimeout(updateClock,30000);
})();
const CAT = { tech: 'Tech', hardware: 'Hardware', ai: 'AI', enterprise: 'Enterprise' };
function escHtml(s){ const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }
function parseTs(ts){ if(!ts) return null; return new Date(ts.endsWith('Z')?ts:ts+'Z'); }
function dayKey(d){ return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(d); }
function fmtDate(ts){ const d=parseTs(ts); if(!d) return ''; if(dayKey(d)===dayKey(new Date())) return 'Today '+d.toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Stockholm'}); return d.toLocaleDateString('sv-SE',{month:'short',day:'numeric',timeZone:'Europe/Stockholm'}); }
let searchTimeout;
function handleSearch(e){
  clearTimeout(searchTimeout);
  const q=e.target.value.trim();
  const resultsEl=document.getElementById('search-results');
  if(q.length<2){ resultsEl.innerHTML=''; resultsEl.classList.remove('open'); return; }
  searchTimeout=setTimeout(async()=>{
    try {
      const r=await fetch('/api/search?q='+encodeURIComponent(q));
      const articles=await r.json();
      if(!articles.length){ resultsEl.innerHTML='<div style="color:var(--muted);padding:20px;text-align:center;">Inga resultat</div>'; resultsEl.classList.add('open'); return; }
      resultsEl.innerHTML=articles.map(a=>{
        const d=fmtDate(a.published_at||a.created_at);
        return '<a href="/artikel/'+a.id+'" class="search-result-item"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-family:var(--mono);font-size:.62rem;color:var(--light);"><span class="cat-tag cat-'+a.category+'" style="font-size:.55rem;">'+(CAT[a.category]||a.category)+'</span><span>'+d+'</span></div><h4>'+escHtml(a.title)+'</h4></a>';
      }).join('');
      resultsEl.classList.add('open');
    } catch(err){ console.error('Search failed:',err); }
  },300);
}
document.addEventListener('click',e=>{
  const wrap=document.querySelector('.header-search');
  if(wrap && !wrap.contains(e.target)) document.getElementById('search-results').classList.remove('open');
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') document.getElementById('search-results').classList.remove('open');
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){ e.preventDefault(); document.getElementById('search-input').focus(); }
});
</script>
${bodyHtml}
<footer><div class="footer-inner">
<div class="footer-brand"><span class="prompt">&gt;</span> redaktionen</div>
<nav class="footer-nav"><a href="/kontakt">Kontakt</a><span class="sep">·</span><a href="/om-oss">Om oss</a><span class="sep">·</span><a href="/rss">RSS</a></nav>
<div class="footer-tagline">AI-driven teknikredaktion · &copy; 2026 redaktionen.net <span class="mob-hide">·</span> <br class="mob-br"><a href="/om-oss">Läs mer</a></div>
</div></footer>
</body></html>`;
}

// --- Article page ---
app.get('/artikel/:id', (req, res) => {
  const article = db.articles.get(req.params.id);
  if (!article || article.status !== 'approved') return res.status(404).send('Artikeln hittades inte');

  // Track view
  db.articles.incrementViews(req.params.id);

  const sources = JSON.parse(article.source_urls || '[]');
  const catName = { tech: 'Tech', hardware: 'Hardware', ai: 'AI', enterprise: 'Enterprise' }[article.category] || article.category;
  const bodyHtml = marked.parse(article.body || '');

  res.send(pageShell(article.title, article.category, `
<style>
  .article-wrap { max-width: 780px; margin: 0 auto; padding: 8px 24px 80px; }
  .cat-tag { display: inline-block; background: var(--accent); color: var(--bg); padding: 3px 12px; border-radius: 6px; font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; font-family: var(--mono); line-height: 1; vertical-align: baseline; white-space: nowrap; position: relative; top: -.07em; margin-right: .45rem; }
  .cat-tag a { color: var(--bg); text-decoration: none; }
  h1.title { font-family: var(--sans); font-size: 2.2rem; font-weight: 700; line-height: 1.25; margin: 0 0 16px; letter-spacing: -.5px; }
  .summary { font-size: 1.1rem; color: var(--muted); line-height: 1.6; margin-bottom: 24px; font-weight: 500; }
  .meta { color: var(--light); font-size: .82rem; margin-bottom: 32px; border-bottom: 1px solid var(--border); padding-bottom: 16px; }
  .hero-img { width: 100%; border-radius: var(--radius); margin-bottom: 32px; }
  .body { font-size: 1.05rem; line-height: 1.75; color: var(--text); }
  .body p { margin-bottom: 1.2em; }
  .body h2, .body h3, .body h4 { font-weight: 600; margin: 1.8em 0 .6em; }
  .body h2 { font-size: 1.5rem; }
  .body h3 { font-size: 1.25rem; }
  .body ul, .body ol { margin-bottom: 1.2em; padding-left: 1.5em; }
  .body li { margin-bottom: .4em; }
  .body strong { font-weight: 600; }
  .body a { color: var(--accent); text-decoration: underline; }
  .body blockquote { border-left: 3px solid var(--accent); margin: 1.5em 0; padding: .5em 1em; color: var(--muted); font-style: italic; }
  .body hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
  .body code { font-family: var(--mono); background: var(--bg-elevated); padding: 2px 6px; border-radius: 4px; font-size: .9em; }
  .body pre { background: var(--bg-elevated); padding: 16px; border-radius: var(--radius); overflow-x: auto; margin-bottom: 1.2em; border: 1px solid var(--border); }
  .body pre code { background: none; padding: 0; }
  .sources { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border); }
  .sources h3 { font-size: .78rem; color: var(--light); margin-bottom: 8px; text-transform: uppercase; letter-spacing: .5px; font-family: var(--mono); }
  .sources a { color: var(--accent); font-size: .82rem; word-break: break-all; }
  .share-bar { display: flex; align-items: center; gap: 10px; margin: 28px 0; padding: 14px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .share-label { font-family: var(--mono); font-size: .72rem; font-weight: 700; color: var(--light); text-transform: uppercase; letter-spacing: .5px; margin-right: 4px; }
  .share-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--muted); text-decoration: none; font-size: .85rem; font-weight: 700; cursor: pointer; transition: all .15s; font-family: var(--mono); }
  .share-btn:hover { color: var(--text); background: var(--accent-dim); border-color: var(--accent); }
</style>
<div class="article-wrap">
  <h1 class="title">${article.title}</h1>
  <p class="summary">${article.summary}</p>
  <div class="meta"><a href="/${article.category}">${catName}</a> · ${bylineHtml(article.byline, 28)} · ${formatPublicTimestamp(article.published_at || article.created_at, { long: true, allowTodayLabel: !!article.published_at })}</div>
  ${article.image_url ? `<img class="hero-img" src="${article.image_url}" alt="${article.title}">` : ''}
  <div class="body">${bodyHtml}</div>
  <div class="share-bar">
    <span class="share-label">// Dela</span>
    <a href="https://twitter.com/intent/tweet?url=https://redaktionen.net/artikel/${article.id}&text=${encodeURIComponent(article.title)}" target="_blank" rel="noopener" class="share-btn" title="Dela på X">𝕏</a>
    <a href="https://www.linkedin.com/sharing/share-offsite/?url=https://redaktionen.net/artikel/${article.id}" target="_blank" rel="noopener" class="share-btn" title="Dela på LinkedIn">in</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=https://redaktionen.net/artikel/${article.id}" target="_blank" rel="noopener" class="share-btn" title="Dela på Facebook">f</a>
    <a href="mailto:?subject=${encodeURIComponent(article.title)}&body=${encodeURIComponent('Läs artikeln: https://redaktionen.net/artikel/' + article.id)}" class="share-btn" title="Dela via e-post">@</a>
    <button class="share-btn" onclick="navigator.clipboard.writeText('https://redaktionen.net/artikel/${article.id}');this.textContent='✓';setTimeout(()=>this.textContent='🔗',1500)" title="Kopiera länk">🔗</button>
  </div>
  ${sources.length ? `<div class="sources"><h3>// Källor</h3>${sources.map(u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).join('<br>')}</div>` : ''}
  <div style="margin-top:32px;padding:14px 18px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);font-size:.8rem;color:var(--muted);line-height:1.5">
    <strong style="color:var(--text)">Om denna artikel</strong><br>
    Artikeln är skapad av en AI-redaktion baserat på publika nyhetskällor och granskad av en mänsklig redaktör innan publicering. Faktafel kan förekomma. <a href="/om-oss" style="color:var(--accent)">Läs mer om hur vi arbetar</a>
  </div>
</div>`));
});

// --- Article preview ---
app.get('/artikel/:id/preview', (req, res) => {
  const article = db.articles.get(req.params.id);
  if (!article) return res.status(404).send('Artikeln hittades inte');
  const sources = JSON.parse(article.source_urls || '[]');
  const catName = { tech: 'Tech', hardware: 'Hardware', ai: 'AI', enterprise: 'Enterprise' }[article.category] || article.category;
  const bodyHtml = marked.parse(article.body || '');

  res.send(pageShell(`Förhandsvisning: ${article.title}`, article.category, `
<style>
  .article-wrap { max-width: 780px; margin: 0 auto; padding: 8px 24px 80px; }
  h1.title { font-family: var(--sans); font-size: 2.2rem; font-weight: 700; line-height: 1.25; margin: 0 0 16px; letter-spacing: -.5px; }
  .summary { font-size: 1.1rem; color: var(--muted); line-height: 1.6; margin-bottom: 24px; font-weight: 500; }
  .meta { color: var(--light); font-size: .82rem; margin-bottom: 32px; border-bottom: 1px solid var(--border); padding-bottom: 16px; }
  .meta a { color: var(--accent); text-decoration: none; }
  .meta a:hover { text-decoration: underline; }
  .hero-img { width: 100%; border-radius: var(--radius); margin-bottom: 32px; }
  .body { font-size: 1.05rem; line-height: 1.75; }
  .body p { margin-bottom: 1.2em; }
  .body h2, .body h3, .body h4 { font-weight: 600; margin: 1.8em 0 .6em; }
  .body code { font-family: var(--mono); background: var(--bg-elevated); padding: 2px 6px; border-radius: 4px; font-size: .9em; }
  .body pre { background: var(--bg-elevated); padding: 16px; border-radius: var(--radius); overflow-x: auto; border: 1px solid var(--border); }
  .body a { color: var(--accent); }
  .sources { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border); }
  .sources h3 { font-size: .78rem; color: var(--light); margin-bottom: 8px; font-family: var(--mono); }
  .sources a { color: var(--accent); font-size: .82rem; word-break: break-all; }
  .preview-bar { max-width: 1360px; margin: 0 auto; padding: 8px 40px; }
  .preview-bar .banner { background: var(--orange-bg); border: 1px solid var(--orange); color: var(--orange); padding: 10px 20px; border-radius: var(--radius); font-size: .85rem; font-weight: 600; text-align: center; }
</style>
<div class="preview-bar"><div class="banner">Förhandsvisning — artikeln är inte publicerad (${article.status})</div></div>
<div class="article-wrap">
  <h1 class="title">${article.title}</h1>
  <p class="summary">${article.summary}</p>
  <div class="meta"><a href="/${article.category}">${catName}</a> · ${bylineHtml(article.byline, 28)} · ${formatPublicTimestamp(article.created_at, { long: true, allowTodayLabel: false })}</div>
  ${article.image_url ? `<img class="hero-img" src="${article.image_url}" alt="${article.title}">` : ''}
  <div class="body">${bodyHtml}</div>
  ${sources.length ? `<div class="sources"><h3>// Källor</h3>${sources.map(u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).join('<br>')}</div>` : ''}
</div>`));
});

// --- Category pages ---
function categoryPage(cat, catLabel) {
  return (req, res) => {
    const articles = db.articles.byCategory(cat, 30);

    const empty = articles.length === 0 ? '<p class="empty">Inga publicerade artiklar ännu. Redaktionen arbetar på det!</p>' : '';

    // Only feature stories that already have an image in the top editorial layout.
    const featured = articles.filter(a => a.image_url);
    const hero = featured[0] || null;
    const secondary = featured.slice(1, 4);
    const featuredIds = new Set([hero?.id, ...secondary.map(a => a.id)].filter(Boolean));
    const rest = articles.filter(a => !featuredIds.has(a.id));

    function fmtDate(a) {
      return formatPublicTimestamp(a.published_at || a.created_at, { long: true, allowTodayLabel: !!a.published_at });
    }

    const heroHtml = hero ? `<a href="/artikel/${hero.id}" class="np-hero">
      ${hero.image_url ? `<img src="${hero.image_url}" alt="" class="np-hero-img">` : `<div class="np-hero-img np-placeholder"></div>`}
      <div class="np-hero-body">
        <h2>${hero.title}</h2>
        <p>${hero.summary || ''}</p>
        <div class="np-meta">${fmtDate(hero)}</div>
      </div>
    </a>` : '';

    const secHtml = secondary.map(a => `<a href="/artikel/${a.id}" class="np-secondary">
      ${a.image_url ? `<img src="${a.image_url}" alt="" class="np-sec-img">` : `<div class="np-sec-img np-placeholder"></div>`}
      <div class="np-sec-body">
        <h3>${a.title}</h3>
        <p>${(a.summary || '').substring(0, 120)}${(a.summary || '').length > 120 ? '…' : ''}</p>
        <div class="np-meta">${fmtDate(a)}</div>
      </div>
    </a>`).join('');

    const listHtml = rest.map((a, i) => {
      const item = `<a href="/artikel/${a.id}" class="np-list-item${i < rest.length - 1 ? '' : ' np-last'}">
      <div class="np-list-body">
        <h4>${a.title}</h4>
        <div class="np-meta">${fmtDate(a)}</div>
      </div>
      ${a.image_url ? `<img src="${a.image_url}" alt="" class="np-list-thumb">` : ''}
    </a>`;
      // Insert ad slot every 4 items
      if ((i + 1) % 4 === 0 && i < rest.length - 1) {
        return item + `<div class="ad-label">Annons</div><div class="ad-slot"></div>`;
      }
      return item;
    }).join('');

    res.send(pageShell(catLabel, cat, `
<style>
  .np-page { max-width: 1360px; margin: 0 auto; padding: 8px 40px 80px; }
  .np-cat-heading { display: flex; align-items: center; margin-bottom: 10px; }
  .np-cat-heading .cat-tag { font-size: 1rem; padding: 6px 14px; border-radius: 6px; letter-spacing: .1em; }
  .np-divider { border: none; border-top: 3px solid var(--text); margin-bottom: 24px; }
  .np-top { display: grid; grid-template-columns: 1.6fr 1fr; gap: 24px; margin-bottom: 32px; }
  .np-top-single { grid-template-columns: 1fr; }

  .np-hero { display: block; text-decoration: none; color: var(--text); }
  .np-hero:hover h2 { color: var(--accent); }
  .np-hero-img { width: 100%; height: 340px; object-fit: cover; border-radius: var(--radius); }
  .np-hero-body { margin-top: 14px; }
  .np-hero-body h2 { font-size: 1.65rem; font-weight: 700; line-height: 1.25; margin: 8px 0; letter-spacing: -.3px; }
  .np-hero-body p { color: var(--muted); font-size: .92rem; line-height: 1.55; margin-bottom: 8px; }

  .np-sidebar { display: flex; flex-direction: column; gap: 0; border-left: 1px solid var(--border); padding-left: 24px; }
  .np-secondary { display: flex; gap: 14px; text-decoration: none; color: var(--text); padding: 14px 0; border-bottom: 1px solid var(--border); }
  .np-secondary:last-child { border-bottom: none; }
  .np-secondary:hover h3 { color: var(--accent); }
  .np-sec-img { width: 110px; min-width: 110px; height: 80px; object-fit: cover; border-radius: 6px; }
  .np-sec-body { flex: 1; }
  .np-sec-body h3 { font-size: .92rem; font-weight: 600; line-height: 1.3; margin-bottom: 4px; }
  .np-sec-body p { color: var(--muted); font-size: .78rem; line-height: 1.45; margin-bottom: 4px; }

  .np-list-section { border-top: 2px solid var(--border); padding-top: 20px; }
  .np-list-section h3.np-list-heading { font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--light); margin-bottom: 12px; font-family: var(--mono); }
  .np-list-item { display: flex; justify-content: space-between; align-items: center; gap: 16px; text-decoration: none; color: var(--text); padding: 14px 0; border-bottom: 1px solid var(--border); }
  .np-list-item.np-last { border-bottom: none; }
  .np-list-item:hover h4 { color: var(--accent); }
  .np-list-body { flex: 1; }
  .np-list-body h4 { font-size: .92rem; font-weight: 600; line-height: 1.35; margin-bottom: 4px; }
  .np-list-thumb { width: 90px; height: 64px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
  .np-meta { color: var(--light); font-size: .7rem; font-family: var(--mono); }
  .np-placeholder { background: linear-gradient(135deg, #21262d 0%, #30363d 100%); }
  .empty { color: var(--light); font-size: 1rem; padding: 40px 0; font-style: italic; }

  @media (max-width: 900px) {
    .np-page { padding: 8px 16px 60px; }
    .np-top { grid-template-columns: 1fr; }
    .np-sidebar { border-left: none; padding-left: 0; border-top: 1px solid var(--border); padding-top: 16px; }
    .np-hero-img { height: 220px; }
  }
</style>
<div class="np-page">
  <div class="ad-label">Annons</div>
  <div class="ad-banner">Vill du synas här? 🤖 <a href="/kontakt">Kontakta oss</a></div>
  <div class="np-cat-heading"><span class="cat-tag cat-${cat}">${catLabel}</span></div>
  <hr class="np-divider">
  ${empty}
  ${hero ? `<div class="np-top${secondary.length === 0 ? ' np-top-single' : ''}">
    <div class="np-main">${heroHtml}</div>
    ${secondary.length ? `<div class="np-sidebar">${secHtml}</div>` : ''}
  </div>` : ''}
  ${rest.length ? `<div class="np-list-section">
    <h3 class="np-list-heading">Fler artiklar</h3>
    ${listHtml}
  </div>` : ''}
  <div class="ad-label">Annons</div>
  <div class="ad-slot"></div>
</div>`));
  };
}

app.get('/tech', categoryPage('tech', 'Tech'));
app.get('/hardware', categoryPage('hardware', 'Hardware'));
app.get('/ai', categoryPage('ai', 'AI'));
app.get('/enterprise', categoryPage('enterprise', 'Enterprise'));

// --- Contact page ---
app.get('/kontakt', (req, res) => {
  res.send(pageShell('Kontakt', '', `
<style>
  .contact-wrap { max-width: 620px; margin: 0 auto; padding: 8px 24px 80px; }
  h1.page-title { font-size: 2rem; font-weight: 700; margin-bottom: 8px; }
  .page-desc { color: var(--muted); font-size: .95rem; margin-bottom: 28px; line-height: 1.6; }
  .form-group { margin-bottom: 16px; }
  .form-group label { display: block; font-size: .72rem; font-weight: 600; color: var(--light); margin-bottom: 4px; text-transform: uppercase; letter-spacing: .5px; font-family: var(--mono); }
  .form-group input, .form-group textarea {
    width: 100%; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px;
    font-size: .9rem; background: var(--card); color: var(--text); font-family: var(--sans);
  }
  .form-group textarea { min-height: 160px; resize: vertical; line-height: 1.6; }
  .form-group input:focus, .form-group textarea:focus { outline: none; border-color: var(--accent); }
  .hp { position: absolute; left: -9999px; }
  .btn-send { padding: 10px 28px; background: var(--accent); color: var(--bg); border: none; border-radius: 8px; font-size: .9rem; cursor: pointer; font-weight: 600; }
  .btn-send:hover { opacity: .9; }
  .btn-send:disabled { opacity: .5; cursor: not-allowed; }
  .msg-ok { display: none; padding: 16px 20px; background: var(--green-bg); color: var(--green); border-radius: var(--radius); font-weight: 500; margin-top: 16px; }
  .msg-err { display: none; padding: 16px 20px; background: var(--red-bg); color: var(--red); border-radius: var(--radius); font-weight: 500; margin-top: 16px; }
</style>
<div class="contact-wrap">
  <h1 class="page-title">Kontakt</h1>
  <p class="page-desc">Har du tips, synpunkter eller vill samarbeta? Skicka ett meddelande till redaktionen.</p>
  <form id="contact-form" onsubmit="return sendContact(event)">
    <div class="form-group"><label>Namn</label><input name="name" required maxlength="200"></div>
    <div class="form-group"><label>E-post</label><input name="email" type="email" required maxlength="200"></div>
    <input name="website" class="hp" tabindex="-1" autocomplete="off">
    <div class="form-group"><label>Meddelande</label><textarea name="message" required maxlength="5000"></textarea></div>
    <div class="form-group"><label>Säkerhetsfråga: <span id="captcha-q">Laddar...</span></label><input name="captcha_answer" id="captcha-input" required autocomplete="off"><input type="hidden" name="captcha_token" id="captcha-token"></div>
    <button class="btn-send" type="submit" id="send-btn">Skicka meddelande</button>
  </form>
  <div class="msg-ok" id="msg-ok">Tack! Ditt meddelande har skickats.</div>
  <div class="msg-err" id="msg-err"></div>
</div>
<script>
let captchaToken = '';
async function loadCaptcha() {
  const r = await fetch('/api/captcha');
  const d = await r.json();
  document.getElementById('captcha-q').textContent = d.question;
  document.getElementById('captcha-token').value = d.token;
  captchaToken = d.token;
}
loadCaptcha();

async function sendContact(e) {
  e.preventDefault();
  const form = document.getElementById('contact-form');
  const btn = document.getElementById('send-btn');
  const data = Object.fromEntries(new FormData(form));
  btn.disabled = true; btn.textContent = 'Skickar...';
  document.getElementById('msg-ok').style.display = 'none';
  document.getElementById('msg-err').style.display = 'none';
  try {
    const r = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Fel'); }
    form.style.display = 'none';
    btn.style.display = 'none';
    document.getElementById('msg-ok').style.display = 'block';
  } catch (err) {
    document.getElementById('msg-err').textContent = err.message;
    document.getElementById('msg-err').style.display = 'block';
    btn.disabled = false; btn.textContent = 'Skicka meddelande';
    loadCaptcha();
  }
  return false;
}
</script>`));
});

// --- Om oss page ---
app.get('/om-oss', (req, res) => {
  const teamCards = TEAM.map((t, i) => `
    <div class="team-card" onclick="openModal(${i})" style="cursor:pointer;">
      <img src="${t.photo}" alt="${t.name}">
      <div class="name">${t.name}</div>
      <div class="role">${t.role}</div>
      <div class="desc">${t.desc}</div>
    </div>`).join('');

  res.send(pageShell('Om oss', '', `
<style>
  .about-wrap { max-width: 820px; margin: 0 auto; padding: 8px 24px 80px; }
  h1.page-title { font-size: 2rem; font-weight: 700; margin-bottom: 20px; }
  .about-wrap p { font-size: 1.05rem; line-height: 1.75; margin-bottom: 1.2em; color: var(--text); }
  .about-wrap p a { color: var(--accent); }
  h2.section-title { font-size: 1.5rem; font-weight: 700; margin: 48px 0 8px; }
  .section-intro { color: var(--muted); font-size: .95rem; margin-bottom: 28px; }
  .team-grid { display: flex; flex-wrap: wrap; gap: 24px; margin-bottom: 40px; justify-content: center; }
  .team-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; text-align: center; box-shadow: var(--shadow); transition: all .25s; width: 220px; }
  .team-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); border-color: var(--accent); }
  .team-card img { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; margin-bottom: 14px; border: 3px solid var(--border); }
  .team-card .name { font-size: 1.05rem; color: var(--text); font-weight: 600; margin-bottom: 4px; }
  .team-card .role { font-size: .72rem; color: var(--accent); font-weight: 700; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; font-family: var(--mono); }
  .team-card .desc { font-size: .82rem; color: var(--muted); line-height: 1.5; }
  .flow-figure { margin: 0 0 48px; text-align: center; }
  .flow-figure img { width: 100%; max-width: 820px; height: auto; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow); background: var(--card); }
  .flow-figure figcaption { margin-top: 10px; color: var(--muted); font-family: var(--mono); font-size: .78rem; letter-spacing: .04em; }
  @media (max-width: 600px) { .team-grid { gap: 14px; } .team-card { width: calc(50% - 7px); padding: 16px; } .team-card img { width: 72px; height: 72px; } }
</style>
<div class="about-wrap">
  <h1 class="page-title">Om Redaktionen</h1>
  <p>Redaktionen.net är en svensk tekniknyhetssajt som drivs med hjälp av AI-teknik. Vårt mål: samla, analysera och presentera de viktigaste tekniknyheterna — från AI-genombrott och hårdvarulanseringar till mjukvara och plattformsnyheter.</p>
  <p>Artiklarna tas fram av en AI-redaktion som bevakar internationella och svenska teknikmedier, skriver artiklar på svenska och faktagranskar innan publicering. En mänsklig redaktör godkänner alla artiklar.</p>
  <p>Vi tror på teknikjournalistik som är tillgänglig, nördig och ärlig. <a href="/kontakt">Hör av dig!</a></p>

  <h2 class="section-title">// Så fungerar redaktionen</h2>
  <p class="section-intro">Från nyhetskälla till publicerad artikel — AI-agenterna sköter bevakning, skrivande och granskning, och en mänsklig redaktör godkänner innan publicering.</p>
  <figure class="flow-figure">
    <img src="/about-flow.png" alt="Illustration av redaktionen.net-flödet: från nyhetskällor via AI-redaktion och granskning till publicerad artikel." loading="lazy">
    <figcaption>Bevakning → AI-redaktion → Granskning → Publicering</figcaption>
  </figure>

  <h2 class="section-title">// Redaktionen</h2>
  <p class="section-intro">Nio AI-agenter som jobbar dygnet runt med att bevaka, skriva och granska tekniknyheter.</p>
  <div class="team-grid">${teamCards}</div>

  <h2 class="section-title">// Transparens</h2>
  <p>Allt redaktionellt innehåll på redaktionen.net — artiklar, sammanfattningar och illustrationer — är genererat av artificiell intelligens baserat på publika nyhetskällor.</p>
  <p>En mänsklig redaktör godkänner alla artiklar innan publicering, men vi kan inte garantera att innehållet är helt fritt från faktafel. Kontrollera uppgifter mot originalkällan — länkad under varje artikel.</p>
  <p>Bilder är AI-genererade illustrationer och föreställer inte verkliga produkter eller händelser.</p>
  <p>Redaktionen.net är inte en registrerad nyhetsbyrå. Sajten drivs som ett teknikprojekt. <a href="/kontakt">Kontakta oss</a> med frågor.</p>
</div>

<div class="team-modal-overlay" id="team-modal" onclick="if(event.target===this)closeModal()">
  <div class="team-modal">
    <button class="close-btn" onclick="closeModal()">&times;</button>
    <img id="modal-photo" src="" alt="">
    <div class="name" id="modal-name"></div>
    <div class="role" id="modal-role"></div>
    <div class="desc" id="modal-desc"></div>
  </div>
</div>

<style>
.team-modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:999; align-items:center; justify-content:center; }
.team-modal-overlay.open { display:flex; }
.team-modal { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:40px 32px; text-align:center; max-width:380px; width:90%; position:relative; box-shadow:var(--shadow-lg); }
.team-modal .close-btn { position:absolute; top:10px; right:14px; background:none; border:none; color:var(--muted); font-size:1.5rem; cursor:pointer; }
.team-modal .close-btn:hover { color:var(--text); }
.team-modal img { width:220px; height:220px; border-radius:50%; object-fit:cover; border:3px solid var(--border); margin-bottom:18px; }
.team-modal .name { font-size:1.3rem; font-weight:700; color:var(--text); margin-bottom:4px; }
.team-modal .role { font-size:.75rem; color:var(--accent); font-weight:700; text-transform:uppercase; letter-spacing:.5px; margin-bottom:12px; font-family:var(--mono); }
.team-modal .desc { font-size:.9rem; color:var(--muted); line-height:1.6; }
</style>

<script>
const TEAM = ${JSON.stringify(TEAM)};
function openModal(i) {
  const t = TEAM[i];
  document.getElementById('modal-photo').src = t.photo;
  document.getElementById('modal-name').textContent = t.name;
  document.getElementById('modal-role').textContent = t.role;
  document.getElementById('modal-desc').textContent = t.desc;
  document.getElementById('team-modal').classList.add('open');
}
function closeModal() { document.getElementById('team-modal').classList.remove('open'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
</script>`));
});

// --- Static files & start ---
app.use(express.static(path.join(__dirname, 'public')));

if (settings.github_token) {
  newsroom.startScheduler();
  newsroom.startPublisher();

  // Weekly chronicle: check every hour, run on Sundays at ~18:00 CET
  setInterval(() => {
    const now = new Date();
    const sweHour = (now.getUTCHours() + 2) % 24; // rough CET
    if (now.getUTCDay() === 0 && sweHour === 18) {
      const lastChronicle = db.meta.get('last_chronicle_at');
      const elapsed = lastChronicle ? Date.now() - new Date(lastChronicle).getTime() : Infinity;
      if (elapsed > 6 * 3600000) { // at least 6h since last
        db.meta.set('last_chronicle_at', new Date().toISOString());
        newsroom.generateWeeklyChronicle().catch(e => console.error('[Newsroom] Chronicle error:', e.message));
      }
    }
  }, 3600000);
} else {
  console.log('[Newsroom] No github_token in settings.json — scheduler disabled.');
}

app.listen(PORT, () => console.log(`> redaktionen_ running on http://localhost:${PORT}`));
