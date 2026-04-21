const db = require('../newsroom-db');
const d = db.getDb();

// Publish draft article 28
d.prepare("UPDATE articles SET status='approved', published_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(28);
console.log('Published article 28 (draft -> approved)');

// Publish all remaining scheduled
const result = d.prepare("UPDATE articles SET status='approved', published_at=datetime('now'), updated_at=datetime('now') WHERE status='scheduled'").run();
console.log(`Published ${result.changes} scheduled articles`);

// Verify
d.prepare("SELECT id, status, image_url FROM articles WHERE id >= 23").all().forEach(a => {
  console.log(a.id, a.status, a.image_url ? 'IMG' : 'no-img');
});
