const db = require('../newsroom-db');
const d = db.raw || require('better-sqlite3')(require('path').join(__dirname, '..', 'data', 'newsroom.db'));

console.log('Server UTC now:', new Date().toISOString());
console.log('Server local now:', new Date().toString());

const approvedToday = d.prepare("SELECT COUNT(*) as c FROM articles WHERE status='approved' AND date(published_at)=date('now')").get().c;
const scheduledToday = d.prepare("SELECT COUNT(*) as c FROM articles WHERE status='scheduled' AND date(publish_at)=date('now')").get().c;
console.log('Approved today (UTC date):', approvedToday);
console.log('Scheduled today (UTC date):', scheduledToday);
console.log('Total (UTC date):', approvedToday + scheduledToday);

console.log('\n--- All scheduled (any date) ---');
const allSched = d.prepare("SELECT id, title, publish_at, status FROM articles WHERE status='scheduled' ORDER BY publish_at").all();
console.log('Total scheduled rows:', allSched.length);
for (const r of allSched.slice(0, 50)) {
  console.log(`  #${r.id}  publish_at=${r.publish_at}  ${r.title.substring(0, 60)}`);
}

console.log('\n--- Approved with published_at today UTC ---');
const appr = d.prepare("SELECT id, title, published_at FROM articles WHERE status='approved' AND date(published_at)=date('now') ORDER BY published_at").all();
for (const r of appr.slice(0, 80)) {
  console.log(`  #${r.id}  ${r.published_at}  ${r.title.substring(0, 60)}`);
}
