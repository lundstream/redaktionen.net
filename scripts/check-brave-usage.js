const db = require('better-sqlite3')('data/newsroom.db');
console.log('Product images (last 24h):', db.prepare("SELECT COUNT(*) c FROM articles WHERE image_prompt LIKE 'Product image:%' AND created_at > datetime('now','-24 hours')").get().c);
console.log('All articles with image (last 24h):', db.prepare("SELECT COUNT(*) c FROM articles WHERE image_url IS NOT NULL AND image_url != '' AND created_at > datetime('now','-24 hours')").get().c);
console.log('All articles (last 24h):', db.prepare("SELECT COUNT(*) c FROM articles WHERE created_at > datetime('now','-24 hours')").get().c);
console.log('\nRecent product images (Brave):');
for (const r of db.prepare("SELECT id,substr(title,1,60) t, image_prompt FROM articles WHERE image_prompt LIKE 'Product image:%' ORDER BY id DESC LIMIT 10").all()) console.log(r);
console.log('\nLast 15 graphic_designer agent log entries:');
for (const r of db.prepare("SELECT article_id, substr(input,1,60) input, substr(output,1,80) output FROM agent_log WHERE agent='graphic_designer' ORDER BY id DESC LIMIT 15").all()) console.log(r);
