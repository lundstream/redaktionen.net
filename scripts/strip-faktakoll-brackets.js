// One-off: strip [ and ] around FAKTAKOLL blocks in existing article bodies.
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'data', 'newsroom.db'));

const rows = db.prepare("SELECT id, body FROM articles WHERE body LIKE '%[FAKTAKOLL:%'").all();
console.log(`Found ${rows.length} articles with bracketed FAKTAKOLL notes`);

const upd = db.prepare('UPDATE articles SET body=? WHERE id=?');
const tx = db.transaction((rows) => {
  for (const r of rows) {
    // Replace: \n\n---\n[FAKTAKOLL: ...CONTENT...]  (end of string or \n)
    // Remove the leading [ after ---\n and the matching ] at end of the tag
    let b = r.body;
    // UNDERKÄND form: [FAKTAKOLL: UNDERKÄND — ...]\n<corrections>
    b = b.replace(/\n\n---\n\[FAKTAKOLL: UNDERK\u00c4ND \u2014 ([^\]]*)\]/, '\n\n---\nFAKTAKOLL: UNDERKÄND — $1');
    // Notering form: [FAKTAKOLL: Notering — ...]
    b = b.replace(/\n\n---\n\[FAKTAKOLL: Notering \u2014 ([^\]]*)\]/, '\n\n---\nFAKTAKOLL: Notering — $1');
    // Generic fallback
    b = b.replace(/\n\n---\n\[FAKTAKOLL: ([^\]]*)\]/, '\n\n---\nFAKTAKOLL: $1');
    if (b !== r.body) upd.run(b, r.id);
  }
});
tx(rows);
console.log('Done.');
