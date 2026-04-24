const express = require('express');
const fs = require('fs');
const { marked } = require('marked');
const path = require('path');

marked.setOptions({ breaks: true, gfm: true });

// ---------------------------------------------------------------------------
// File logging — mirror stdout/stderr to data/logs/server-YYYY-MM-DD.log
// ---------------------------------------------------------------------------
(function setupFileLogging() {
  try {
    const logDir = path.join(__dirname, 'data', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    let currentDay = '';
    let stream = null;
    function getStream() {
      const day = new Date().toISOString().slice(0, 10);
      if (day !== currentDay) {
        if (stream) { try { stream.end(); } catch {} }
        currentDay = day;
        stream = fs.createWriteStream(path.join(logDir, `server-${day}.log`), { flags: 'a' });
      }
      return stream;
    }
    const tee = (origFn) => (...args) => {
      try {
        const line = args.map(a => typeof a === 'string' ? a : require('util').inspect(a, { depth: 3, breakLength: 200 })).join(' ');
        getStream().write(`[${new Date().toISOString()}] ${line}\n`);
      } catch {}
      origFn.apply(console, args);
    };
    console.log   = tee(console.log);
    console.info  = tee(console.info);
    console.warn  = tee(console.warn);
    console.error = tee(console.error);
    process.on('uncaughtException', (err) => {
      try { getStream().write(`[${new Date().toISOString()}] UNCAUGHT: ${err.stack || err}\n`); } catch {}
    });
    process.on('unhandledRejection', (reason) => {
      try { getStream().write(`[${new Date().toISOString()}] UNHANDLED: ${reason?.stack || reason}\n`); } catch {}
    });
  } catch (e) {
    console.error('Log setup failed:', e.message);
  }
})();

// Inline SVG brand icons reused across nav + share bar
const SOCIAL_ICONS_HTML = `<a href="https://mastodon.social/@redaktionen" rel="me noopener" target="_blank" aria-label="Mastodon" title="Mastodon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.58 6.186c-.316-2.372-2.367-4.243-4.799-4.608C16.37 1.517 14.836 1.4 12.002 1.4h-.022c-2.835 0-3.443.117-3.853.178-2.368.364-4.526 2.047-5.049 4.447C2.829 7.19 2.802 8.47 2.852 9.78c.071 1.879.084 3.755.253 5.625.117 1.243.321 2.476.61 3.69.54 2.247 2.74 4.117 4.893 4.884 2.305.801 4.784.934 7.16.384.262-.063.52-.136.776-.216.579-.185 1.258-.392 1.757-.754a.06.06 0 0 0 .024-.048v-1.811a.056.056 0 0 0-.069-.056c-1.503.363-3.042.546-4.588.544-2.66 0-3.376-1.274-3.581-1.805a5.584 5.584 0 0 1-.312-1.431.055.055 0 0 1 .069-.056 17.58 17.58 0 0 0 4.515.544c.364 0 .727 0 1.091-.01 1.531-.043 3.144-.121 4.651-.417.038-.008.075-.015.107-.025 2.378-.457 4.641-1.89 4.871-5.513.009-.143.03-1.496.03-1.644.001-.504.162-3.579-.024-5.465zm-3.423 9.07h-2.35V9.536c0-1.2-.504-1.814-1.527-1.814-1.125 0-1.689.729-1.689 2.17v3.143h-2.334v-3.143c0-1.441-.565-2.17-1.69-2.17-1.017 0-1.526.613-1.527 1.814v5.72H4.69V9.364c0-1.2.306-2.155.917-2.862.63-.706 1.457-1.068 2.485-1.068 1.189 0 2.087.458 2.686 1.372l.586.981.586-.981c.6-.914 1.498-1.372 2.685-1.372 1.027 0 1.855.362 2.486 1.068.61.707.916 1.661.916 2.862v5.892z"/></svg></a><a href="https://bsky.app/profile/redaktionen.bsky.social" rel="noopener" target="_blank" aria-label="Bluesky" title="Bluesky"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.203 3.462c2.726 2.046 5.66 6.194 6.737 8.42 1.076-2.226 4.01-6.374 6.736-8.42 1.967-1.476 5.156-2.618 5.156 1.02 0 .726-.417 6.1-.661 6.973-.85 3.032-3.942 3.805-6.693 3.337 4.81.82 6.035 3.532 3.393 6.244-5.022 5.151-7.221-1.29-7.784-2.942-.104-.303-.152-.445-.152-.324 0-.12-.049.021-.152.324-.564 1.652-2.762 8.093-7.785 2.942-2.641-2.712-1.416-5.425 3.394-6.244-2.75.468-5.843-.305-6.693-3.337-.244-.872-.66-6.247-.66-6.972 0-3.64 3.188-2.497 5.155-1.02z"/></svg></a><a href="https://twitter.com/Redaktionen_net" rel="noopener" target="_blank" aria-label="X" title="X (Twitter)"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a><a href="https://discord.gg/d5TfzWaMGp" rel="noopener" target="_blank" aria-label="Discord" title="Discord"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3.2a.074.074 0 0 0-.079.037c-.34.607-.719 1.398-.984 2.02a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.997-2.02.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 5.164 4.37a.07.07 0 0 0-.032.027C1.533 9.046.57 13.58 1.043 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.105 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.04.106c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg></a>`;

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

// Cache-bust local image URLs by appending ?v=<mtime-epoch>.
// Prevents Cloudflare/browser from serving stale hero images after regeneration.
// Skips external URLs and already-versioned ones.
function cacheBust(imageUrl) {
  if (!imageUrl) return imageUrl;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (imageUrl.includes('?')) return imageUrl;
  try {
    const rel = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
    const abs = path.join(__dirname, 'public', rel);
    const st = fs.statSync(abs);
    return `${imageUrl}?v=${Math.floor(st.mtimeMs)}`;
  } catch {
    return imageUrl;
  }
}
function bylineHtml(byline, size) {
  const name = byline || 'Redaktionen';
  const photo = BYLINE_PHOTOS[name];
  const sz = size || 28;
  if (!photo) return name;
  return `<img src="${photo}" alt="" style="width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;border:1px solid var(--border);">${name}`;
}

// Hero image credit caption — distinguishes Brave-sourced images from AI-generated
function imageCreditHtml(imagePrompt) {
  const p = String(imagePrompt || '');
  // Brave search images are saved with prompts like:
  //   "Brave product: RTX 5090" / "Brave software: ChatGPT" / "Brave company: Nvidia"
  //   Legacy: "Product image: <name>"
  let label = null;
  const braveMatch = p.match(/^Brave\s+(product|software|ai_model|company|person|event):\s*(.+)$/i);
  if (braveMatch) {
    const type = braveMatch[1].toLowerCase();
    const subject = braveMatch[2].trim();
    const typeLabel = {
      product: 'Produktbild',
      software: 'Logotyp/skärmbild',
      ai_model: 'Logotyp',
      company: 'Logotyp',
      person: 'Pressbild',
      event: 'Pressbild',
    }[type] || 'Bild';
    label = `${typeLabel} · ${subject} · via Brave Search`;
  } else if (/^Product image:/i.test(p)) {
    label = `Produktbild · ${p.replace(/^Product image:\s*/i, '').trim()} · via Brave Search`;
  } else if (p.trim()) {
    // Anything else is an AI-generated image prompt
    label = 'AI-genererad bild';
  } else {
    return '';
  }
  return `<p class="hero-credit"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M9 5 10 3h4l1 2"/></svg>${label}</p>`;
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

app.use(express.json({ limit: '5mb' }));

// =====================================================================
// NEWSROOM — AI-driven tech news
// =====================================================================
const db = require('./newsroom-db');
const newsroom = require('./newsroom');
const { moderateComment } = require('./comment-moderator');

function ipHash(req) {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  return require('crypto').createHash('sha256').update('rdk:' + ip).digest('hex').slice(0, 32);
}
function emailHash(email) {
  if (!email) return null;
  return require('crypto').createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

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

// --- Sitemap (Google News + standard) ---
app.get('/sitemap.xml', (req, res) => {
  const articles = db.articles.latest(1000);
  const escXml = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const toIso = s => { try { return new Date(utc(s)).toISOString(); } catch { return new Date().toISOString(); } };
  const twoDaysAgo = Date.now() - 48 * 3600 * 1000;
  const urls = articles.map(a => {
    const loc = `https://redaktionen.net/artikel/${a.id}`;
    const lastmod = toIso(a.published_at || a.created_at);
    const pubTime = new Date(utc(a.published_at) || utc(a.created_at)).getTime();
    const isFresh = pubTime >= twoDaysAgo;
    const news = isFresh ? `
    <news:news>
      <news:publication>
        <news:name>Redaktionen.net</news:name>
        <news:language>sv</news:language>
      </news:publication>
      <news:publication_date>${toIso(a.published_at || a.created_at)}</news:publication_date>
      <news:title>${escXml(a.title)}</news:title>
    </news:news>` : '';
    const img = a.image_url ? `
    <image:image><image:loc>${escXml(a.image_url.startsWith('http') ? a.image_url : 'https://redaktionen.net' + cacheBust(a.image_url))}</image:loc></image:image>` : '';
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>${news}${img}
  </url>`;
  }).join('\n');
  const staticUrls = [
    { loc: 'https://redaktionen.net/', pri: '1.0' },
    { loc: 'https://redaktionen.net/tech', pri: '0.8' },
    { loc: 'https://redaktionen.net/hardware', pri: '0.8' },
    { loc: 'https://redaktionen.net/ai', pri: '0.8' },
    { loc: 'https://redaktionen.net/enterprise', pri: '0.8' },
    { loc: 'https://redaktionen.net/om-oss', pri: '0.5' },
    { loc: 'https://redaktionen.net/kontakt', pri: '0.5' },
    { loc: 'https://redaktionen.net/metodik', pri: '0.5' },
  ].map(u => `  <url><loc>${u.loc}</loc><priority>${u.pri}</priority></url>`).join('\n');

  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${staticUrls}
${urls}
</urlset>`);
});

// --- robots.txt ---
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /artikel/*/preview

Sitemap: https://redaktionen.net/sitemap.xml
`);
});

// --- Search API ---
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json([]);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const articles = db.articles.search(q, limit);
  res.json(articles.map(a => ({ ...fixDates(a), image_url: cacheBust(a.image_url), source_urls: JSON.parse(a.source_urls || '[]') })));
});

// --- Public article API ---
app.get('/api/articles', (req, res) => {
  const cat = req.query.category;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const articles = cat ? db.articles.byCategory(cat, limit) : db.articles.latest(limit);
  res.json(articles.map(a => ({ ...fixDates(a), image_url: cacheBust(a.image_url), source_urls: JSON.parse(a.source_urls || '[]') })));
});

app.get('/api/articles/most-viewed', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 20);
  const days = Math.min(parseInt(req.query.days) || 7, 30);
  const articles = db.articles.mostViewed(limit, days);
  res.json(articles.map(a => ({ ...fixDates(a), image_url: cacheBust(a.image_url), source_urls: JSON.parse(a.source_urls || '[]') })));
});

app.get('/api/articles/most-commented', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 5, 20);
  const days = Math.min(parseInt(req.query.days) || 30, 90);
  const articles = db.articles.mostCommented(limit, days);
  res.json(articles.map(a => ({ ...fixDates(a), image_url: cacheBust(a.image_url), source_urls: JSON.parse(a.source_urls || '[]'), comment_count: a.comment_count })));
});

// --- Newsletter "Dagens 5" ---
const crypto = require('crypto');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/newsletter/subscribe', express.json(), (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Ogiltig e-postadress.' });
  }
  try {
    const existing = db.newsletter.getByEmail(email);
    if (existing && !existing.unsubscribed_at) {
      return res.json({ ok: true, message: 'Du är redan prenumerant.' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    db.newsletter.subscribe(email, token);
    res.json({ ok: true, message: 'Tack! Du får Dagens 5 kl. 08:00 varje morgon.' });
  } catch (err) {
    console.error('[newsletter] subscribe error:', err);
    res.status(500).json({ error: 'Något gick fel.' });
  }
});

app.get('/api/newsletter/unsubscribe', (req, res) => {
  const token = String(req.query.token || '');
  if (!token) return res.status(400).send('Ogiltig avprenumerations-länk.');
  const sub = db.newsletter.getByToken(token);
  if (!sub) return res.status(404).send('Prenumeration hittades inte.');
  db.newsletter.unsubscribeByToken(token);
  res.send(`<!doctype html><meta charset="utf-8"><title>Avprenumererad</title><body style="font-family:system-ui;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;max-width:500px;padding:2rem"><h1 style="color:#58a6ff">Avprenumererad</h1><p>Du får inte längre Dagens 5 från redaktionen.net.</p><p><a href="/" style="color:#58a6ff">← Tillbaka till redaktionen.net</a></p></div>`);
});

// --- Ad banner config (top banner: "Vill du synas här?") ---
const DEFAULT_AD_BANNER = { mode: 'default', image: null, image_mobile: null, url: '/kontakt', alt: '' };
function getAdBanner() {
  try {
    const raw = db.meta.get('ad_banner_config');
    if (!raw) return { ...DEFAULT_AD_BANNER };
    return { ...DEFAULT_AD_BANNER, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_AD_BANNER }; }
}

app.get('/api/ad-banner', (req, res) => {
  res.json(getAdBanner());
});

function adBannerHtml(cfg = getAdBanner()) {
  const url = cfg.url || '/kontakt';
  if (cfg.mode === 'custom' && cfg.image) {
    const alt = (cfg.alt || 'Annons').replace(/"/g, '&quot;');
    const isExt = url.startsWith('http');
    const picture = cfg.image_mobile
      ? `<picture><source media="(max-width: 640px)" srcset="${cfg.image_mobile}"><img src="${cfg.image}" alt="${alt}" loading="lazy"></picture>`
      : `<img src="${cfg.image}" alt="${alt}" loading="lazy">`;
    return `<a href="${url}" class="ad-banner ad-banner-img"${isExt ? ' target="_blank" rel="sponsored noopener"' : ''}>${picture}</a>`;
  }
  return `<div class="ad-banner">Vill du synas här? 🤖 <a href="${url}">Kontakta oss</a></div>`;
}

app.get('/api/admin/ad-banner', checkAdmin, (req, res) => {
  res.json(getAdBanner());
});

app.put('/api/admin/ad-banner', checkAdmin, (req, res) => {
  const body = req.body || {};
  const cfg = getAdBanner();

  const mode = body.mode === 'custom' ? 'custom' : 'default';
  const url = (body.url || '/kontakt').toString().trim().slice(0, 500) || '/kontakt';
  const alt = (body.alt || '').toString().trim().slice(0, 200);

  const adsDir = path.join(__dirname, 'public', 'ads');
  if (!fs.existsSync(adsDir)) fs.mkdirSync(adsDir, { recursive: true });

  function handleImage(field, current) {
    const v = body[field];
    if (typeof v === 'string' && v.startsWith('data:image/png;base64,')) {
      const b64 = v.slice('data:image/png;base64,'.length);
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > 4 * 1024 * 1024) throw new Error('Bild större än 4 MB.');
      const fname = `${field === 'image_mobile' ? 'banner-mobile' : 'banner'}-${Date.now()}.png`;
      fs.writeFileSync(path.join(adsDir, fname), buf);
      return `/ads/${fname}`;
    }
    if (v === null) return null;
    return current;
  }

  let image, image_mobile;
  try {
    image = handleImage('image', cfg.image);
    image_mobile = handleImage('image_mobile', cfg.image_mobile);
  } catch (err) {
    return res.status(err.message.includes('4 MB') ? 413 : 400).json({ error: err.message });
  }

  const next = { mode, image, image_mobile, url, alt };
  db.meta.set('ad_banner_config', JSON.stringify(next));
  res.json(next);
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
    image_prompt: req.body.image_prompt ?? article.image_prompt,
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

  // Fire-and-forget social broadcast (Mastodon/Bluesky/Telegram/Discord/X)
  try {
    const social = require('./social-poster');
    const pub = db.articles.get(req.params.id);
    if (pub) social.broadcast(pub).catch(e => console.error('[Admin] social.broadcast error:', e.message));
  } catch (e) {
    console.error('[Admin] social.broadcast load error:', e.message);
  }

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
  const pendingComments = db.comments.pendingCount();
  res.json({ counts, recentLogs: logs, pendingComments });
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

// "Needs attention" — recent published articles with issues worth reviewing
app.get('/api/admin/needs-attention', checkAdmin, (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 7, 30);
  const cutoff = `datetime('now', '-${days} days')`;
  const rawDb = db.getDb();
  const issues = new Map(); // id → { article, issues: [] }

  const add = (article, tag, detail) => {
    if (!article) return;
    if (!issues.has(article.id)) {
      issues.set(article.id, {
        id: article.id,
        title: article.title,
        category: article.category,
        image_url: article.image_url,
        published_at: article.published_at,
        issues: [],
      });
    }
    issues.get(article.id).issues.push({ tag, detail });
  };

  // 1. Published without image
  const noImg = rawDb.prepare(
    `SELECT * FROM articles WHERE status = 'approved' AND (image_url IS NULL OR image_url = '') AND published_at > ${cutoff} ORDER BY published_at DESC`
  ).all();
  noImg.forEach(a => add(a, 'no_image', 'Saknar hjältebild'));

  // 2. Broadcast failures (at least one platform in 'failed' state)
  const bcFails = rawDb.prepare(
    `SELECT a.*, GROUP_CONCAT(b.platform || ':' || COALESCE(b.detail, '')) as fail_detail
     FROM broadcast_log b
     JOIN articles a ON a.id = b.article_id
     WHERE b.status = 'failed' AND b.created_at > ${cutoff}
     GROUP BY a.id
     ORDER BY b.created_at DESC`
  ).all();
  bcFails.forEach(a => add(a, 'broadcast_failed', a.fail_detail));

  // 3. Fact checker flagged issues (agent='fact_checker' with non-approved output)
  // Match on output containing "issues" array with entries — simplified: look for verdict != 'approved'
  const factFails = rawDb.prepare(
    `SELECT a.*, l.output_text as fact_output
     FROM agent_log l
     JOIN articles a ON a.id = l.article_id
     WHERE l.agent = 'fact_checker' AND l.created_at > ${cutoff}
       AND (l.output_text LIKE '%"verdict":"rejected"%' OR l.output_text LIKE '%"verdict":"needs_rewrite"%')
     ORDER BY l.created_at DESC`
  ).all();
  factFails.forEach(a => add(a, 'fact_check_warning', 'Faktakoll flaggade problem'));

  const list = Array.from(issues.values()).sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
  res.json({ days, count: list.length, items: list });
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
    // Always skip Brave on regenerate — user explicitly wants something different
    // than what they saw. Brave would return the same deterministic result.
    console.log(`[Admin] Regenerating image for article ${req.params.id} (AI only): ${article.title}`);
    const imgResult = await newsroom.graphicDesigner(req.params.id, { skipBrave: true });
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
function pageShell(title, activeCat, bodyHtml, headExtra) {
  const catLabels = { tech: 'Tech', hardware: 'Hardware', ai: 'AI', enterprise: 'Enterprise' };
  return `<!DOCTYPE html><html lang="sv"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Redaktionen.net</title>
<link rel="alternate" type="application/rss+xml" title="Redaktionen.net RSS" href="/rss">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1715654756257886" crossorigin="anonymous"></script>
${headExtra || ''}
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
  .nav-right { display: flex; align-items: center; gap: 14px; }
  .nav-social { display: flex; align-items: center; gap: 10px; padding-right: 12px; border-right: 1px solid var(--border); }
  .nav-social a { display: inline-flex; align-items: center; justify-content: center; color: var(--muted); transition: color .2s, transform .2s; }
  .nav-social a:hover { color: var(--accent); transform: translateY(-1px); }
  .nav-social svg { width: 15px; height: 15px; }
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
  a.ad-banner.ad-banner-img { display: block; padding: 0; background: transparent; border: 1px solid var(--border); overflow: hidden; line-height: 0; }
  a.ad-banner.ad-banner-img img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
  .ad-slot { background: var(--bg-elevated); border: 1px dashed var(--border); border-radius: var(--radius); padding: 20px; margin: 20px 0; text-align: center; min-height: 100px; display: flex; align-items: center; justify-content: center; }
  footer { max-width: 1360px; margin: 0 auto; padding: 0 40px 40px; color: var(--light); font-size: .8rem; }
  .footer-inner { border-top: 1px solid var(--border); padding-top: 32px; display: flex; flex-direction: column; align-items: center; gap: 18px; }
  .footer-brand { font-family: var(--mono); font-size: 1rem; color: var(--text); font-weight: 700; }
  .footer-brand .prompt { color: var(--accent); }
  .footer-nav { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; justify-content: center; }
  .footer-nav a { color: var(--muted); text-decoration: none; font-weight: 500; padding: 4px 10px; border-radius: 6px; transition: all .2s; display: inline-flex; align-items: center; gap: 6px; }
  .footer-nav a svg { width: 14px; height: 14px; flex-shrink: 0; }
  .footer-nav a::after { content: '_'; color: var(--green); margin-left: 1px; opacity: 0; }
  .footer-nav a:hover { background: var(--accent-dim); color: var(--text); }
  .footer-nav a:hover::after { opacity: 1; animation: blink 1s step-end infinite; }
  .footer-nav .sep { color: var(--border); font-size: .7rem; user-select: none; }
  .footer-social { display: flex; gap: 10px; justify-content: center; margin-top: 4px; }
  .footer-social a { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--muted); transition: all .2s; }
  .footer-social a:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-dim); transform: translateY(-2px); }
  .footer-social svg { width: 16px; height: 16px; }
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
    <div class="nav-right">
      <div class="nav-social">${SOCIAL_ICONS_HTML}</div>
      <div class="header-search">
        <input id="search-input" type="text" placeholder="Sök artiklar..." oninput="handleSearch(event)" onfocus="if(this.value.trim().length>=2)document.getElementById('search-results').classList.add('open')">
        <span class="search-icon">⌕</span>
        <div id="search-results" class="header-search-results"></div>
      </div>
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
<nav class="footer-nav">
  <a href="/kontakt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>Kontakt</a>
  <a href="/om-oss"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Om oss</a>
  <a href="/metodik"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>Metodik</a>
  <a href="/rss"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>RSS</a>
</nav>
<div class="footer-tagline">AI-driven teknikredaktion &middot; &copy; 2026 redaktionen.net</div>
</div></footer>
</body></html>`;
}

// --- Comments: helpers + endpoints ---
function escCommentHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function renderComment(c) {
  const initials = initialsFor(c.author_name);
  const color = colorForName(c.author_name);
  const body = escCommentHtml(c.body).replace(/\n/g, '<br>');
  const when = formatPublicTimestamp(c.created_at, { long: false });
  return `<article class="comment" data-id="${c.id}">
    <div class="comment-avatar" style="background:${color}" aria-hidden="true">${escCommentHtml(initials)}</div>
    <div class="comment-body">
      <header class="comment-head"><strong>${escCommentHtml(c.author_name)}</strong><time>${when}</time></header>
      <div class="comment-text">${body}</div>
    </div>
  </article>`;
}

function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorForName(name) {
  // Deterministic brand-tone color from a small curated palette.
  const palette = ['#58a6ff', '#3fb950', '#d29922', '#bc8cff', '#ff7b72', '#2ea5a5', '#f78166', '#79c0ff'];
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// POST /api/comments/:articleId — submit a comment
app.post('/api/comments/:articleId', async (req, res) => {
  try {
    const articleId = parseInt(req.params.articleId, 10);
    const article = db.articles.get(articleId);
    if (!article || article.status !== 'approved') return res.status(404).json({ error: 'Artikel finns inte' });

    const { name, email, body, website } = req.body || {};

    // Honeypot: bots fill this, humans never see it.
    if (website && website.length > 0) return res.json({ status: 'approved' }); // lie to bot

    const cleanName = String(name || '').trim();
    const cleanBody = String(body || '').trim();
    const cleanEmail = String(email || '').trim();

    if (cleanName.length < 2 || cleanName.length > 60) return res.status(400).json({ error: 'Namn krävs (2-60 tecken)' });
    if (cleanBody.length < 3 || cleanBody.length > 4000) return res.status(400).json({ error: 'Kommentar måste vara 3–4000 tecken' });
    if (cleanEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return res.status(400).json({ error: 'Ogiltig e-post' });

    // Rate limit: max 3 comments per IP per 5 minutes
    const iph = ipHash(req);
    const recent = db.comments.recentFromIp(iph, 300);
    if (recent >= 3) return res.status(429).json({ error: 'För många kommentarer från din IP. Försök igen om några minuter.' });

    // AI moderation (async but fast — ~1-2s)
    const verdict = await moderateComment({ articleTitle: article.title, body: cleanBody });

    if (verdict.verdict === 'reject') {
      // Log but don't save; tell the poster it went through (silent drop)
      console.log(`[Comments] rejected for article ${articleId} by ${cleanName}: ${verdict.reason}`);
      return res.json({ status: 'approved' });
    }

    const status = verdict.verdict === 'approve' ? 'approved' : 'pending';
    db.comments.create({
      article_id: articleId,
      author_name: cleanName,
      author_email_hash: emailHash(cleanEmail),
      body: cleanBody,
      ip_hash: iph,
      status,
      ai_verdict: verdict.verdict,
      ai_reason: verdict.reason,
    });

    console.log(`[Comments] ${status} for article ${articleId} by ${cleanName}: ${verdict.reason}`);
    res.json({ status });
  } catch (e) {
    console.log('[Comments] error:', e.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/comments/:articleId — fetch approved thread
app.get('/api/comments/:articleId', (req, res) => {
  const articleId = parseInt(req.params.articleId, 10);
  const list = db.comments.forArticle(articleId);
  res.json(list);
});

// --- Admin comment moderation ---
app.get('/api/admin/comments/pending', checkAdmin, (req, res) => {
  res.json(db.comments.pending());
});
app.get('/api/admin/comments', checkAdmin, (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
  const offset = parseInt(req.query.offset, 10) || 0;
  res.json(db.comments.all(limit, offset));
});
app.post('/api/admin/comments/:id/approve', checkAdmin, (req, res) => {
  db.comments.setStatus(parseInt(req.params.id, 10), 'approved');
  res.json({ ok: true });
});
app.post('/api/admin/comments/:id/reject', checkAdmin, (req, res) => {
  db.comments.setStatus(parseInt(req.params.id, 10), 'spam');
  res.json({ ok: true });
});
app.delete('/api/admin/comments/:id', checkAdmin, (req, res) => {
  db.comments.delete(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// --- Article page ---
app.get('/artikel/:id', (req, res) => {
  const article = db.articles.get(req.params.id);
  if (!article || article.status !== 'approved') return res.status(404).send('Artikeln hittades inte');

  // Track view
  db.articles.incrementViews(req.params.id);

  const sources = JSON.parse(article.source_urls || '[]');
  const catName = { tech: 'Tech', hardware: 'Hardware', ai: 'AI', enterprise: 'Enterprise' }[article.category] || article.category;
  const bodyHtml = marked.parse(article.body || '');

  const url = `https://redaktionen.net/artikel/${article.id}`;
  const imgBust = cacheBust(article.image_url);
  const imgAbs = article.image_url
    ? (article.image_url.startsWith('http') ? article.image_url : `https://redaktionen.net${imgBust}`)
    : 'https://redaktionen.net/about-flow.png';
  const descRaw = (article.summary || '').replace(/\s+/g, ' ').trim();
  const desc = descRaw.length > 180 ? descRaw.slice(0, 177) + '…' : descRaw;
  const escAttr = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const publishedIso = new Date(utc(article.published_at) || utc(article.created_at)).toISOString();
  const modifiedIso = new Date(utc(article.updated_at) || utc(article.published_at) || utc(article.created_at)).toISOString();
  const authorName = article.byline || 'Redaktionen';

  const commentCount = db.comments.countForArticle(article.id);
  const articleComments = db.comments.forArticle(article.id);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: article.title,
    description: descRaw,
    image: [imgAbs],
    datePublished: publishedIso,
    dateModified: modifiedIso,
    author: [{ '@type': 'Person', name: authorName, url: 'https://redaktionen.net/om-oss' }],
    publisher: {
      '@type': 'Organization',
      name: 'Redaktionen.net',
      url: 'https://redaktionen.net',
      logo: { '@type': 'ImageObject', url: 'https://redaktionen.net/about-flow.png' },
    },
    articleSection: catName,
    inLanguage: 'sv-SE',
    commentCount,
  };
  // Safe inline JSON-LD: escape </script>
  const jsonLdStr = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  const headExtra = `
<meta name="description" content="${escAttr(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escAttr(article.title)}">
<meta property="og:description" content="${escAttr(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Redaktionen.net">
<meta property="og:locale" content="sv_SE">
<meta property="og:image" content="${escAttr(imgAbs)}">
<meta property="article:published_time" content="${publishedIso}">
<meta property="article:modified_time" content="${modifiedIso}">
<meta property="article:section" content="${escAttr(catName)}">
<meta property="article:author" content="${escAttr(authorName)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(article.title)}">
<meta name="twitter:description" content="${escAttr(desc)}">
<meta name="twitter:image" content="${escAttr(imgAbs)}">
<script type="application/ld+json">${jsonLdStr}</script>`;

  res.send(pageShell(article.title, article.category, `
<style>
  .article-wrap { max-width: 780px; margin: 0 auto; padding: 8px 40px 80px; }
  @media (max-width: 900px) { .article-wrap { padding: 8px 16px 60px; } }
  .cat-tag { display: inline-block; background: var(--accent); color: var(--bg); padding: 3px 12px; border-radius: 6px; font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; font-family: var(--mono); line-height: 1; vertical-align: baseline; white-space: nowrap; position: relative; top: -.07em; margin-right: .45rem; }
  .cat-tag a { color: var(--bg); text-decoration: none; }
  h1.title { font-family: var(--sans); font-size: 2.2rem; font-weight: 700; line-height: 1.25; margin: 0 0 16px; letter-spacing: -.5px; }
  .summary { font-size: 1.1rem; color: var(--muted); line-height: 1.6; margin-bottom: 24px; font-weight: 500; }
  .meta { color: var(--light); font-size: .82rem; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .meta > a { color: var(--light); }
  .ai-tag { display: inline-flex; align-items: center; gap: 4px; background: var(--accent-dim); color: var(--accent); padding: 2px 8px; border-radius: 999px; font-size: .68rem; font-weight: 700; letter-spacing: .3px; font-family: var(--mono); white-space: nowrap; }
  .ai-tag svg { flex-shrink: 0; }
  .article-disclosure { display: flex; gap: 10px; align-items: flex-start; padding: 10px 14px; background: var(--bg-elevated); border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: 6px; font-size: .78rem; color: var(--muted); line-height: 1.5; margin: 0 0 28px; }
  .article-disclosure svg { flex-shrink: 0; color: var(--accent); margin-top: 2px; }
  .article-disclosure a { color: var(--accent); text-decoration: underline; }
  .hero-img { width: 100%; border-radius: var(--radius); margin-bottom: 10px; }
  .hero-credit { font-family: var(--mono); font-size: .7rem; color: var(--light); margin: 0 0 32px; letter-spacing: .02em; display: flex; align-items: center; gap: 6px; }
  .hero-credit svg { flex-shrink: 0; }
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
  .share-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--muted); text-decoration: none; cursor: pointer; transition: all .15s; padding: 0; }
  .share-btn svg { width: 16px; height: 16px; }
  .share-btn:hover { color: var(--accent); background: var(--accent-dim); border-color: var(--accent); }
  .share-copy .ic-check { display: none; }
  .share-copy.copied .ic-link { display: none; }
  .share-copy.copied .ic-check { display: block; color: var(--green); }
  /* Comments */
  .comments-section { margin-top: 48px; padding-top: 28px; border-top: 1px solid var(--border); }
  .comments-title { font-family: var(--mono); font-size: 1rem; font-weight: 700; color: var(--text); letter-spacing: .3px; margin: 0 0 20px; }
  .comments-count { color: var(--muted); font-weight: 400; }
  .comments-empty { color: var(--muted); font-size: .9rem; padding: 16px 0; font-style: italic; }
  .comment { display: flex; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--border); }
  .comment:last-child { border-bottom: none; }
  .comment-avatar { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; background: var(--bg-elevated); display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 700; font-size: .95rem; color: #0d1117; letter-spacing: .5px; user-select: none; }
  .comment-body { flex: 1; min-width: 0; }
  .comment-head { display: flex; gap: 10px; align-items: baseline; margin-bottom: 4px; font-size: .85rem; }
  .comment-head strong { color: var(--text); font-weight: 600; }
  .comment-head time { color: var(--light); font-family: var(--mono); font-size: .72rem; }
  .comment-text { color: var(--text); font-size: .95rem; line-height: 1.55; word-wrap: break-word; }
  .comment-form { margin-top: 24px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
  .comment-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .comment-form input, .comment-form textarea { width: 100%; background: var(--bg); border: 1px solid var(--border); color: var(--text); font-family: var(--sans); font-size: .92rem; padding: 9px 11px; border-radius: 6px; box-sizing: border-box; }
  .comment-form textarea { resize: vertical; font-family: var(--sans); }
  .comment-form input:focus, .comment-form textarea:focus { outline: none; border-color: var(--accent); }
  .comment-form .hp-field { position: absolute; left: -9999px; opacity: 0; pointer-events: none; }
  .comment-form-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; flex-wrap: wrap; }
  .comment-form-note { font-size: .72rem; color: var(--light); flex: 1; }
  .comment-submit { background: var(--accent); color: var(--bg); border: none; padding: 9px 18px; border-radius: 6px; font-weight: 700; font-size: .85rem; cursor: pointer; font-family: var(--sans); }
  .comment-submit:hover { opacity: .9; }
  .comment-submit:disabled { opacity: .5; cursor: not-allowed; }
  .comment-status { margin-top: 10px; font-size: .82rem; min-height: 1em; }
  .comment-status.ok { color: var(--green, #3fb950); }
  .comment-status.err { color: #f85149; }
  @media (max-width: 540px) { .comment-form-row { grid-template-columns: 1fr; } }
</style>
<div class="article-wrap">
  <h1 class="title">${article.title}</h1>
  <p class="summary">${article.summary}</p>
  <div class="meta">${bylineHtml(article.byline, 28)}<span class="ai-tag" title="AI-genererad journalistik – granskad av människa"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 9v6M15 9v6M9 12h6"/></svg>AI-assisterad</span> · ${formatPublicTimestamp(article.published_at || article.created_at, { long: true, allowTodayLabel: !!article.published_at })}</div>
  <div class="article-disclosure">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
    <div>Artikeln är skapad av en AI-redaktion baserat på publika nyhetskällor och granskad av en mänsklig redaktör. Faktafel kan förekomma – kontrollera mot originalkällan. <a href="/metodik">Så arbetar vi</a></div>
  </div>
  ${article.image_url ? `<img class="hero-img" src="${cacheBust(article.image_url)}" alt="${article.title}">${imageCreditHtml(article.image_prompt)}` : ''}
  <div class="body">${bodyHtml}</div>
  <div class="share-bar">
    <span class="share-label">// Dela</span>
    <a href="https://twitter.com/intent/tweet?url=https://redaktionen.net/artikel/${article.id}&text=${encodeURIComponent(article.title)}" target="_blank" rel="noopener" class="share-btn" aria-label="Dela på X" title="Dela på X"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
    <a href="https://bsky.app/intent/compose?text=${encodeURIComponent(article.title + ' https://redaktionen.net/artikel/' + article.id)}" target="_blank" rel="noopener" class="share-btn" aria-label="Dela på Bluesky" title="Dela på Bluesky"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.203 3.462c2.726 2.046 5.66 6.194 6.737 8.42 1.076-2.226 4.01-6.374 6.736-8.42 1.967-1.476 5.156-2.618 5.156 1.02 0 .726-.417 6.1-.661 6.973-.85 3.032-3.942 3.805-6.693 3.337 4.81.82 6.035 3.532 3.393 6.244-5.022 5.151-7.221-1.29-7.784-2.942-.104-.303-.152-.445-.152-.324 0-.12-.049.021-.152.324-.564 1.652-2.762 8.093-7.785 2.942-2.641-2.712-1.416-5.425 3.394-6.244-2.75.468-5.843-.305-6.693-3.337-.244-.872-.66-6.247-.66-6.972 0-3.64 3.188-2.497 5.155-1.02z"/></svg></a>
    <a href="https://mastodonshare.com/?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent('https://redaktionen.net/artikel/' + article.id)}" target="_blank" rel="noopener" class="share-btn" aria-label="Dela på Mastodon" title="Dela på Mastodon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.58 6.186c-.316-2.372-2.367-4.243-4.799-4.608C16.37 1.517 14.836 1.4 12.002 1.4h-.022c-2.835 0-3.443.117-3.853.178-2.368.364-4.526 2.047-5.049 4.447C2.829 7.19 2.802 8.47 2.852 9.78c.071 1.879.084 3.755.253 5.625.117 1.243.321 2.476.61 3.69.54 2.247 2.74 4.117 4.893 4.884 2.305.801 4.784.934 7.16.384.262-.063.52-.136.776-.216.579-.185 1.258-.392 1.757-.754a.06.06 0 0 0 .024-.048v-1.811a.056.056 0 0 0-.069-.056c-1.503.363-3.042.546-4.588.544-2.66 0-3.376-1.274-3.581-1.805a5.584 5.584 0 0 1-.312-1.431.055.055 0 0 1 .069-.056 17.58 17.58 0 0 0 4.515.544c.364 0 .727 0 1.091-.01 1.531-.043 3.144-.121 4.651-.417.038-.008.075-.015.107-.025 2.378-.457 4.641-1.89 4.871-5.513.009-.143.03-1.496.03-1.644.001-.504.162-3.579-.024-5.465zm-3.423 9.07h-2.35V9.536c0-1.2-.504-1.814-1.527-1.814-1.125 0-1.689.729-1.689 2.17v3.143h-2.334v-3.143c0-1.441-.565-2.17-1.69-2.17-1.017 0-1.526.613-1.527 1.814v5.72H4.69V9.364c0-1.2.306-2.155.917-2.862.63-.706 1.457-1.068 2.485-1.068 1.189 0 2.087.458 2.686 1.372l.586.981.586-.981c.6-.914 1.498-1.372 2.685-1.372 1.027 0 1.855.362 2.486 1.068.61.707.916 1.661.916 2.862v5.892z"/></svg></a>
    <a href="https://www.linkedin.com/sharing/share-offsite/?url=https://redaktionen.net/artikel/${article.id}" target="_blank" rel="noopener" class="share-btn" aria-label="Dela på LinkedIn" title="Dela på LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=https://redaktionen.net/artikel/${article.id}" target="_blank" rel="noopener" class="share-btn" aria-label="Dela på Facebook" title="Dela på Facebook"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>
    <a href="mailto:?subject=${encodeURIComponent(article.title)}&body=${encodeURIComponent('Läs artikeln: https://redaktionen.net/artikel/' + article.id)}" class="share-btn" aria-label="Dela via e-post" title="Dela via e-post"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg></a>
    <button class="share-btn share-copy" onclick="(function(b){navigator.clipboard.writeText('https://redaktionen.net/artikel/${article.id}');b.classList.add('copied');setTimeout(()=>b.classList.remove('copied'),1500);})(this)" aria-label="Kopiera länk" title="Kopiera länk"><svg class="ic-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><svg class="ic-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></button>
  </div>
  ${sources.length ? `<div class="sources"><h3>// Källor</h3>${sources.map(u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).join('<br>')}</div>` : ''}
  <section id="kommentarer" class="comments-section">
    <h2 class="comments-title">// Kommentarer <span class="comments-count">(${commentCount})</span></h2>
    <div id="comments-list" class="comments-list">
      ${articleComments.length === 0
        ? '<div class="comments-empty">Bli först att kommentera.</div>'
        : articleComments.map(c => renderComment(c)).join('')}
    </div>
    <form id="comment-form" class="comment-form" data-article="${article.id}">
      <div class="comment-form-row">
        <input type="text" name="name" placeholder="Ditt namn" required maxlength="60" autocomplete="name">
        <input type="email" name="email" placeholder="E-post (valfritt, visas ej)" maxlength="120" autocomplete="email">
      </div>
      <textarea name="body" placeholder="Skriv en kommentar…" required minlength="3" maxlength="4000" rows="4"></textarea>
      <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="comment-form-footer">
        <div class="comment-form-note">Kommentarer modereras automatiskt av AI. Oartiga eller osakliga inlägg avvisas.</div>
        <button type="submit" class="comment-submit">Skicka</button>
      </div>
      <div id="comment-status" class="comment-status"></div>
    </form>
  </section>
</div>
<script>
(function(){
  var form = document.getElementById('comment-form');
  if (!form) return;
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    var status = document.getElementById('comment-status');
    var btn = form.querySelector('button[type=submit]');
    var articleId = form.dataset.article;
    var fd = new FormData(form);
    var data = {
      name: (fd.get('name') || '').toString().trim(),
      email: (fd.get('email') || '').toString().trim(),
      body: (fd.get('body') || '').toString().trim(),
      website: (fd.get('website') || '').toString(),
    };
    btn.disabled = true;
    status.textContent = 'Skickar…';
    status.className = 'comment-status';
    try {
      var r = await fetch('/api/comments/' + articleId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      var j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Fel');
      if (j.status === 'approved') {
        status.textContent = 'Publicerad! Laddar om…';
        status.className = 'comment-status ok';
        setTimeout(function(){ location.reload(); }, 800);
      } else if (j.status === 'pending') {
        status.textContent = 'Tack! Kommentaren granskas innan publicering.';
        status.className = 'comment-status ok';
        form.reset();
      } else {
        status.textContent = 'Kommentaren kunde inte publiceras.';
        status.className = 'comment-status err';
      }
    } catch (err) {
      status.textContent = (err && err.message) || 'Något gick fel.';
      status.className = 'comment-status err';
      console.error('[comment submit]', err);
    } finally {
      btn.disabled = false;
    }
  });
})();
</script>`, headExtra));
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
  .hero-img { width: 100%; border-radius: var(--radius); margin-bottom: 10px; }
  .hero-credit { font-family: var(--mono); font-size: .7rem; color: var(--light); margin: 0 0 32px; letter-spacing: .02em; display: flex; align-items: center; gap: 6px; }
  .hero-credit svg { flex-shrink: 0; }
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
  ${article.image_url ? `<img class="hero-img" src="${cacheBust(article.image_url)}" alt="${article.title}">${imageCreditHtml(article.image_prompt)}` : ''}
  <div class="body">${bodyHtml}</div>
  ${sources.length ? `<div class="sources"><h3>// Källor</h3>${sources.map(u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).join('<br>')}</div>` : ''}
</div>`));
});

// --- Category pages ---
function categoryPage(cat, catLabel) {
  return (req, res) => {
    const articles = db.articles.byCategory(cat, 30);
    const empty = articles.length === 0 ? '<p class="empty">Inga publicerade artiklar ännu. Redaktionen arbetar på det!</p>' : '';

    const esc = s => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function fmtDate(a) {
      return formatPublicTimestamp(a.published_at || a.created_at, { long: true, allowTodayLabel: !!a.published_at });
    }

    const feedHtml = articles.map((a, i) => {
      const date = fmtDate(a);
      const body = `
          <div class="body">
            <div class="card-topline"><span class="cat-tag cat-${a.category}">${esc(catLabel)}</span><span>${date}</span></div>
            <h2>${esc(a.title)}</h2>
            <p class="summary">${esc(a.summary || '')}</p>
            <div class="byline">${esc(a.byline || 'Redaktionen')}</div>
          </div>`;
      const card = a.image_url
        ? `<a href="/artikel/${a.id}" class="feed-card"><img src="${esc(cacheBust(a.image_url))}" alt="">${body}</a>`
        : `<a href="/artikel/${a.id}" class="feed-card no-img">${body}</a>`;
      const needsAd = (i + 1) % 4 === 0 && i < articles.length - 1;
      return needsAd ? card + `<div class="ad-label">Annons</div><div class="ad-slot"></div>` : card;
    }).join('');

    res.send(pageShell(catLabel, cat, `
<style>
  .cat-page { max-width: 1360px; margin: 0 auto; padding: 8px 40px 80px; }
  .feed-column { min-width: 0; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; }
  .feed-column .section-header { display: flex; align-items: center; justify-content: space-between; margin: 0 0 14px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  .feed-column .section-header h3 { font-family: var(--mono); font-size: .8rem; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: .08em; }
  .feed-column > .feed-list > *:last-child { margin-bottom: 0 !important; border-bottom: none !important; }

  .feed-card { display: flex; flex-direction: column; background: transparent; border: none; border-bottom: 1px solid var(--border); border-radius: 0; overflow: hidden; text-decoration: none; color: var(--text); box-shadow: none; transition: background .2s; margin-bottom: 0; }
  .feed-card:hover { background: var(--accent-dim); }
  .feed-card img { width: 100%; height: 240px; object-fit: cover; border-radius: var(--radius); margin-top: 4px; }
  .feed-card .body { padding: 16px 6px 18px; }
  .card-topline { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; color: var(--light); font-size: .72rem; font-family: var(--mono); }
  .feed-card h2 { font-size: 1.2rem; font-weight: 600; line-height: 1.3; margin-bottom: 8px; letter-spacing: -.3px; }
  .feed-card .summary { color: var(--muted); font-size: .88rem; line-height: 1.55; margin-bottom: 10px; }
  .feed-card .byline { color: var(--light); font-size: .72rem; margin-top: 2px; }
  .feed-card.no-img .body { padding: 14px 6px; }
  .feed-card.no-img h2 { font-size: 1rem; line-height: 1.3; margin-bottom: 4px; }
  .feed-card.no-img .summary { font-size: .82rem; line-height: 1.45; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

  .empty { color: var(--light); font-size: 1rem; padding: 40px 0; font-style: italic; text-align: center; }

  @media (max-width: 900px) {
    .cat-page { padding: 8px 16px 60px; }
    .feed-card img { height: 180px; }
  }
</style>
<div class="cat-page">
  <div class="ad-label">Annons</div>
  ${adBannerHtml()}
  <div class="feed-column">
    <div class="section-header"><h3>// ${esc(catLabel)}</h3></div>
    <div class="feed-list">
      ${empty}
      ${feedHtml}
    </div>
  </div>
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
  .contact-email { display: inline-flex; align-items: center; gap: 10px; padding: 12px 18px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 999px; margin-bottom: 28px; font-family: var(--mono); }
  .contact-email svg { color: var(--accent); flex-shrink: 0; }
  .contact-email a { color: var(--text); text-decoration: none; font-weight: 600; font-size: .95rem; }
  .contact-email a:hover { color: var(--accent); }
</style>
<div class="contact-wrap">
  <h1 class="page-title">Kontakt</h1>
  <p class="page-desc">Har du tips, synpunkter eller vill samarbeta? Skicka ett meddelande till redaktionen eller mejla oss direkt.</p>
  <div class="contact-email">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
    <a href="mailto:info@redaktionen.net">info@redaktionen.net</a>
  </div>
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

// --- Metodik page ---
app.get('/metodik', (req, res) => {
  res.send(pageShell('Metodik – så arbetar redaktionen', 'Så skriver, faktagranskar och modererar redaktionen.net – transparens kring vår AI-drivna arbetsprocess.', `
<style>
  .method-wrap { max-width: 780px; margin: 0 auto; padding: 8px 24px 80px; }
  .method-wrap h1.page-title { font-size: 2.2rem; font-weight: 700; margin-bottom: 10px; letter-spacing: -.02em; }
  .method-wrap .lead { font-size: 1.05rem; color: var(--muted); line-height: 1.7; margin-bottom: 36px; }
  .method-wrap h2 { font-size: 1.4rem; font-weight: 700; margin: 48px 0 16px; font-family: var(--mono); }
  .method-wrap h2::before { content: '// '; color: var(--accent); }
  .method-wrap h3 { font-size: 1.05rem; font-weight: 700; margin: 24px 0 8px; color: var(--text); }
  .method-wrap p { font-size: 1rem; line-height: 1.75; margin-bottom: 1em; color: var(--text); }
  .method-wrap p a, .method-wrap li a { color: var(--accent); }
  .method-wrap ul, .method-wrap ol { padding-left: 22px; margin-bottom: 1.2em; }
  .method-wrap li { line-height: 1.7; margin-bottom: 6px; }
  .pipeline { display: grid; gap: 10px; margin: 20px 0 28px; }
  .pipeline-step { display: flex; gap: 14px; align-items: flex-start; padding: 14px 16px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); }
  .pipeline-step .num { flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; background: var(--accent-dim); color: var(--accent); display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 700; font-size: .85rem; }
  .pipeline-step .who { font-family: var(--mono); color: var(--accent); font-size: .72rem; text-transform: uppercase; letter-spacing: .5px; font-weight: 700; margin-bottom: 2px; }
  .pipeline-step .what { font-size: .92rem; line-height: 1.55; color: var(--text); }
  .callout { display: flex; gap: 12px; align-items: flex-start; padding: 14px 18px; background: var(--bg-elevated); border-left: 3px solid var(--accent); border-radius: 6px; margin: 20px 0; font-size: .92rem; line-height: 1.6; color: var(--muted); }
  .callout svg { flex-shrink: 0; color: var(--accent); margin-top: 2px; }
  .callout strong { color: var(--text); }
  .tech-list { font-family: var(--mono); font-size: .82rem; color: var(--muted); }
  .tech-list code { background: var(--bg-elevated); padding: 2px 7px; border-radius: 4px; color: var(--accent); border: 1px solid var(--border); }
</style>
<div class="method-wrap">
  <h1 class="page-title">Metodik</h1>
  <p class="lead">Redaktionen.net är ett experiment i AI-driven teknikjournalistik. Här beskriver vi öppet hur vi arbetar: från att en nyhet upptäcks i en RSS-feed tills en publicerad artikel ligger uppe – och hur vi modererar kommentarer. Transparens är inte bara en god princip; från och med augusti 2026 kräver <a href="https://artificialintelligenceact.eu/" target="_blank" rel="noopener">EU:s AI-förordning</a> att AI-genererat innehåll märks tydligt. Vi gör det redan idag.</p>

  <h2>Från källa till publicering</h2>
  <p>Varje artikel går igenom en pipeline av AI-agenter med olika roller – på samma sätt som en traditionell redaktion har reporter, språkgranskare och faktagranskare. En mänsklig redaktör har sista ordet och godkänner innan något publiceras.</p>

  <div class="pipeline">
    <div class="pipeline-step"><div class="num">1</div><div><div class="who">Chefredaktör</div><div class="what">Bevakar ett urval av internationella och svenska tekniknyhetskällor via RSS, väljer ut de mest relevanta stories och prioriterar utifrån nyhetsvärde, aktualitet och teknisk tyngd.</div></div></div>
    <div class="pipeline-step"><div class="num">2</div><div><div class="who">Researcher</div><div class="what">Sammanställer bakgrund, relaterade källor och tekniska detaljer. Letar upp ursprungskällan när en nyhet har rapporterats av flera medier.</div></div></div>
    <div class="pipeline-step"><div class="num">3</div><div><div class="who">Reporter</div><div class="what">Skriver artikeln på svenska utifrån originalkällan och researchen. Varje kategori – Tech, Hardware, AI, Enterprise – har en specialiserad reporter-agent.</div></div></div>
    <div class="pipeline-step"><div class="num">4</div><div><div class="who">Språkgranskare</div><div class="what">Granskar struktur, ton och teknisk tydlighet. Säkerställer att svenskan är korrekt och att artikeln är läsbar.</div></div></div>
    <div class="pipeline-step"><div class="num">5</div><div><div class="who">Faktagranskare</div><div class="what">Kontrollerar siffror, namn, datum och tekniska påståenden mot originalkällan. Flaggar oklarheter.</div></div></div>
    <div class="pipeline-step"><div class="num">6</div><div><div class="who">Grafisk formgivare</div><div class="what">Skapar en AI-genererad illustration för artikeln. Bilder är alltid illustrationer, inte pressbilder – de föreställer inte verkliga produkter eller personer om det inte anges.</div></div></div>
    <div class="pipeline-step"><div class="num">7</div><div><div class="who">Mänsklig redaktör</div><div class="what">Granskar varje artikel manuellt innan publicering. Kan avvisa, begära omarbetning eller redigera direkt. Inget publiceras utan godkännande.</div></div></div>
  </div>

  <h2>Faktagranskning</h2>
  <p>Vi litar inte blint på AI. Faktagranskaren går igenom varje artikel med följande checklista:</p>
  <ul>
    <li><strong>Originalkälla:</strong> Finns en primärkälla länkad? Artiklar baseras alltid på publika nyhetskällor, och originalkällan anges under varje artikel.</li>
    <li><strong>Siffror och datum:</strong> Stämmer kvartalsrapporter, versionsnummer, prisuppgifter och lanseringsdatum?</li>
    <li><strong>Namn och citat:</strong> Är personer, företag och produktnamn korrekt stavade? Direktcitat används sparsamt och ska gå att verifiera.</li>
    <li><strong>Tekniska påståenden:</strong> Rimlighetsbedömning av specifikationer, benchmarks och tekniska detaljer.</li>
  </ul>
  <div class="callout">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
    <div><strong>Vi garanterar inte felfrihet.</strong> AI-modeller hittar ibland på saker (så kallad hallucination). Om du hittar ett fel – <a href="/kontakt">hör av dig</a> så rättar vi.</div>
  </div>

  <h2>Kommentarsmoderering</h2>
  <p>Kommentarer under artiklar modereras automatiskt av en AI-modell (<code style="background:var(--bg-elevated);padding:2px 6px;border-radius:4px;font-family:var(--mono);font-size:.85em">gpt-4o-mini</code>) som bedömer varje inlägg enligt tre utfall:</p>
  <ul>
    <li><strong>Godkänd:</strong> Relevant, saklig och artig kommentar. Publiceras direkt.</li>
    <li><strong>Flaggad:</strong> Gränsfall – skickas till manuell granskning.</li>
    <li><strong>Avvisad:</strong> Spam, hat, personangrepp eller uppenbart off-topic. Sparas inte.</li>
  </ul>
  <p>Vi loggar IP-hash och e-posthash (inte adressen i klartext) för att förebygga missbruk. Rate limiting gör att samma IP inte kan översvämma kommentarsfältet. Redaktionen förbehåller sig rätten att ta bort kommentarer i efterhand.</p>

  <h2>Teknikstacken</h2>
  <p class="tech-list">Node.js · Express · SQLite (better-sqlite3) · OpenAI (<code>gpt-4o</code>, <code>gpt-4o-mini</code>) · Brave Search API · RSS · marked. Sajten driftas på egen server.</p>

  <h2>Transparens och EU AI Act</h2>
  <p>Från <strong>2 augusti 2026</strong> kräver <a href="https://artificialintelligenceact.eu/" target="_blank" rel="noopener">EU:s AI-förordning (AI Act)</a> att AI-genererat innehåll märks så att läsare förstår vad de konsumerar. Varje artikel på redaktionen.net märks med taggen <span class="ai-tag"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 9v6M15 9v6M9 12h6"/></svg>AI-assisterad</span> bredvid bylinen, och en disklosur-box ligger överst i varje artikel. Byline-namnen ("Linus Kärna", "Pixel Peepgren" m.fl.) är fiktiva personor som representerar respektive AI-agent – inte riktiga människor.</p>

  <p>Har du frågor om vår metodik? <a href="/kontakt">Hör av dig.</a></p>
</div>`));
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

  // Daily newsletter "Dagens 5": check every hour, run ~08:00 CET
  setInterval(() => {
    const now = new Date();
    const sweHour = (now.getUTCHours() + 2) % 24;
    if (sweHour === 8) {
      const lastDigest = db.meta.get('last_digest_at');
      const elapsed = lastDigest ? Date.now() - new Date(lastDigest).getTime() : Infinity;
      if (elapsed > 20 * 3600000) {
        db.meta.set('last_digest_at', new Date().toISOString());
        sendDailyDigest().catch(e => console.error('[Newsletter] Digest error:', e.message));
      }
    }
  }, 3600000);
} else {
  console.log('[Newsroom] No github_token in settings.json — scheduler disabled.');
}

// --- Daily digest sender ---
async function sendDailyDigest() {
  const subs = db.newsletter.allActive();
  if (!subs.length) { console.log('[Newsletter] No subscribers; skipping digest.'); return; }

  // Pick best articles from last ~16 hours (the "night's best")
  const top = db.getDb().prepare(`
    SELECT id, title, summary, category, byline, published_at, views
    FROM articles
    WHERE status = 'approved' AND published_at >= datetime('now', '-16 hours')
    ORDER BY COALESCE(views, 0) DESC, published_at DESC
    LIMIT 5
  `).all();
  if (!top.length) { console.log('[Newsletter] No articles for digest; skipping.'); return; }

  const dateStr = new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
  const base = settings.public_url || 'https://redaktionen.net';

  const resendKey = settings.resend_api_key;
  if (!resendKey) {
    console.log(`[Newsletter] No resend_api_key — would send Dagens 5 to ${subs.length} subscribers:`);
    top.forEach((a, i) => console.log(`  ${i+1}. ${a.title} (${a.category})`));
    return;
  }

  const fromAddr = settings.newsletter_from || 'Dagens 5 <dagens5@redaktionen.net>';
  let sent = 0, failed = 0;
  for (const sub of subs) {
    const unsubUrl = `${base}/api/newsletter/unsubscribe?token=${sub.token}`;
    const html = buildDigestHtml(top, dateStr, unsubUrl, base);
    const text = buildDigestText(top, dateStr, unsubUrl, base);
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromAddr,
          to: sub.email,
          subject: `Dagens 5 · ${dateStr}`,
          html, text,
          headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
        })
      });
      if (r.ok) { db.newsletter.markSent(sub.id); sent++; }
      else { failed++; console.error(`[Newsletter] Resend failed for ${sub.email}: ${r.status}`); }
    } catch (err) {
      failed++;
      console.error(`[Newsletter] Send error for ${sub.email}:`, err.message);
    }
  }
  console.log(`[Newsletter] Dagens 5 sent: ${sent} ok, ${failed} failed.`);
}

function buildDigestHtml(articles, dateStr, unsubUrl, base) {
  const items = articles.map((a, i) => `
    <tr><td style="padding:16px 0;border-bottom:1px solid #30363d">
      <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#58a6ff;text-transform:uppercase;letter-spacing:0.08em">${String(i+1).padStart(2,'0')} · ${escapeHtml(a.category)}</div>
      <h3 style="margin:6px 0 4px;font-family:'Space Grotesk',sans-serif;font-size:17px"><a href="${base}/artikel/${a.id}" style="color:#e6edf3;text-decoration:none">${escapeHtml(a.title)}</a></h3>
      <p style="margin:0;color:#8b949e;font-size:14px;line-height:1.5">${escapeHtml(a.summary || '')}</p>
    </td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="padding-bottom:20px;border-bottom:2px solid #58a6ff">
    <div style="font-family:'JetBrains Mono',monospace;font-size:26px;font-weight:700;letter-spacing:-0.5px;line-height:1.2"><a href="${base}" style="color:#e6edf3;text-decoration:none"><span style="color:#58a6ff">&gt;</span> redaktionen_</a></div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#58a6ff;margin-top:4px;font-weight:600">tech-nyheter.</div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#8b949e;margin-top:2px">snabbt. nördigt. <span style="color:#3fb950">ai-drivet.</span></div>
    <div style="font-family:'JetBrains Mono',monospace;color:#58a6ff;font-size:12px;letter-spacing:0.1em;margin-top:22px">// DAGENS 5</div>
    <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;margin-top:4px;color:#e6edf3">${escapeHtml(dateStr)}</div>
    <div style="color:#8b949e;font-size:13px;margin-top:6px">Nattens bästa från redaktionen.net</div>
  </td></tr>
  ${items}
  <tr><td style="padding-top:24px;color:#6e7681;font-size:12px;text-align:center">
    <p style="margin:0 0 8px">Du får det här mejlet för att du prenumererar på Dagens 5.</p>
    <p style="margin:0"><a href="${unsubUrl}" style="color:#58a6ff">Avprenumerera</a> · <a href="${base}" style="color:#58a6ff">redaktionen.net</a></p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function buildDigestText(articles, dateStr, unsubUrl, base) {
  const lines = [
    '> redaktionen_',
    'tech-nyheter.',
    'snabbt. nördigt. ai-drivet.',
    '',
    `// DAGENS 5 — ${dateStr}`,
    'Nattens bästa från redaktionen.net',
    ''
  ];
  articles.forEach((a, i) => {
    lines.push(`${String(i+1).padStart(2,'0')}. [${a.category}] ${a.title}`);
    if (a.summary) lines.push(`    ${a.summary}`);
    lines.push(`    ${base}/artikel/${a.id}`);
    lines.push('');
  });
  lines.push(`Avprenumerera: ${unsubUrl}`);
  return lines.join('\n');
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

app.listen(PORT, () => console.log(`> redaktionen_ running on http://localhost:${PORT}`));
