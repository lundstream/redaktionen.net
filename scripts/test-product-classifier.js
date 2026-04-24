// Test searchProductImage classifier against recent articles
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('settings.json','utf8'));
const db = require('better-sqlite3')('data/newsroom.db');

async function llm(messages, opts={}) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${settings.openai_key}` },
    body: JSON.stringify({
      model: opts.model || settings.model || 'gpt-4o',
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens || 2000,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  const data = await resp.json();
  return { content: data.choices?.[0]?.message?.content || '' };
}

async function classify(article) {
  const out = await llm([
    {
      role: 'system',
      content: `Determine if this article is about a specific, named commercial product (a phone, laptop, keyboard, GPU, monitor, headset, etc). If yes, provide the exact product name for an image search. Reply JSON: { "is_product": true, "product_name": "exact product name" } or { "is_product": false }`
    },
    { role: 'user', content: `Title: ${article.title}\nSummary: ${article.summary}\nCategory: ${article.category}` }
  ], { json: true, temperature: 0, max_tokens: 100, model: settings.model_overrides?.graphic_designer || 'gpt-4o-mini' });
  return out.content;
}

(async () => {
  const articles = db.prepare("SELECT id,title,summary,category FROM articles WHERE created_at > datetime('now','-24 hours') ORDER BY id DESC LIMIT 15").all();
  for (const a of articles) {
    const res = await classify(a);
    console.log(`[${a.category}] ${a.title.slice(0,55)} -> ${res}`);
  }
})();
