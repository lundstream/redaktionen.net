# Marketing Strategy — redaktionen.net

Your advantage: **fresh content hourly, Swedish-language tech news, zero human bottleneck**.
Your disadvantage: **new domain, no backlinks, no brand trust**. Build around the advantage.

## 1. SEO (highest ROI — do this first)

- **Make every article rank for a long-tail query.** Right now titles are editorial ("Intels nya Wildcat Lake..."). Add in-body `<h2>` subheadings that match Swedish search queries ("Vad är Wildcat Lake?", "När släpps…", "Pris i Sverige").
- **Schema.org `NewsArticle` JSON-LD** on every article page — headline, datePublished, author, image, publisher. Gets you into Google News/Discover eligibility.
- **Submit to Google News Publisher Center** (`publishercenter.google.com`) — free, biggest single traffic lever for a news site.
- **`sitemap.xml` + `robots.txt`** with dynamic sitemap of last 1000 articles, `<lastmod>` timestamps. Submit in Google Search Console + Bing Webmaster Tools.
- **Internal linking:** add "Relaterade artiklar" block at the bottom (same category, recent). Also auto-link product/company names to their tag page.
- **Swedish tech keywords that convert:** "bäst i test", "release datum Sverige", "pris Sverige", "recension", "jämförelse". Target these explicitly.

## 2. Discovery platforms (free, high intent)

- **Flashback `Teknik`** subforum — post genuinely useful articles (not spam) with your link. Swedish tech readers live there.
- **Reddit** `r/sweden`, `r/svenskpolitik` (for AI/enterprise/regulation crossover). Skip `r/swedishmemes` — won't convert.
- **Hacker News** — English summary with Swedish article link, only for genuinely interesting pieces (DIY DRAM YouTuber story would've worked).
- **Swedish tech Discord/Slack groups** — Programmerare, Dataföreningen communities.
- **LinkedIn**: auto-post enterprise/AI category articles to a company page. This is where Swedish B2B tech readers are.

## 3. Social auto-posting (cheap to implement)

Add a hook after `publishScheduled()` that posts to:
- **X/Twitter** (`@redaktionen_net`) — headline + link + auto-generated image. Free API tier = 500 posts/month, plenty.
- **Mastodon** (`@redaktionen@mastodon.social`) — Swedish tech crowd is disproportionately on Mastodon. Free API, no limits.
- **Bluesky** — growing fast in Sweden, free API.
- **Telegram channel** — zero-friction, a lot of Swedish tech news readers subscribe to channels.

One hour in code, runs forever.

## 4. RSS & syndication

- **Expose `/feed.xml`** (RSS/Atom) prominently. Swedish tech readers use Feedly/NetNewsWire/Readwise.
- **Submit to:** Feedly (category: Technology/Sweden), Inoreader, Feeder.
- **IFTTT/Zapier templates** — "Get redaktionen.net tech news in Slack" — generates backlinks.

## 5. Email newsletter (highest LTV reader)

- "Dagens 5" — morning digest at 08:00 CET with the night's best articles.
- Use **Buttondown** or **Resend** ($0 tier, 3k emails/mo). Mailchimp is overkill.
- Adds a recurring habit; those readers return daily and click more ads.

## 6. Visibility / authority signals

- **About page** — you already have one with the AI team. Good. Add a "metodik" page explaining how AI writes, with fact-check process. Transparency builds trust with Swedish readers specifically (they're skeptical of AI content).
- **Byline disclosure:** keep "Pixel Peepgren" etc. but add small "AI-assisterad journalistik" tag. Required under EU AI Act from Aug 2026 anyway — be ahead.
- **Contact page with real email** — Google rankings weigh E-E-A-T; a site with no contact info ranks lower.

## 7. Paid (optional, only if break-even)

- Skip Google Ads / Meta Ads — you'll lose money; Swedish tech CPMs are expensive and intent-matched traffic is cheaper via SEO.
- **If** you want to experiment: Reddit Ads on `r/sweden` ($5/day) to test. Or sponsor a Swedish tech podcast's newsletter for a flat ~500 SEK.

## Priority order (this week)

1. **Google News Publisher Center submission** (free, 1 h, biggest lever)
2. **Sitemap + JSON-LD NewsArticle schema** (code change, 2–3 h) — implemented 2026-04-23
3. **Auto-post to Mastodon + Bluesky + Telegram** (2 h code, free, runs forever) — implemented 2026-04-23
4. **RSS feed submitted to Feedly** (15 min)
5. Start posting 2–3 articles/week manually to Flashback Teknik + relevant Reddit threads
6. Launch daily-digest newsletter once ~100 subscribers express interest

## Realistic trajectory (27 articles/day)

| Phase | Timeframe | Visitors/day |
|---|---|---|
| Launch | Week 2–4 | 20–50 (direct + Mastodon/Flashback) |
| Google indexing | Month 2–3 | 100–300 |
| Google News trusted | Month 4–6 | 500–1500 |

That's when AdSense flips from loss to profit.

## Break-even reference (at ~$1.30/day cost)

| AdSense RPM | Visitors/day for break-even |
|---|---|
| $2 (pessimistic) | ~500 |
| $4 (realistic) | ~250 |
| $6 (good) | ~170 |
| $8 (optimistic) | ~125 |


## Next manual marketing steps for you:

Submit to Google News Publisher Center: https://publishercenter.google.com
Add domain to Google Search Console and submit https://redaktionen.net/sitemap.xml
Same for Bing Webmaster Tools
Submit RSS feed to Feedly (search redaktionen.net on feedly.com)