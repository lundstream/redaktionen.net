// social-poster.js — auto-post published articles to Mastodon, Bluesky, Telegram, X
//
// All four are optional. If the relevant settings keys are missing or empty,
// that platform is silently skipped. Failures never throw — they just log.
//
// settings.json keys used:
//   mastodon_instance        e.g. "mastodon.social"
//   mastodon_token           Bearer token (account scope "write:statuses")
//
//   bluesky_handle           e.g. "redaktionen.bsky.social"
//   bluesky_app_password     app password from bsky.app/settings/app-passwords
//
//   telegram_bot_token       "123456:AAE..."
//   telegram_chat_id         "@channelname" or numeric id
//
//   x_api_key                aka "Consumer Key" / "API Key"
//   x_api_secret             aka "Consumer Secret"
//   x_access_token           user-context access token (for the posting account)
//   x_access_token_secret    user-context access token secret
//
// Site base URL:
//   site_url                 defaults to "https://redaktionen.net"

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getSettings() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf8'));
  } catch { return {}; }
}

function siteUrl() {
  return (getSettings().site_url || 'https://redaktionen.net').replace(/\/$/, '');
}

function articleUrl(articleId) {
  return `${siteUrl()}/artikel/${articleId}`;
}

function catHashtag(cat) {
  const map = { tech: '#tech', hardware: '#hardware', ai: '#ai', enterprise: '#enterprise' };
  return map[cat] || '#tech';
}

function composeMessage(article, maxLen) {
  const url = articleUrl(article.id);
  const tag = `${catHashtag(article.category)} #svtech`;
  // Room for: title + newline + url + newline + tags
  const reserve = url.length + tag.length + 6;
  let title = (article.title || '').trim();
  if (title.length + reserve > maxLen) {
    title = title.slice(0, maxLen - reserve - 1) + '…';
  }
  return `${title}\n\n${url}\n\n${tag}`;
}

// ---------------------------------------------------------------------------
// Mastodon — POST /api/v1/statuses
// ---------------------------------------------------------------------------
async function postMastodon(article) {
  const s = getSettings();
  if (!s.mastodon_token || !s.mastodon_instance) return { skipped: 'mastodon_not_configured' };
  const instance = s.mastodon_instance.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const status = composeMessage(article, 500);
  try {
    const resp = await fetch(`https://${instance}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${s.mastodon_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, visibility: 'public', language: 'sv' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { error: `Mastodon ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const data = await resp.json();
    return { url: data.url || data.uri };
  } catch (e) {
    return { error: `Mastodon: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// Bluesky — com.atproto.server.createSession + com.atproto.repo.createRecord
// ---------------------------------------------------------------------------
let bskySession = null; // { did, accessJwt, refreshJwt, expiresAt }

async function bskyLogin() {
  const s = getSettings();
  if (!s.bluesky_handle || !s.bluesky_app_password) return null;
  if (bskySession && bskySession.expiresAt > Date.now() + 60000) return bskySession;
  try {
    const resp = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: s.bluesky_handle, password: s.bluesky_app_password }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`Bluesky login ${resp.status}`);
    const data = await resp.json();
    bskySession = {
      did: data.did,
      accessJwt: data.accessJwt,
      refreshJwt: data.refreshJwt,
      // access JWT is valid ~2h; refresh just-in-time after ~90 min
      expiresAt: Date.now() + 90 * 60 * 1000,
    };
    return bskySession;
  } catch (e) {
    console.error('[SocialPoster] Bluesky login error:', e.message);
    return null;
  }
}

// Find byte-offset facets for URLs in UTF-8 text
function bskyFacets(text) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const str = new TextDecoder().decode(bytes); // ensures consistent
  const facets = [];
  const urlRe = /(https?:\/\/[^\s]+)/g;
  let m;
  while ((m = urlRe.exec(text)) !== null) {
    const byteStart = encoder.encode(text.slice(0, m.index)).length;
    const byteEnd = byteStart + encoder.encode(m[0]).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }],
    });
  }
  // Hashtags
  const tagRe = /(^|\s)#([\w\-]+)/g;
  while ((m = tagRe.exec(text)) !== null) {
    const tagFull = m[0].startsWith('#') ? m[0] : m[0].slice(1);
    const start = m.index + (m[1] ? m[1].length : 0);
    const byteStart = encoder.encode(text.slice(0, start)).length;
    const byteEnd = byteStart + encoder.encode(`#${m[2]}`).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[2] }],
    });
  }
  return facets;
}

async function postBluesky(article) {
  const session = await bskyLogin();
  if (!session) return { skipped: 'bluesky_not_configured' };
  const text = composeMessage(article, 300); // Bluesky limit
  try {
    const resp = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.accessJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: session.did,
        collection: 'app.bsky.feed.post',
        record: {
          $type: 'app.bsky.feed.post',
          text,
          facets: bskyFacets(text),
          createdAt: new Date().toISOString(),
          langs: ['sv'],
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      // On auth failure, force re-login next time
      if (resp.status === 401) bskySession = null;
      const txt = await resp.text();
      return { error: `Bluesky ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const data = await resp.json();
    return { url: data.uri };
  } catch (e) {
    return { error: `Bluesky: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// Telegram — sendMessage to channel
// ---------------------------------------------------------------------------
async function postTelegram(article) {
  const s = getSettings();
  if (!s.telegram_bot_token || !s.telegram_chat_id) return { skipped: 'telegram_not_configured' };
  const url = articleUrl(article.id);
  const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const text = `<b>${esc(article.title)}</b>\n\n${esc(article.summary || '').slice(0, 400)}\n\n<a href="${url}">Läs mer på redaktionen.net</a>`;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${s.telegram_bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: s.telegram_chat_id,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { error: `Telegram ${resp.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { error: `Telegram: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// Discord — category-specific webhooks (no bot token needed)
// ---------------------------------------------------------------------------
const DISCORD_COLORS = {
  tech: 0x58a6ff,
  hardware: 0xf85149,
  ai: 0xa371f7,
  enterprise: 0x3fb950,
};

async function postDiscord(article) {
  const s = getSettings();
  const hooks = s.discord_webhooks || {};
  const cat = (article.category || 'tech').toLowerCase();
  const url = hooks[cat] || hooks.tech;
  if (!url) return { skipped: 'discord_not_configured' };
  const link = articleUrl(article.id);
  const description = String(article.summary || '').slice(0, 350);
  const image = article.image_url || article.hero_image || article.image;
  const embed = {
    title: String(article.title || '').slice(0, 250),
    url: link,
    description,
    color: DISCORD_COLORS[cat] || DISCORD_COLORS.tech,
    timestamp: new Date().toISOString(),
    footer: { text: `redaktionen.net · ${cat}` },
  };
  if (image) embed.image = { url: image.startsWith('http') ? image : `${siteUrl()}${image}` };
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { error: `Discord ${resp.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { error: `Discord: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// X (Twitter) — POST /2/tweets with OAuth 1.0a user-context signing
// ---------------------------------------------------------------------------
function oauthPercent(str) {
  // RFC 3986 percent-encoding (stricter than encodeURIComponent)
  return encodeURIComponent(str)
    .replace(/!/g, '%21').replace(/\*/g, '%2A')
    .replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function oauthSignature(method, url, params, consumerSecret, tokenSecret) {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys
    .map(k => `${oauthPercent(k)}=${oauthPercent(params[k])}`)
    .join('&');
  const baseString = [
    method.toUpperCase(),
    oauthPercent(url),
    oauthPercent(paramString),
  ].join('&');
  const signingKey = `${oauthPercent(consumerSecret)}&${oauthPercent(tokenSecret || '')}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

function oauthHeader(method, url, bodyJson, s) {
  const oauthParams = {
    oauth_consumer_key: s.x_api_key,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: s.x_access_token,
    oauth_version: '1.0',
  };
  // Per X docs, for JSON body requests the body is NOT included in the signature base string.
  const sig = oauthSignature(method, url, oauthParams, s.x_api_secret, s.x_access_token_secret);
  oauthParams.oauth_signature = sig;
  return 'OAuth ' + Object.keys(oauthParams).sort()
    .map(k => `${oauthPercent(k)}="${oauthPercent(oauthParams[k])}"`)
    .join(', ');
}

async function postX(article) {
  const s = getSettings();
  if (!s.x_api_key || !s.x_api_secret || !s.x_access_token || !s.x_access_token_secret) {
    return { skipped: 'x_not_configured' };
  }
  // Score gate — X Free tier caps at ~500 posts/month (~16/day), so only post top-priority articles.
  // Default threshold 7; disable by setting x_min_score: 0.
  const minScore = s.x_min_score != null ? Number(s.x_min_score) : 7;
  const priority = Number(article.priority || 0);
  if (minScore > 0 && priority < minScore) {
    return { skipped: `x_below_threshold (priority ${priority} < ${minScore})` };
  }
  const url = 'https://api.twitter.com/2/tweets';
  const text = composeMessage(article, 280);
  const body = JSON.stringify({ text });
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': oauthHeader('POST', url, body, s),
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { error: `X ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const data = await resp.json();
    const id = data.data?.id;
    return { url: id ? `https://x.com/i/web/status/${id}` : 'ok' };
  } catch (e) {
    return { error: `X: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// Broadcast — post to all configured platforms. Never throws.
// On transient failures (5xx, network, timeout) retries the failed platforms
// once after a 30s delay. 4xx errors (auth, bad request) are NOT retried.
// ---------------------------------------------------------------------------
const POSTERS = [
  { name: 'mastodon', fn: postMastodon, okKey: 'url' },
  { name: 'bluesky',  fn: postBluesky,  okKey: 'url' },
  { name: 'telegram', fn: postTelegram, okKey: 'ok'  },
  { name: 'discord',  fn: postDiscord,  okKey: 'ok'  },
  { name: 'x',        fn: postX,        okKey: 'url' },
];

function isTransient(err) {
  if (!err) return false;
  // Recognize: 5xx HTTP, timeouts, fetch network errors
  if (/\b5\d\d\b/.test(err)) return true;
  if (/timeout|AbortError|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(err)) return true;
  return false;
}

async function runPoster(poster, article) {
  try {
    return await poster.fn(article);
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

async function broadcast(article) {
  if (!article || !article.id) return;

  // First pass — fire all in parallel
  const first = await Promise.all(POSTERS.map(p => runPoster(p, article)));

  // Identify retry candidates (transient errors only)
  const retryIdx = [];
  first.forEach((res, i) => {
    if (res && res.error && isTransient(res.error)) retryIdx.push(i);
  });

  // Retry pass after 30s
  if (retryIdx.length) {
    console.log(`[SocialPoster] Article ${article.id}: retrying in 30s for ${retryIdx.map(i => POSTERS[i].name).join(', ')}`);
    await new Promise(r => setTimeout(r, 30000));
    await Promise.all(retryIdx.map(async i => {
      const res = await runPoster(POSTERS[i], article);
      first[i] = res;
    }));
  }

  // Persist per-platform outcomes to broadcast_log for admin visibility
  let broadcastLog;
  try { ({ broadcastLog } = require('./newsroom-db')); } catch {}

  const classify = (res, okKey) => {
    if (!res) return { status: 'skipped', detail: 'no result' };
    if (res.skipped) return { status: 'skipped', detail: res.skipped };
    if (res.error) return { status: 'failed', detail: res.error };
    if (okKey === 'ok' ? res.ok : res[okKey]) return { status: 'ok', detail: res.url || null };
    return { status: 'skipped', detail: 'not configured' };
  };

  const [mast, bsky, tg, dc, x] = first;
  const summary = [
    { platform: 'mastodon', ...classify(mast, 'url') },
    { platform: 'bluesky',  ...classify(bsky, 'url') },
    { platform: 'telegram', ...classify(tg,   'ok')  },
    { platform: 'discord',  ...classify(dc,   'ok')  },
    { platform: 'x',        ...classify(x,    'url') },
  ];
  if (broadcastLog) {
    for (const s of summary) {
      try { broadcastLog.record(article.id, s.platform, s.status, s.detail); } catch (e) {
        console.error(`[SocialPoster] broadcast_log write failed: ${e.message}`);
      }
    }
  }

  const parts = summary.map(s => {
    if (s.status === 'ok') return `${s.platform} ok`;
    if (s.status === 'failed') return `${s.platform} FAIL: ${s.detail}`;
    if (s.status === 'skipped' && s.detail && s.detail.startsWith('x_below_threshold')) return 'x skipped (low priority)';
    return null;
  }).filter(Boolean);

  if (parts.length) {
    console.log(`[SocialPoster] Article ${article.id}: ${parts.join(' · ')}`);
  }
  return { mastodon: mast, bluesky: bsky, telegram: tg, discord: dc, x };
}

module.exports = { broadcast, postMastodon, postBluesky, postTelegram, postDiscord, postX };
