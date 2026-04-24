// One-off: send a test Dagens 5 digest to a given email address.
// Usage: node scripts/send-test-newsletter.js fredrik@lundstream.net

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const TO = process.argv[2];
if (!TO) { console.error('Usage: node scripts/send-test-newsletter.js <email>'); process.exit(1); }

const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'settings.json'), 'utf8'));
if (!settings.resend_api_key) { console.error('No resend_api_key in settings.json'); process.exit(1); }

const dbPath = path.join(__dirname, '..', 'data', 'newsroom.db');
const db = new Database(dbPath, { readonly: true });

let top = db.prepare(`
  SELECT id, title, summary, category, byline, published_at, views
  FROM articles
  WHERE status = 'approved' AND published_at >= datetime('now', '-16 hours')
  ORDER BY COALESCE(views, 0) DESC, published_at DESC
  LIMIT 5
`).all();

if (!top.length) {
  console.log('[Test] No articles in last 16h — falling back to most recent 5 approved.');
  top = db.prepare(`
    SELECT id, title, summary, category, byline, published_at, views
    FROM articles
    WHERE status = 'approved'
    ORDER BY published_at DESC
    LIMIT 5
  `).all();
}
if (!top.length) { console.error('No approved articles at all; aborting.'); process.exit(1); }

const dateStr = new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
const base = settings.public_url || 'https://redaktionen.net';
const unsubUrl = `${base}/api/newsletter/unsubscribe?token=TEST`;

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildDigestHtml(articles) {
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
    <div style="font-family:'JetBrains Mono',monospace;color:#58a6ff;font-size:12px;letter-spacing:0.1em;margin-top:22px">// DAGENS 5 (TEST)</div>
    <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;margin-top:4px;color:#e6edf3">${escapeHtml(dateStr)}</div>
    <div style="color:#8b949e;font-size:13px;margin-top:6px">Nattens bästa från redaktionen.net</div>
  </td></tr>
  ${items}
  <tr><td style="padding-top:24px;color:#6e7681;font-size:12px;text-align:center">
    <p style="margin:0 0 8px">Testutskick — du får det här mejlet eftersom någon kört send-test-newsletter.js.</p>
    <p style="margin:0"><a href="${unsubUrl}" style="color:#58a6ff">Avprenumerera</a> · <a href="${base}" style="color:#58a6ff">redaktionen.net</a></p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function buildDigestText(articles) {
  const lines = [
    '> redaktionen_',
    'tech-nyheter.',
    'snabbt. nördigt. ai-drivet.',
    '',
    `// DAGENS 5 (TEST) — ${dateStr}`,
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

(async () => {
  const fromAddr = settings.newsletter_from || 'Dagens 5 <dagens5@redaktionen.net>';
  const html = buildDigestHtml(top);
  const text = buildDigestText(top);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${settings.resend_api_key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromAddr,
      to: TO,
      subject: `[TEST] Dagens 5 · ${dateStr}`,
      html, text,
      headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    })
  });
  const body = await r.text();
  if (r.ok) {
    console.log(`[Test] Sent to ${TO} — ${r.status}`);
    console.log(body);
  } else {
    console.error(`[Test] FAILED ${r.status}: ${body}`);
    process.exit(1);
  }
})();
