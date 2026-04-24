const d = require('better-sqlite3')(require('path').join(__dirname, '..', 'data', 'newsroom.db'));
const rows = d.prepare("SELECT id, article_id, author_name, status, ai_verdict, ai_reason, substr(body,1,70) as body FROM comments ORDER BY id DESC LIMIT 10").all();
console.table(rows);
