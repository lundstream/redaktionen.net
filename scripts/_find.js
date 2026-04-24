const Database = require('better-sqlite3');
const db = new Database('data/newsroom.db', { readonly: true });
const row = db.prepare('SELECT id,title,image_url,image_prompt,source_urls FROM articles WHERE id=499').get();
console.log(row);
