// Manually broadcast an article to all socials.
// Usage: node scripts/broadcast-article.js <articleId>
const path = require('path');
const Database = require('better-sqlite3');

const articleId = parseInt(process.argv[2], 10);
if (!articleId) { console.error('Usage: node scripts/broadcast-article.js <articleId>'); process.exit(1); }

const db = new Database(path.join(__dirname, '..', 'data', 'newsroom.db'), { readonly: true });
const article = db.prepare('SELECT * FROM articles WHERE id=?').get(articleId);
if (!article) { console.error('Not found'); process.exit(1); }

const social = require('../social-poster');
(async () => {
  const results = await social.broadcast(article);
  console.log(JSON.stringify(results, null, 2));
})();
