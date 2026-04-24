// Try logging in to Bluesky and posting a test link using settings.json creds.
// Usage: node scripts/bluesky-check.js [articleId]

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const s = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'settings.json'), 'utf8'));
if (!s.bluesky_handle || !s.bluesky_app_password) { console.error('No bluesky creds'); process.exit(1); }

(async () => {
  console.log(`Handle: ${s.bluesky_handle}`);
  const r = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({identifier: s.bluesky_handle, password: s.bluesky_app_password})
  });
  console.log('Login status:', r.status);
  const body = await r.text();
  if (!r.ok) { console.log(body); process.exit(1); }
  const sess = JSON.parse(body);
  console.log('DID:', sess.did);

  const argId = process.argv[2];
  let article;
  if (argId) {
    const db = new Database(path.join(__dirname, '..', 'data', 'newsroom.db'), { readonly: true });
    article = db.prepare('SELECT id,title,summary,category FROM articles WHERE id=?').get(argId);
    if (!article) { console.error('Article not found'); process.exit(1); }
  } else {
    const db = new Database(path.join(__dirname, '..', 'data', 'newsroom.db'), { readonly: true });
    article = db.prepare("SELECT id,title,summary,category FROM articles WHERE status='approved' ORDER BY published_at DESC LIMIT 1").get();
  }
  console.log('Article:', article.id, '-', article.title);

  const url = `${(s.site_url||'https://redaktionen.net').replace(/\/$/,'')}/artikel/${article.id}`;
  const tag = `#${article.category} #svtech`;
  const reserve = url.length + tag.length + 6;
  let title = (article.title||'').trim();
  if (title.length + reserve > 300) title = title.slice(0, 300 - reserve - 1) + '…';
  const text = `${title}\n\n${url}\n\n${tag}`;

  const enc = new TextEncoder();
  const facets = [];
  const urlRe = /(https?:\/\/[^\s]+)/g;
  let m;
  while ((m = urlRe.exec(text)) !== null) {
    const bs = enc.encode(text.slice(0, m.index)).length;
    facets.push({ index:{byteStart:bs, byteEnd: bs+enc.encode(m[0]).length}, features:[{'$type':'app.bsky.richtext.facet#link', uri:m[0]}]});
  }

  const pr = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: {'Authorization':`Bearer ${sess.accessJwt}`, 'Content-Type':'application/json'},
    body: JSON.stringify({
      repo: sess.did,
      collection: 'app.bsky.feed.post',
      record: { '$type':'app.bsky.feed.post', text, facets, createdAt: new Date().toISOString(), langs:['sv'] }
    })
  });
  console.log('Post status:', pr.status);
  console.log(await pr.text());
})().catch(e => { console.error(e); process.exit(1); });
