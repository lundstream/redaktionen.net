/**
 * Redaktionen.net AI Newsroom — Agent Pipeline
 *
 * Agents:
 *   1. Fuller Stackman — Chefredaktör (Managing Editor)
 *   2. Sven Googlund — Researcher
 *   3. Linus Kärna — Reporter (Tech)
 *   4. Hardy Chipström — Reporter (Hardware)
 *   5. Albert Promtsson — Reporter (AI & Internet)
 *   6. Vera Workspace — Reporter (Enterprise)
 *   7. Glosa Grammar — Språkgranskare (Copy Editor)
 *   8. Klara Faktelius — Faktagranskare (Fact Checker)
 *   9. Pixel Peepgren — Grafisk formgivare (Graphic Designer)
 */

const { XMLParser } = require('fast-xml-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./newsroom-db');

// Agent personas — byline and photo per role / category
const REPORTERS = {
  tech:       { name: 'Linus Kärna',       photo: '/images/team/linus-karna.png' },
  hardware:   { name: 'Hardy Chipström',    photo: '/images/team/hardy-chipstrom.png' },
  ai:         { name: 'Albert Promtsson',   photo: '/images/team/albert-promtsson.png' },
  enterprise: { name: 'Vera Workspace',      photo: '/images/team/vera-workspace.png' },
};
const REPORTER_DEFAULT = REPORTERS.tech;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// ---------------------------------------------------------------------------
// LLM wrapper
// ---------------------------------------------------------------------------
const GITHUB_MODELS_URL = 'https://models.inference.ai.azure.com/chat/completions';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

function agentModel(agent) {
  const settings = getSettings();
  return settings.model_overrides?.[agent] || settings.model || 'gpt-4o';
}

async function llm(messages, { model, temperature = 0.7, max_tokens = 2000, json = false } = {}) {
  const settings = getSettings();
  const requestedModel = model || settings.model || 'gpt-4o';

  const providers = [];
  if (settings.openai_key) {
    providers.push({ url: OPENAI_API_URL, token: settings.openai_key, name: 'OpenAI' });
  }
  if (settings.github_token) {
    providers.push({ url: GITHUB_MODELS_URL, token: settings.github_token, name: 'GitHub' });
  }
  if (providers.length === 0) throw new Error('No LLM API key configured (openai_key or github_token)');

  const models = [requestedModel, 'gpt-4o', 'gpt-4o-mini'].filter((v, i, a) => a.indexOf(v) === i);

  for (const provider of providers) {
    for (const m of models) {
      const useNewApi = /^(gpt-5|o[34])/.test(m);
      const body = {
        model: m,
        messages,
        ...(useNewApi ? {} : { temperature }),
        ...(useNewApi ? { max_completion_tokens: max_tokens } : { max_tokens }),
      };
      if (json) body.response_format = { type: 'json_object' };

      try {
        const resp = await fetch(provider.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000),
        });

        if (resp.status === 429) {
          console.log(`[Newsroom] Rate limited on ${provider.name}/${m}`);
          continue;
        }

        if (!resp.ok) {
          const text = await resp.text();
          console.log(`[Newsroom] ${provider.name}/${m} error ${resp.status}: ${text.slice(0, 200)}`);
          continue;
        }

        const data = await resp.json();
        const choice = data.choices?.[0];
        console.log(`[Newsroom] ${provider.name}/${data.model || m} — ${data.usage?.total_tokens || '?'} tokens`);
        return {
          content: choice?.message?.content || '',
          tokens: data.usage?.total_tokens || 0,
          model: data.model || m,
        };
      } catch (e) {
        console.log(`[Newsroom] ${provider.name}/${m} failed: ${e.message}`);
        continue;
      }
    }
  }
  throw new Error('All LLM providers exhausted — no successful response');
}

// ---------------------------------------------------------------------------
// Settings helper
// ---------------------------------------------------------------------------
let _settings = null;
function getSettings() {
  if (!_settings) {
    try {
      _settings = JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf8'));
    } catch {
      _settings = {};
    }
  }
  return _settings;
}
function reloadSettings() { _settings = null; delete require.cache[require.resolve('./settings.json')]; }

// ---------------------------------------------------------------------------
// Content hashing & deduplication
// ---------------------------------------------------------------------------
function contentHash(title) {
  const normalized = title.toLowerCase().replace(/[^a-zåäö0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  return crypto.createHash('md5').update(normalized).digest('hex');
}

function titleSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().replace(/[^a-zåäö0-9 ]/g, '').split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().replace(/[^a-zåäö0-9 ]/g, '').split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / Math.min(wordsA.size, wordsB.size);
}

function isDuplicate(title) {
  const recent = db.articles.recentTitles(72);
  const hash = contentHash(title);
  for (const r of recent) {
    if (r.content_hash === hash) return true;
    if (titleSimilarity(title, r.title) > 0.65) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Publish scheduling — spread articles throughout the day
// ---------------------------------------------------------------------------
function calculatePublishTime(priority) {
  const settings = getSettings();
  const maxPerDay = settings.max_articles_per_day || 18;
  const todayTotal = db.articles.todayScheduledCount();

  const now = new Date();
  const hour = now.getUTCHours() + 2; // CET/CEST rough offset for Sweden

  // If we've hit the daily limit, push to tomorrow 07:00
  if (todayTotal >= maxPerDay) {
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(5, Math.floor(Math.random() * 30), 0, 0); // ~07:00 CET
    return tomorrow.toISOString().replace('T', ' ').slice(0, 19);
  }

  // Find next available slot based on time of day
  // Prime time: 07:00-22:00 CET (up to 2/hour), night: 22:01-06:59 (0-1/hour, only high priority)
  const sweHour = (hour + 24) % 24;
  let targetDate = new Date(now);

  if (sweHour >= 7 && sweHour < 22) {
    // Daytime — publish within 10-40 minutes
    const delay = 10 + Math.floor(Math.random() * 30);
    targetDate.setMinutes(targetDate.getMinutes() + delay);
  } else if (priority >= 8) {
    // Nighttime, breaking news — publish within 15-30 minutes
    const delay = 15 + Math.floor(Math.random() * 15);
    targetDate.setMinutes(targetDate.getMinutes() + delay);
  } else {
    // Nighttime, low priority — schedule for next morning
    if (sweHour >= 22) {
      targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    }
    targetDate.setUTCHours(5 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);
  }

  return targetDate.toISOString().replace('T', ' ').slice(0, 19);
}

// ---------------------------------------------------------------------------
// 1. SOURCE SCANNER — fetch leads from RSS and webpages
// ---------------------------------------------------------------------------
async function scanSources() {
  const sources = db.sources.enabled();
  const allLeads = [];

  for (const src of sources) {
    try {
      if (src.type === 'rss') {
        const leads = await scanRss(src);
        allLeads.push(...leads);
      } else if (src.type === 'webpage') {
        const leads = await scanWebpage(src);
        allLeads.push(...leads);
      }
      db.sources.touch(src.id);
    } catch (e) {
      console.error(`[Newsroom] Source scan error (${src.name}):`, e.message);
    }
  }

  return allLeads;
}

async function scanRss(source) {
  const resp = await fetch(source.url, {
    headers: { 'User-Agent': 'RedaktionenNet/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) return [];
  const xml = await resp.text();
  const parsed = parser.parse(xml);

  // Handle both RSS and Atom feeds
  const channel = parsed?.rss?.channel;
  const atomFeed = parsed?.feed;
  let items = [];

  if (channel) {
    items = (Array.isArray(channel.item) ? channel.item : [channel.item]).filter(Boolean).slice(0, 15);
  } else if (atomFeed) {
    const entries = Array.isArray(atomFeed.entry) ? atomFeed.entry : [atomFeed.entry];
    items = entries.filter(Boolean).slice(0, 15).map(e => ({
      title: e.title?.['#text'] || e.title || '',
      link: e.link?.['@_href'] || (Array.isArray(e.link) ? e.link[0]?.['@_href'] : '') || '',
      description: e.summary?.['#text'] || e.summary || e.content?.['#text'] || '',
      pubDate: e.published || e.updated || '',
    }));
  }

  const leads = [];

  for (const item of items) {
    const title = item.title || '';
    const url = item.link || '';
    const summary = (item.description || '').replace(/<[^>]+>/g, '').slice(0, 500);
    const extId = url || title;

    if (!title || db.leads.exists(extId)) continue;

    const result = db.leads.create({
      source_id: source.id,
      external_id: extId,
      title,
      url,
      summary,
      category: source.category,
      score: 0,
    });

    if (result.changes > 0) {
      leads.push({ id: result.lastInsertRowid, title, url, summary, category: source.category });
    }
  }

  return leads;
}

async function scanWebpage(source) {
  const resp = await fetch(source.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 RedaktionenNet/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) return [];
  const html = await resp.text();

  const linkRe = /<a[^>]*href="([^"]*)"[^>]*title="([^"]*)"/gi;
  const leads = [];
  let m;
  while ((m = linkRe.exec(html)) && leads.length < 10) {
    let url = m[1];
    const title = m[2];
    if (!title || title.length < 10) continue;
    if (url.startsWith('/')) url = new URL(url, source.url).href;
    const extId = url;
    if (db.leads.exists(extId)) continue;

    const result = db.leads.create({
      source_id: source.id,
      external_id: extId,
      title,
      url,
      summary: '',
      category: source.category,
      score: 0,
    });
    if (result.changes > 0) {
      leads.push({ id: result.lastInsertRowid, title, url, summary: '', category: source.category });
    }
  }
  return leads;
}

// ---------------------------------------------------------------------------
// 2. MANAGING EDITOR — score and classify leads
// ---------------------------------------------------------------------------
async function managingEditor(leadsList) {
  if (!leadsList || leadsList.length === 0) return [];
  const settings = getSettings();

  const leadsText = leadsList.map((l, i) =>
    `${i + 1}. [${l.category}] "${l.title}" — ${l.summary || '(ingen sammanfattning)'} (källa: ${l.url || 'okänd'})`
  ).join('\n');

  const result = await llm([
    {
      role: 'system',
      content: `Du är chefredaktör för Redaktionen.net, en svensk tekniknyhetssajt.
Du ska:
1. Bedöma vilka nyheter som är mest relevanta för en teknikintresserad svensk publik
2. Poängsätta varje nyhet 1-10 baserat på teknikrelevans, aktualitet och intresse
3. Klassificera i rätt kategori: "tech", "hardware", "ai" eller "enterprise"
4. Välj de ${settings.articles_per_cycle || 8} bästa nyheterna att skriva om

Svara i JSON-format: { "selected": [{ "index": 1, "score": 8, "category": "tech", "angle": "kort beskrivning av vinkel att ta" }] }
Prioritera banbrytande tekniknyheter, AI-genombrott, stora produktlanseringar och svenska tech-nyheter.`
    },
    { role: 'user', content: `Här är dagens nyhetsflöde:\n${leadsText}` }
  ], { json: true, temperature: 0.4, max_tokens: 1000, model: agentModel('managing_editor') });

  try {
    const parsed = JSON.parse(result.content);
    const selected = parsed.selected || [];

    for (const pick of selected) {
      const idx = pick.index - 1;
      if (idx >= 0 && idx < leadsList.length) {
        const lead = leadsList[idx];
        const leadId = lead.id || db.leads.pending().find(l => l.title === lead.title)?.id;
        if (leadId) {
          db.leads.setStatus(leadId, 'assigned');
          const d = db.getDb();
          d.prepare('UPDATE leads SET score = ?, category = ? WHERE id = ?').run(pick.score, pick.category, leadId);
        }
        lead.score = pick.score;
        lead.category = pick.category;
        lead.angle = pick.angle;
        lead._selected = true;
      }
    }

    db.agentLog.create({
      article_id: null,
      agent: 'managing_editor',
      action: 'classify_leads',
      input_text: leadsText.slice(0, 2000),
      output_text: result.content.slice(0, 2000),
      model: result.model,
      tokens_used: result.tokens,
    });

    return leadsList.filter(l => l._selected);
  } catch (e) {
    console.error('[Newsroom] Managing editor parse error:', e.message);
    return [];
  }
}

// Dedup filter: remove leads that match existing articles
function deduplicateLeads(leadsList) {
  return leadsList.filter(l => {
    if (isDuplicate(l.title)) {
      console.log(`[Newsroom] Dedup: skipping "${l.title}" — similar article exists`);
      if (l.id) db.leads.setStatus(l.id, 'duplicate');
      return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// 3. RESEARCHER — investigate and find additional sources
// ---------------------------------------------------------------------------
function stripHtml(html) {
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Search engine scrapers — tried in order until one returns results
async function searchDDG(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`DDG ${resp.status}`);
  const html = await resp.text();
  const resultRe = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const urls = [], snippets = [];
  let m;
  while ((m = resultRe.exec(html)) && urls.length < 5) urls.push({ url: m[1], title: stripHtml(m[2]).slice(0, 200) });
  while ((m = snippetRe.exec(html)) && snippets.length < 5) snippets.push(stripHtml(m[1]).slice(0, 300));
  return { urls, snippets, engine: 'DDG' };
}

async function searchBing(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=sv`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`Bing ${resp.status}`);
  const html = await resp.text();
  const urls = [], snippets = [];
  // Bing organic results
  const liRe = /<li[^>]*class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
  let li;
  while ((li = liRe.exec(html)) && urls.length < 5) {
    const block = li[1];
    const linkM = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!linkM) continue;
    urls.push({ url: linkM[1], title: stripHtml(linkM[2]).slice(0, 200) });
    const snippetM = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    snippets.push(snippetM ? stripHtml(snippetM[1]).slice(0, 300) : '');
  }
  return { urls, snippets, engine: 'Bing' };
}

async function searchGoogle(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=sv&num=5`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`Google ${resp.status}`);
  const html = await resp.text();
  const urls = [], snippets = [];
  // Google wraps results in <div class="g">
  const divRe = /<div[^>]*class="[^"]*\bg\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let dv;
  while ((dv = divRe.exec(html)) && urls.length < 5) {
    const block = dv[1];
    const linkM = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!linkM) continue;
    urls.push({ url: linkM[1], title: stripHtml(linkM[2]).slice(0, 200) });
    const spanM = /<span[^>]*>([\s\S]{40,300})<\/span>/i.exec(block);
    snippets.push(spanM ? stripHtml(spanM[1]).slice(0, 300) : '');
  }
  return { urls, snippets, engine: 'Google' };
}

async function webSearch(query) {
  const engines = [searchDDG, searchBing, searchGoogle];
  for (const engine of engines) {
    try {
      const result = await engine(query);
      if (result.urls.length > 0) {
        console.log(`[Newsroom] Search via ${result.engine}: ${result.urls.length} results`);
        return result;
      }
    } catch (e) {
      console.log(`[Newsroom] Search engine failed: ${e.message}`);
    }
  }
  return { urls: [], snippets: [], engine: 'none' };
}

async function researcher(lead) {
  console.log(`[Newsroom] Researcher investigating: ${lead.title}`);
  const sources = [];

  const searchQuery = `${lead.title}`;

  try {
    const { urls, snippets } = await webSearch(searchQuery);

    // Filter out the original source
    const filtered = urls.filter(u => {
      try { return !(lead.url && u.url.includes(new URL(lead.url).hostname)); } catch { return true; }
    });

    for (let i = 0; i < Math.min(filtered.length, 3); i++) {
      try {
        const pageResp = await fetch(filtered[i].url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
          signal: AbortSignal.timeout(10000),
          redirect: 'follow',
        });
        if (pageResp.ok) {
          const pageHtml = await pageResp.text();
          const text = stripHtml(pageHtml).slice(0, 2000);
          const idx = urls.indexOf(filtered[i]);
          sources.push({ url: filtered[i].url, title: filtered[i].title, snippet: snippets[idx] || '', content: text });
        }
      } catch { /* skip */ }
    }

    if (sources.length === 0) {
      for (let i = 0; i < filtered.length; i++) {
        const idx = urls.indexOf(filtered[i]);
        if (snippets[idx]) {
          sources.push({ url: filtered[i].url, title: filtered[i].title, snippet: snippets[idx], content: '' });
        }
      }
    }
  } catch (e) {
    console.error(`[Newsroom] Web search failed:`, e.message);
  }

  if (sources.length > 0) {
    const researchMaterial = sources.map((s, i) =>
      `Källa ${i + 1}: ${s.title}\nURL: ${s.url}\n${s.snippet ? `Utdrag: ${s.snippet}` : ''}${s.content ? `\nInnehåll: ${s.content.slice(0, 1500)}` : ''}`
    ).join('\n\n');

    const result = await llm([
      {
        role: 'system',
        content: `Du är researcher på Redaktionen.net, en svensk tekniknyhetssajt. Sammanfatta vad du hittat från andra källor om denna nyhet.

Fokusera på:
- NYA fakta eller perspektiv som inte finns i originalkällan
- Tekniska detaljer och specifikationer
- Branschkontext och trender
- Hur det påverkar svenska/nordiska användare

Svara i JSON: { "summary": "sammanfattning av research...", "key_facts": ["fakta 1", "fakta 2"], "additional_urls": ["url1", "url2"] }`
      },
      {
        role: 'user',
        content: `Nyhet att undersöka: "${lead.title}"
Originalkälla: ${lead.url || 'okänd'}
Originalsammanfattning: ${lead.summary || '(ingen)'}

Forskningsmaterial från webben:
${researchMaterial}`
      }
    ], { json: true, temperature: 0.3, max_tokens: 1000, model: agentModel('researcher') });

    try {
      const research = JSON.parse(result.content);

      db.agentLog.create({
        article_id: null,
        agent: 'researcher',
        action: 'web_research',
        input_text: `${lead.title} — ${sources.length} källor hittade`.slice(0, 500),
        output_text: result.content.slice(0, 2000),
        model: result.model,
        tokens_used: result.tokens,
      });

      console.log(`[Newsroom] Researcher found ${sources.length} extra sources, ${(research.key_facts || []).length} key facts`);
      return {
        summary: research.summary || '',
        key_facts: research.key_facts || [],
        additional_urls: (research.additional_urls || []).filter(u => u && u.startsWith('http')),
        sources,
      };
    } catch (e) {
      console.error('[Newsroom] Researcher parse error:', e.message);
    }
  }

  console.log(`[Newsroom] Researcher found no extra sources for: ${lead.title}`);
  return { summary: '', key_facts: [], additional_urls: [], sources: [] };
}

// ---------------------------------------------------------------------------
// 4. REPORTER — write article from a lead
// ---------------------------------------------------------------------------
async function reporter(lead, research) {
  let sourceContent = '';
  if (lead.url) {
    try {
      const resp = await fetch(lead.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 RedaktionenNet/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const html = await resp.text();
        sourceContent = stripHtml(html).slice(0, 4000);
      }
    } catch { /* ignore */ }
  }

  let researchContext = '';
  if (research && (research.summary || research.key_facts?.length)) {
    researchContext = `\n\nRESEARCH FRÅN REDAKTIONENS RESEARCH-AVDELNING:`;
    if (research.summary) researchContext += `\nSammanfattning: ${research.summary}`;
    if (research.key_facts?.length) researchContext += `\nNyckelfakta:\n- ${research.key_facts.join('\n- ')}`;
  }

  const result = await llm([
    {
      role: 'system',
      content: `Du är teknikreporter på Redaktionen.net, en svensk tekniknyhetssajt. Skriv en nyhet på svenska.

VIKTIGA REGLER:
- Skriv en ORIGINAL artikel med egen analys — kopiera ALDRIG text från källan
- Rikta dig till en teknikintresserad svensk publik
- Inkludera tekniska detaljer men gör det begripligt
- Ge gärna svensk/nordisk kontext om relevant
- Strukturera med rubrik, ingress (2-3 meningar), och brödtext med stycken
- Längd: 300-600 ord
- Ton: kunnig men tillgänglig, nördig men inte exkluderande
- Väv in research-fakta naturligt

Svara i JSON: { "title": "...", "summary": "ingress...", "body": "brödtext med \\n\\n för stycken..." }`
    },
    {
      role: 'user',
      content: `Skriv en artikel baserad på denna nyhet:
Rubrik: ${lead.title}
Kategori: ${lead.category}
Vinkel: ${lead.angle || 'allmän rapportering'}
Sammanfattning: ${lead.summary || '(ingen)'}
Källa: ${lead.url || 'okänd'}
${sourceContent ? `\nKällmaterial:\n${sourceContent}` : ''}${researchContext}`
    }
  ], { json: true, temperature: 0.7, max_tokens: 2000, model: agentModel('reporter') });

  try {
    const article = JSON.parse(result.content);
    const reporter_persona = REPORTERS[lead.category] || REPORTER_DEFAULT;

    const allUrls = [lead.url].filter(Boolean);
    if (research?.additional_urls) {
      for (const u of research.additional_urls) {
        if (!allUrls.includes(u)) allUrls.push(u);
      }
    }

    const articleId = db.articles.create({
      lead_id: lead.id,
      title: article.title,
      summary: article.summary,
      body: article.body,
      category: lead.category,
      status: 'draft',
      tone: 'formal',
      source_urls: allUrls,
      byline: reporter_persona.name,
      priority: lead.score || 0,
      content_hash: contentHash(article.title),
    });

    if (lead.id) db.leads.setStatus(lead.id, 'completed');

    db.agentLog.create({
      article_id: articleId,
      agent: 'reporter',
      action: 'write_article',
      input_text: `${lead.title} — ${lead.angle || ''}`.slice(0, 500),
      output_text: result.content.slice(0, 2000),
      model: result.model,
      tokens_used: result.tokens,
    });

    return articleId;
  } catch (e) {
    console.error('[Newsroom] Reporter parse error:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 5. COPY EDITOR — refine article
// ---------------------------------------------------------------------------
async function copyEditor(articleId) {
  const article = db.articles.get(articleId);
  if (!article) return;

  const result = await llm([
    {
      role: 'system',
      content: `Du är språkgranskare på Redaktionen.net, en svensk tekniknyhetssajt. Granska och förbättra artikeln.

Kontrollera:
- Språk och stavning (svenska)
- Teknisk tydlighet och korrekthet i terminologi
- Att ingressen sammanfattar kärnan
- Att artikeln flödar bra och är engagerande

Gör MINSTA möjliga ändringar. Behåll reporterns stil.
Svara i JSON: { "title": "...", "summary": "...", "body": "...", "changes": "kort beskrivning av ändringar" }`
    },
    {
      role: 'user',
      content: `Rubrik: ${article.title}\nIngress: ${article.summary}\n\nBrödtext:\n${article.body}`
    }
  ], { json: true, temperature: 0.3, max_tokens: 2000, model: agentModel('copy_editor') });

  try {
    const edited = JSON.parse(result.content);

    db.articles.update(articleId, {
      title: edited.title || article.title,
      summary: edited.summary || article.summary,
      body: edited.body || article.body,
      category: article.category,
      status: 'pending',
      tone: article.tone,
      image_url: article.image_url,
      source_urls: JSON.parse(article.source_urls || '[]'),
      byline: article.byline,
    });

    db.agentLog.create({
      article_id: articleId,
      agent: 'copy_editor',
      action: 'edit_article',
      input_text: `${article.title}`.slice(0, 500),
      output_text: (edited.changes || 'Redigerad').slice(0, 2000),
      model: result.model,
      tokens_used: result.tokens,
    });
  } catch (e) {
    console.error('[Newsroom] Copy editor parse error:', e.message);
    db.articles.update(articleId, { ...article, status: 'pending', source_urls: JSON.parse(article.source_urls || '[]') });
  }
}

// ---------------------------------------------------------------------------
// 6. FACT CHECKER — verify claims
// ---------------------------------------------------------------------------
async function factChecker(articleId) {
  const article = db.articles.get(articleId);
  if (!article) return;

  let sourceContent = '';
  const sourceUrls = JSON.parse(article.source_urls || '[]');
  if (sourceUrls.length > 0) {
    try {
      const resp = await fetch(sourceUrls[0], {
        headers: { 'User-Agent': 'Mozilla/5.0 RedaktionenNet/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const html = await resp.text();
        sourceContent = stripHtml(html).slice(0, 4000);
      }
    } catch { /* ignore */ }
  }

  const result = await llm([
    {
      role: 'system',
      content: `Du är faktakollerare på Redaktionen.net, en svensk tekniknyhetssajt. Granska artikeln:

1. PÅSTÅENDEN stämmer med källmaterialet
2. TEKNISKA fakta är korrekta (siffror, specifikationer, datum)
3. INGA fabricerade citat eller falska detaljer
4. NAMN på företag, produkter och personer är korrekt stavade
5. Det inte finns ÖVERDRIVNA eller MISSVISANDE formuleringar

Bedöm:
- "godkänd" — inga faktafel
- "varning" — mindre problem
- "underkänd" — allvarliga faktafel

Svara i JSON: { "verdict": "godkänd|varning|underkänd", "issues": ["lista med problem"], "corrections": "föreslagna korrigeringar", "confidence": 0.0-1.0 }`
    },
    {
      role: 'user',
      content: `Granska denna artikel:

Rubrik: ${article.title}
Ingress: ${article.summary}
Brödtext:
${article.body}

Byline: ${article.byline}
Kategori: ${article.category}
Källor: ${sourceUrls.join(', ') || 'inga angivna'}
${sourceContent ? `\nKällmaterial:\n${sourceContent}` : '\n(Kunde inte hämta källmaterial)'}`
    }
  ], { json: true, temperature: 0.2, max_tokens: 1000, model: agentModel('fact_checker') });

  try {
    const check = JSON.parse(result.content);

    db.agentLog.create({
      article_id: articleId,
      agent: 'fact_checker',
      action: `verdict: ${check.verdict}`,
      input_text: article.title.slice(0, 500),
      output_text: JSON.stringify({ verdict: check.verdict, issues: check.issues, confidence: check.confidence }).slice(0, 2000),
      model: result.model,
      tokens_used: result.tokens,
    });

    if (check.verdict === 'underkänd') {
      const issueNote = (check.issues || []).join('; ');
      const current = db.articles.get(articleId);
      db.articles.update(articleId, {
        ...current,
        status: 'draft',
        body: current.body + `\n\n---\n[FAKTAKOLL: UNDERKÄND — ${issueNote}]\n${check.corrections || ''}`,
        source_urls: JSON.parse(current.source_urls || '[]'),
      });
      console.log(`[Newsroom] Fact checker REJECTED article ${articleId}: ${issueNote}`);
      return { verdict: 'underkänd', issues: check.issues };
    }

    if (check.verdict === 'varning' && check.corrections) {
      const current = db.articles.get(articleId);
      db.articles.update(articleId, {
        ...current,
        body: current.body + `\n\n---\n[FAKTAKOLL: Notering — ${(check.issues || []).join('; ')}]`,
        source_urls: JSON.parse(current.source_urls || '[]'),
      });
    }

    console.log(`[Newsroom] Fact checker ${check.verdict} for article ${articleId}`);
    return { verdict: check.verdict, issues: check.issues || [] };
  } catch (e) {
    console.error('[Newsroom] Fact checker parse error:', e.message);
    return { verdict: 'error', issues: [e.message] };
  }
}

// ---------------------------------------------------------------------------
// 6b. REWRITE ARTICLE
// ---------------------------------------------------------------------------
async function rewriteArticle(articleId) {
  const article = db.articles.get(articleId);
  if (!article) throw new Error('Artikel hittades inte');

  const cleanBody = article.body.replace(/\n\n---\n\[FAKTAKOLL:[\s\S]*$/m, '');

  let sourceContent = '';
  const sourceUrls = JSON.parse(article.source_urls || '[]');
  if (sourceUrls.length > 0) {
    try {
      const resp = await fetch(sourceUrls[0], {
        headers: { 'User-Agent': 'Mozilla/5.0 RedaktionenNet/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const html = await resp.text();
        sourceContent = stripHtml(html).slice(0, 4000);
      }
    } catch { /* ignore */ }
  }

  let research = { summary: '', key_facts: [], additional_urls: [], sources: [] };
  try {
    research = await researcher({ title: article.title, url: sourceUrls[0], summary: article.summary, category: article.category });
  } catch (e) {
    console.error(`[Newsroom] Researcher error during rewrite:`, e.message);
  }

  let researchContext = '';
  if (research.summary || research.key_facts?.length) {
    researchContext = `\n\nNY RESEARCH FRÅN WEBBEN:`;
    if (research.summary) researchContext += `\nSammanfattning: ${research.summary}`;
    if (research.key_facts?.length) researchContext += `\nNyckelfakta:\n- ${research.key_facts.join('\n- ')}`;
  }

  const logs = db.agentLog.forArticle(articleId);
  const lastFactCheck = logs.filter(l => l.agent === 'fact_checker').pop();
  let factIssues = '';
  if (lastFactCheck) {
    try {
      const parsed = JSON.parse(lastFactCheck.output_text);
      factIssues = (parsed.issues || []).join('\n- ');
    } catch { factIssues = lastFactCheck.output_text || ''; }
  }

  const rewriteResult = await llm([
    {
      role: 'system',
      content: `Du är reporter på Redaktionen.net. En tidigare version av din artikel hade problem vid faktakoll. Korrigera de specifika problemen — skriv INTE om hela artikeln.

Gör minimala, kirurgiska ändringar. Behåll struktur, ton och stil.

Svara i JSON: { "title": "...", "summary": "ingress...", "body": "brödtext med \\n\\n för stycken..." }`
    },
    {
      role: 'user',
      content: `Korrigera de specifika problemen i denna artikel:

Rubrik: ${article.title}
Kategori: ${article.category}
Ingress: ${article.summary}
Brödtext:
${cleanBody}

${factIssues ? `PROBLEM SOM MÅSTE FIXAS:\n- ${factIssues}` : 'Inga specifika problem angivna.'}
${sourceContent ? `\nKällmaterial:\n${sourceContent}` : ''}${researchContext}
Källor: ${sourceUrls.join(', ') || 'okänd'}`
    }
  ], { json: true, temperature: 0.4, max_tokens: 2000, model: agentModel('rewrite') });

  let rewritten;
  try {
    rewritten = JSON.parse(rewriteResult.content);
  } catch (e) {
    throw new Error('Reporter kunde inte skriva om artikeln: ' + e.message);
  }

  const allUrls = [...sourceUrls];
  if (research?.additional_urls) {
    for (const u of research.additional_urls) {
      if (!allUrls.includes(u)) allUrls.push(u);
    }
  }

  db.articles.update(articleId, {
    title: rewritten.title || article.title,
    summary: rewritten.summary || article.summary,
    body: rewritten.body || cleanBody,
    category: article.category,
    status: 'draft',
    tone: article.tone,
    image_url: article.image_url,
    source_urls: allUrls,
    byline: article.byline,
  });

  db.agentLog.create({
    article_id: articleId,
    agent: 'reporter',
    action: 'rewrite_article',
    input_text: `Omskrivning: ${article.title}`.slice(0, 500),
    output_text: rewriteResult.content.slice(0, 2000),
    model: rewriteResult.model,
    tokens_used: rewriteResult.tokens,
  });

  console.log(`[Newsroom] Reporter rewrote article ${articleId}`);

  await copyEditor(articleId);
  console.log(`[Newsroom] Copy editor refined rewritten article ${articleId}`);

  const factResult = await factChecker(articleId);
  console.log(`[Newsroom] Fact checker re-checked article ${articleId}: ${factResult.verdict}`);

  return { articleId, verdict: factResult.verdict, issues: factResult.issues || [] };
}

// ---------------------------------------------------------------------------
// 6b. PRODUCT IMAGE SEARCH — find official product images via web search
// ---------------------------------------------------------------------------
async function searchProductImage(article) {
  const settings = getSettings();
  if (!settings.brave_search_key) return null;

  // Ask LLM if this is about a specific named product
  const analysis = await llm([
    {
      role: 'system',
      content: `Determine if this article is about a specific, named commercial product (a phone, laptop, keyboard, GPU, monitor, headset, etc). If yes, provide the exact product name for an image search. Reply JSON: { "is_product": true, "product_name": "exact product name" } or { "is_product": false }`
    },
    { role: 'user', content: `Title: ${article.title}\nSummary: ${article.summary}\nCategory: ${article.category}` }
  ], { json: true, temperature: 0, max_tokens: 100, model: agentModel('graphic_designer') });

  try {
    const parsed = JSON.parse(analysis.content);
    if (!parsed.is_product || !parsed.product_name) return null;

    console.log(`[Newsroom] Searching web for product image: "${parsed.product_name}"`);
    const query = `${parsed.product_name} official product photo press image`;
    const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=5&safesearch=strict`;
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': settings.brave_search_key },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      console.log(`[Newsroom] Brave image search failed: ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    const results = data.results || [];

    // Try to download first valid product image
    for (const img of results) {
      const imgUrl = img.properties?.url || img.thumbnail?.src;
      if (!imgUrl) continue;
      try {
        const imgResp = await fetch(imgUrl, {
          signal: AbortSignal.timeout(15000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Redaktionen/1.0)' },
        });
        if (imgResp.ok && (imgResp.headers.get('content-type') || '').includes('image')) {
          const buf = Buffer.from(await imgResp.arrayBuffer());
          if (buf.length > 5000) { // skip tiny placeholders
            return { buffer: buf, product: parsed.product_name, source: img.url || img.source || '' };
          }
        }
      } catch (e) {
        continue;
      }
    }

    console.log(`[Newsroom] No suitable product image found for "${parsed.product_name}"`);
    return null;
  } catch (e) {
    console.error(`[Newsroom] Product image search error: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 7. GRAPHIC DESIGNER — generate image
// ---------------------------------------------------------------------------
async function graphicDesigner(articleId) {
  const article = db.articles.get(articleId);
  if (!article) return;

  // Try product image search first (for hardware/product articles)
  try {
    const productImg = await searchProductImage(article);
    if (productImg) {
      const imgDir = path.join(__dirname, 'public', 'images', 'articles');
      fs.mkdirSync(imgDir, { recursive: true });
      const filename = `article-${articleId}.png`;
      fs.writeFileSync(path.join(imgDir, filename), productImg.buffer);
      const imageUrl = `/images/articles/${filename}`;

      const current = db.articles.get(articleId);
      db.articles.update(articleId, {
        ...current,
        image_url: imageUrl,
        image_prompt: `Product image: ${productImg.product}`,
        source_urls: JSON.parse(current.source_urls || '[]'),
      });
      db.agentLog.create({ article_id: articleId, agent: 'graphic_designer', input: `Product: ${productImg.product}`, output: `Web image from: ${productImg.source}` });
      console.log(`[Newsroom] Used web product image for article ${articleId}: ${productImg.product}`);
      return { imageUrl };
    }
  } catch (e) {
    console.error(`[Newsroom] Product image search failed for article ${articleId}: ${e.message}`);
  }

  const result = await llm([
    {
      role: 'system',
      content: `Du skapar bildförslag för teknikartiklar. Beskriv en passande teknikbild på engelska (för AI-bildgenerering).

VÄLJ EN av dessa visuella stilar — VARIERA, använd inte samma stil varje gång:
1) MACRO PHOTOGRAPHY — extrem närbild på hårdvara, kretskort, anslutningar, kablar. Grunt skärpedjup. Exempel: "Extreme macro shot of a CPU die with visible transistor pathways, shallow depth of field, warm amber backlight"
2) MOODY ENVIRONMENT — stämningsfullt serverrum, datacenter, kontrollrum. Atmosfärisk belysning. Exempel: "Dark data center corridor with rows of blinking server racks, cold blue fog rolling across the floor"
3) ABSTRACT DIGITAL — abstrakt digital konst, geometriska mönster, dataflöden, nätverksvisualisering. Exempel: "Abstract 3D render of interconnected geometric nodes floating in dark space, neon wireframe style"
4) ISOMETRIC TECH — isometrisk illustration av tekniksystem, arkitektur, infrastruktur. Exempel: "Isometric illustration of a cloud infrastructure with connected microservices, flat design, vibrant colors on dark background"
5) CINEMATIC STILL LIFE — dramatiskt upplagt teknikstilleben. Exempel: "Cinematic overhead shot of a disassembled laptop on a dark workbench, dramatic side lighting, tools scattered around"
6) RETRO/GLITCH — retro-tech, CRT-skärmar, glitch art, vaporwave. Exempel: "Retro CRT monitor displaying green terminal text in a dark 80s office, scanlines visible, VHS aesthetic"
7) AERIAL/SCHEMATIC — fågelperspektiv på teknik, blueprint-stil, tekniska ritningar. Exempel: "Technical blueprint schematic of a network topology, white lines on dark blue background, engineering style"

VIKTIGT:
- Inkludera ALDRIG text, logotyper, namn eller ansikten
- Använd ALDRIG riktiga namn på företag eller produkter
- Beskriv generiska scener: "circuit board close-up" INTE "Apple iPhone"
- Variera ljussättning: inte bara blått — prova amber, cyan, magenta, grön, vitt, rött
- Variera vinkel: macro, overhead, wide-angle, isometric, eye-level

Svara i JSON: { "prompt": "detailed image description in English...", "alt_text": "beskrivning på svenska", "style": "macro|moody|abstract|isometric|cinematic|retro|schematic" }`
    },
    { role: 'user', content: `Artikelrubrik: ${article.title}\nIngress: ${article.summary}\nKategori: ${article.category}` }
  ], { json: true, temperature: 0.6, max_tokens: 300, model: agentModel('graphic_designer') });

  try {
    const imgData = JSON.parse(result.content);
    // No generic suffix — LLM prompt already specifies varied styles
    const settings = getSettings();

    let imageUrl = null;
    console.log(`[Newsroom] GD article ${articleId}: prompt=${(imgData.prompt||'').slice(0,60)}, hasKieKey=${!!settings.kie_api_key}`);

    if (settings.kie_api_key && imgData.prompt) {
      async function kieGenerate(prompt) {
        const createResp = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${settings.kie_api_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'nano-banana-2',
            input: { prompt, aspect_ratio: '16:9', resolution: '1K', output_format: 'png' },
          }),
          signal: AbortSignal.timeout(30000),
        });
        const createData = await createResp.json();
        if (createData.code !== 200 || !createData.data?.taskId) {
          return { error: createData.msg || 'createTask failed' };
        }
        const taskId = createData.data.taskId;
        console.log(`[Newsroom] Kie AI task created: ${taskId}`);

        let delay = 3000;
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, delay));
          const pollResp = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
            headers: { 'Authorization': `Bearer ${settings.kie_api_key}` },
            signal: AbortSignal.timeout(10000),
          });
          const pollData = await pollResp.json();
          const state = pollData.data?.state;
          if (state === 'success') {
            try {
              const rj = JSON.parse(pollData.data.resultJson);
              return { url: rj.resultUrls?.[0] };
            } catch { return { error: 'Failed to parse result' }; }
          } else if (state === 'fail') {
            return { error: pollData.data?.failMsg || 'unknown', filtered: true };
          }
          delay = Math.min(delay * 1.3, 6000);
        }
        return { error: 'Timeout waiting for result' };
      }

      try {
        let kieResult = await kieGenerate(imgData.prompt);

        if (kieResult.filtered && !kieResult.url) {
          console.log(`[Newsroom] Kie AI content-filtered, retrying with safe prompt for article ${articleId}`);
          const categoryScene = {
            tech: [
              'Extreme macro shot of solder joints on a green PCB with shallow depth of field and warm amber backlight',
              'Dark server room corridor with rows of blinking rack servers, cold blue fog on the floor, cinematic wide angle',
              'Abstract 3D render of floating geometric data nodes connected by neon wireframe lines in dark space',
              'Isometric illustration of interconnected microservices architecture, vibrant colors on dark background',
              'Retro CRT monitor displaying green terminal text in a dim 80s office, scanlines and VHS aesthetic',
            ],
            hardware: [
              'Cinematic overhead shot of a disassembled laptop on a dark workbench with dramatic side lighting',
              'Extreme macro of a GPU die with visible circuits, rainbow light refraction, shallow depth of field',
              'Technical blueprint schematic of a motherboard layout, white lines on dark navy background',
            ],
            ai: [
              'Abstract visualization of a neural network with glowing magenta and cyan synaptic connections in void',
              'Isometric 3D render of a machine learning pipeline with data flowing through connected processing nodes',
              'Dark moody shot of multiple screens showing real-time data visualizations in amber and green',
            ],
            enterprise: [
              'Aerial view of a modern data center campus at twilight with cool blue interior glow visible through windows',
              'Dark control room with curved monitor wall showing infrastructure dashboards, operator silhouette',
              'Isometric illustration of cloud infrastructure with load balancers, databases, and API gateways',
            ],
          };
          const scenes = categoryScene[article.category] || categoryScene.tech;
          const safePrompt = scenes[Math.floor(Math.random() * scenes.length)] + '. Photorealistic, cinematic lighting.';
          imgData.prompt = safePrompt;
          kieResult = await kieGenerate(safePrompt);
        }

        if (kieResult.error) {
          console.error(`[Newsroom] Kie AI failed: ${kieResult.error}`);
        }

        if (kieResult.url) {
          const imgDir = path.join(__dirname, 'public', 'images', 'articles');
          fs.mkdirSync(imgDir, { recursive: true });
          const imgResp = await fetch(kieResult.url, { signal: AbortSignal.timeout(30000) });
          if (imgResp.ok) {
            const buf = Buffer.from(await imgResp.arrayBuffer());
            const filename = `article-${articleId}.png`;
            fs.writeFileSync(path.join(imgDir, filename), buf);
            imageUrl = `/images/articles/${filename}`;
            console.log(`[Newsroom] Saved Kie AI image for article ${articleId}`);
          }
        }
      } catch (e) {
        console.error('[Newsroom] Kie AI error:', e.message);
      }
    }

    const current = db.articles.get(articleId);
    db.articles.update(articleId, {
      ...current,
      image_url: imageUrl,
      image_prompt: imgData.prompt,
      source_urls: JSON.parse(current.source_urls || '[]'),
    });

    db.agentLog.create({
      article_id: articleId,
      agent: 'graphic_designer',
      action: 'generate_image',
      input_text: article.title,
      output_text: imgData.prompt,
      model: result.model,
      tokens_used: result.tokens,
    });

    return { imageUrl };
  } catch (e) {
    console.error('[Newsroom] Graphic designer error:', e.message);
    return { imageUrl: null, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// FULL PIPELINE
// ---------------------------------------------------------------------------
async function runNewsCycle() {
  console.log('[Newsroom] Starting news cycle...');
  const startTime = Date.now();
  db.meta.set('last_cycle_at', new Date().toISOString());

  const settings = getSettings();
  const maxPerDay = settings.max_articles_per_day || 18;

  try {
    console.log('[Newsroom] Scanning sources...');
    const newLeads = await scanSources();
    console.log(`[Newsroom] Found ${newLeads.length} new leads`);

    const allPending = db.leads.pending();
    if (allPending.length === 0) {
      console.log('[Newsroom] No leads to process');
      return { leads: 0, articles: 0 };
    }

    // Deduplicate leads against existing articles
    const uniqueLeads = deduplicateLeads(allPending);
    console.log(`[Newsroom] ${uniqueLeads.length} unique leads after dedup (filtered ${allPending.length - uniqueLeads.length})`);

    if (uniqueLeads.length === 0) {
      console.log('[Newsroom] All leads were duplicates');
      return { leads: 0, articles: 0, deduplicated: allPending.length };
    }

    console.log('[Newsroom] Managing editor reviewing leads...');
    const selected = await managingEditor(uniqueLeads);
    console.log(`[Newsroom] Selected ${selected.length} stories`);

    // Check daily limit
    const todayCount = db.articles.todayScheduledCount();
    const remaining = Math.max(0, maxPerDay - todayCount);
    const toProcess = selected.slice(0, Math.min(selected.length, remaining + 3)); // allow buffer for rejected ones
    if (toProcess.length < selected.length) {
      console.log(`[Newsroom] Daily limit (${maxPerDay}): processing ${toProcess.length} of ${selected.length} selected`);
    }

    const articleIds = [];
    for (const lead of toProcess) {
      try {
        // Second dedup check (in case another cycle ran concurrently)
        if (isDuplicate(lead.title)) {
          console.log(`[Newsroom] Dedup: skipping "${lead.title}" at write stage`);
          continue;
        }

        console.log(`[Newsroom] Researcher investigating: ${lead.title}`);
        let research = { summary: '', key_facts: [], additional_urls: [], sources: [] };
        try {
          research = await researcher(lead);
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          console.error(`[Newsroom] Researcher error for "${lead.title}":`, e.message);
        }

        console.log(`[Newsroom] Reporter writing: ${lead.title}`);
        const id = await reporter(lead, research);
        if (id) articleIds.push({ id, score: lead.score || 0 });
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[Newsroom] Reporter error for "${lead.title}":`, e.message);
      }
    }

    for (const { id } of articleIds) {
      try {
        console.log(`[Newsroom] Copy editor reviewing article ${id}...`);
        await copyEditor(id);
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.error(`[Newsroom] Copy editor error for article ${id}:`, e.message);
      }
    }

    const passedIds = [];
    for (const { id, score } of articleIds) {
      try {
        console.log(`[Newsroom] Fact checker reviewing article ${id}...`);
        const check = await factChecker(id);
        if (check.verdict !== 'underkänd') passedIds.push({ id, score });
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.error(`[Newsroom] Fact checker error for article ${id}:`, e.message);
        passedIds.push({ id, score });
      }
    }

    // Generate images with per-article timeout (max 90s each) to prevent pipeline hangs
    const forImages = [];
    for (const { id } of passedIds) {
      try {
        const imagePromise = graphicDesigner(id);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Image gen timeout (90s)')), 90000));
        const result = await Promise.race([imagePromise, timeoutPromise]);
        if (result?.imageUrl) forImages.push(id);
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.error(`[Newsroom] Image gen failed for article ${id}: ${e.message}`);
      }
    }
    console.log(`[Newsroom] Generated images for ${forImages.length}/${passedIds.length} articles`);

    // Auto-publish: approve articles immediately
    let publishedCount = 0;
    for (const { id } of passedIds) {
      db.articles.publishScheduled(id);
      publishedCount++;
      console.log(`[Newsroom] Published article ${id} immediately`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Newsroom] Cycle complete: ${publishedCount} published, ${forImages.length} with images, of ${articleIds.length} written in ${elapsed}s`);
    return { leads: selected.length, articles: articleIds.length, published: publishedCount, withImages: forImages.length, elapsed };
  } catch (e) {
    console.error('[Newsroom] News cycle error:', e.message);
    return { error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Scheduled runner — with failure tracking
// ---------------------------------------------------------------------------
let cycleTimer = null;
let consecutiveFailures = 0;

async function trackedNewsCycle() {
  try {
    const result = await runNewsCycle();
    if (result.error) {
      consecutiveFailures++;
      db.meta.set('cycle_failures', String(consecutiveFailures));
      console.error(`[Newsroom] ⚠ Cycle returned error (${consecutiveFailures} consecutive): ${result.error}`);
    } else {
      if (consecutiveFailures > 0) console.log(`[Newsroom] Cycle recovered after ${consecutiveFailures} failures`);
      consecutiveFailures = 0;
      db.meta.set('cycle_failures', '0');
    }
    if (consecutiveFailures >= 3) {
      console.error(`[Newsroom] 🚨 ALERT: ${consecutiveFailures} consecutive cycle failures! Pipeline may be broken.`);
    }
    return result;
  } catch (e) {
    consecutiveFailures++;
    db.meta.set('cycle_failures', String(consecutiveFailures));
    console.error(`[Newsroom] ⚠ Cycle crashed (${consecutiveFailures} consecutive): ${e.message}`);
    if (consecutiveFailures >= 3) {
      console.error(`[Newsroom] 🚨 ALERT: ${consecutiveFailures} consecutive cycle failures! Pipeline may be broken.`);
    }
    return { error: e.message };
  }
}

function startScheduler() {
  const settings = getSettings();
  const interval = (settings.scan_interval || 14400) * 1000;
  consecutiveFailures = parseInt(db.meta.get('cycle_failures') || '0', 10);
  if (consecutiveFailures > 0) console.warn(`[Newsroom] ⚠ Resuming with ${consecutiveFailures} previous consecutive failures`);
  console.log(`[Newsroom] Scheduler started — cycle every ${interval / 60000} min`);

  // Only run initial cycle if enough time has passed since the last one
  const lastCycle = db.meta.get('last_cycle_at');
  const elapsed = lastCycle ? Date.now() - new Date(lastCycle).getTime() : Infinity;
  if (elapsed >= interval) {
    setTimeout(() => trackedNewsCycle(), 30000);
  } else {
    const nextIn = Math.round((interval - elapsed) / 60000);
    console.log(`[Newsroom] Last cycle was ${Math.round(elapsed / 60000)} min ago — next in ~${nextIn} min`);
  }

  cycleTimer = setInterval(() => trackedNewsCycle(), interval);
}

function stopScheduler() {
  if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; }
}

// ---------------------------------------------------------------------------
// Scheduled publisher — runs every minute, publishes articles whose time has come
// ---------------------------------------------------------------------------
let publishTimer = null;

function runPublishCheck() {
  try {
    const ready = db.articles.scheduled();
    for (const a of ready) {
      db.articles.publishScheduled(a.id);
      console.log(`[Newsroom] Auto-published article ${a.id}: ${a.title}`);
    }
    if (ready.length > 0) console.log(`[Newsroom] Published ${ready.length} scheduled articles`);
  } catch (e) {
    console.error('[Newsroom] Publisher error:', e.message);
  }
}

function startPublisher() {
  console.log('[Newsroom] Scheduled publisher started — checking every 60s');
  runPublishCheck(); // immediate check on startup
  publishTimer = setInterval(runPublishCheck, 60000);
}

function stopPublisher() {
  if (publishTimer) { clearInterval(publishTimer); publishTimer = null; }
}

// ---------------------------------------------------------------------------
// Weekly chronicle — generates two special articles each Sunday
// ---------------------------------------------------------------------------
async function generateWeeklyChronicle() {
  console.log('[Newsroom] Generating weekly chronicle...');

  // Get this week's approved articles
  const weekArticles = db.getDb().prepare(
    "SELECT * FROM articles WHERE status = 'approved' AND published_at >= datetime('now', '-7 days') ORDER BY published_at DESC"
  ).all();

  if (weekArticles.length < 3) {
    console.log('[Newsroom] Not enough articles for weekly chronicle');
    return;
  }

  const articleSummaries = weekArticles.slice(0, 25).map(a =>
    `- [${a.category}] "${a.title}" (${a.byline}) — ${a.summary || ''}`
  ).join('\n');

  // 1. Fuller Stackman's weekly summary
  try {
    const summaryResult = await llm([
      {
        role: 'system',
        content: `Du är Fuller Stackman, chefredaktör på Redaktionen.net. Skriv en engagerande veckokrönika som sammanfattar veckans viktigaste teknikhändelser.

Stilen ska vara: reflekterande, kunnig, lite personlig. Du tittar tillbaka på veckan och lyfter de viktigaste trenderna.
Skriv på svenska. Längd: 400-700 ord.

Svara i JSON: { "title": "...", "summary": "ingress 2-3 meningar...", "body": "brödtext med \\n\\n för stycken..." }`
      },
      {
        role: 'user',
        content: `Skriv en veckokrönika baserad på dessa artiklar som publicerades under veckan:\n${articleSummaries}`
      }
    ], { json: true, temperature: 0.7, max_tokens: 2500, model: agentModel('managing_editor') });

    const summary = JSON.parse(summaryResult.content);
    const id = db.articles.create({
      lead_id: null,
      title: summary.title || 'Veckans teknik',
      summary: summary.summary,
      body: summary.body,
      category: 'tech',
      status: 'scheduled',
      tone: 'chronicle',
      source_urls: [],
      byline: 'Fuller Stackman',
      priority: 7,
      content_hash: contentHash(summary.title || 'veckokronika'),
    });
    const publishTime = calculatePublishTime(7);
    db.articles.schedule(id, publishTime);
    console.log(`[Newsroom] Weekly summary by Fuller Stackman scheduled: article ${id}`);

    db.agentLog.create({
      article_id: id,
      agent: 'managing_editor',
      action: 'weekly_chronicle',
      input_text: `Veckokrönika — ${weekArticles.length} artiklar`,
      output_text: summaryResult.content.slice(0, 2000),
      model: summaryResult.model,
      tokens_used: summaryResult.tokens,
    });
  } catch (e) {
    console.error('[Newsroom] Weekly summary error:', e.message);
  }

  // 2. Top reporter deep-dive
  try {
    // Find the reporter with most articles this week
    const bylineCount = {};
    for (const a of weekArticles) {
      if (a.byline && a.byline !== 'Fuller Stackman' && a.byline !== 'Redaktionen') {
        bylineCount[a.byline] = (bylineCount[a.byline] || 0) + 1;
      }
    }
    const topReporter = Object.entries(bylineCount).sort((a, b) => b[1] - a[1])[0];
    if (!topReporter) return;

    const reporterName = topReporter[0];
    const reporterArticles = weekArticles.filter(a => a.byline === reporterName);
    const topCategory = reporterArticles[0]?.category || 'tech';

    const rArticles = reporterArticles.slice(0, 10).map(a =>
      `- "${a.title}" — ${a.summary || ''}`
    ).join('\n');

    const deepResult = await llm([
      {
        role: 'system',
        content: `Du är ${reporterName}, reporter på Redaktionen.net. Skriv en djupdykning/analys baserat på veckans teknikhändelser inom ditt område.

Välj ETT tema från veckans artiklar och gräv djupare: ge bakgrund, kontext, vad det betyder för användare, och blicka framåt.
Stilen ska vara: analytisk, nördig, engagerande. Skriv på svenska. Längd: 500-800 ord.

Svara i JSON: { "title": "...", "summary": "ingress 2-3 meningar...", "body": "brödtext med \\n\\n för stycken..." }`
      },
      {
        role: 'user',
        content: `Skriv en djupdykning baserad på dessa artiklar du skrev under veckan:\n${rArticles}`
      }
    ], { json: true, temperature: 0.7, max_tokens: 3000, model: agentModel('reporter') });

    const deep = JSON.parse(deepResult.content);
    const deepId = db.articles.create({
      lead_id: null,
      title: deep.title || 'Veckans djupdykning',
      summary: deep.summary,
      body: deep.body,
      category: topCategory,
      status: 'scheduled',
      tone: 'analysis',
      source_urls: [],
      byline: reporterName,
      priority: 6,
      content_hash: contentHash(deep.title || 'djupdykning'),
    });
    const publishTime2 = calculatePublishTime(6);
    db.articles.schedule(deepId, publishTime2);
    console.log(`[Newsroom] Weekly deep-dive by ${reporterName} scheduled: article ${deepId}`);

    db.agentLog.create({
      article_id: deepId,
      agent: 'reporter',
      action: 'weekly_deepdive',
      input_text: `Djupdykning: ${reporterName} — ${reporterArticles.length} artiklar`,
      output_text: deepResult.content.slice(0, 2000),
      model: deepResult.model,
      tokens_used: deepResult.tokens,
    });
  } catch (e) {
    console.error('[Newsroom] Weekly deep-dive error:', e.message);
  }
}

module.exports = {
  scanSources,
  managingEditor,
  researcher,
  reporter,
  copyEditor,
  factChecker,
  rewriteArticle,
  graphicDesigner,
  runNewsCycle,
  startScheduler,
  stopScheduler,
  startPublisher,
  stopPublisher,
  runPublishCheck,
  generateWeeklyChronicle,
};
