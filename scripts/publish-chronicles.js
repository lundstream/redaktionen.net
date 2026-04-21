const db = require('../newsroom-db.js');
const r = db.getDb().prepare(
  "UPDATE articles SET status='approved', published_at=datetime('now'), updated_at=datetime('now') WHERE id IN (34, 35)"
).run();
console.log('Published', r.changes, 'chronicles');
