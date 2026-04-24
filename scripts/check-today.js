const Database = require('better-sqlite3');
const db = new Database('data/newsroom.db');

const now = db.prepare("SELECT datetime('now') as utc, datetime('now','+2 hours') as cet, date('now') as d_utc, date('now','+2 hours') as d_cet").get();
console.log('Now:', now);

console.log('\nStatus counts (all):');
console.log(db.prepare('SELECT status, COUNT(*) c FROM articles GROUP BY status').all());

console.log('\nApproved with published_at today (UTC):',
  db.prepare("SELECT COUNT(*) c FROM articles WHERE status='approved' AND date(published_at)=date('now')").get().c);
console.log('Scheduled with publish_at today (UTC):',
  db.prepare("SELECT COUNT(*) c FROM articles WHERE status='scheduled' AND date(publish_at)=date('now')").get().c);
console.log('Approved in last 24h:',
  db.prepare("SELECT COUNT(*) c FROM articles WHERE status='approved' AND published_at >= datetime('now','-24 hours')").get().c);
console.log('Created in last 24h:',
  db.prepare("SELECT COUNT(*) c FROM articles WHERE created_at >= datetime('now','-24 hours')").get().c);
console.log('Approved CET today:',
  db.prepare("SELECT COUNT(*) c FROM articles WHERE status='approved' AND date(published_at,'+2 hours')=date('now','+2 hours')").get().c);

console.log('\nLast 25 articles:');
for (const r of db.prepare("SELECT id,status,substr(title,1,60) t,published_at,publish_at,created_at FROM articles ORDER BY COALESCE(published_at,publish_at,created_at) DESC LIMIT 25").all()) {
  console.log(r);
}
