const social = require('../social-poster');
const d = require('better-sqlite3')(require('path').join(__dirname, '..', 'data', 'newsroom.db'));
const row = d.prepare("SELECT * FROM articles WHERE status='approved' ORDER BY published_at DESC LIMIT 1").get();
console.log('Testing Mastodon with article:', row.id, '-', row.title);
(async () => {
  const r = await social.postMastodon(row);
  console.log('Result:', JSON.stringify(r, null, 2));
})();
