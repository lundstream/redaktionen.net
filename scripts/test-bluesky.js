const db = require('../newsroom-db');
const social = require('../social-poster');

const latest = db.articles.latest ? db.articles.latest(1)[0] : null;
// Fallback: grab most recently published
const d = require('better-sqlite3')(require('path').join(__dirname, '..', 'data', 'newsroom.db'));
const row = latest || d.prepare("SELECT * FROM articles WHERE status='approved' ORDER BY published_at DESC LIMIT 1").get();

console.log('Testing Bluesky with article:', row.id, '-', row.title);

(async () => {
  const r = await social.postBluesky(row);
  console.log('Result:', JSON.stringify(r, null, 2));
})();
