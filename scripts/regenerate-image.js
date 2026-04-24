// Trigger graphicDesigner (Brave product image + AI fallback) for a given article.
// Usage: node scripts/regenerate-image.js <articleId> [--ai]
//   --ai : skip Brave, force AI-only generation
const articleId = parseInt(process.argv[2], 10);
const skipBrave = process.argv.includes('--ai');
if (!articleId) { console.error('Usage: node scripts/regenerate-image.js <articleId> [--ai]'); process.exit(1); }

(async () => {
  const newsroom = require('../newsroom');
  const res = await newsroom.graphicDesigner(articleId, { skipBrave });
  console.log('Result:', res);
})().catch(e => { console.error(e); process.exit(1); });
