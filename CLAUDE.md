# redaktionen.net — Project Notes

AI-driven Swedish tech news site. Node/Express + better-sqlite3 on `localhost:3040`.
Repo: https://github.com/lundstream/redaktionen.net

## Stack

- `server.js` — Express, `pageShell()` renders server-side pages (article, category, om-oss, kontakt)
- `public/index.html` — static homepage with client-side feed/sidebar/search
- `newsroom.js` — AI pipeline (managing editor → researcher → reporter → copy editor → fact checker → graphic designer → publisher)
- `db.js` / `newsroom-db.js` — better-sqlite3
- `settings.json` — git-ignored, holds all API keys and schedule knobs

## Scheduler (settings.json)

- `scan_interval`: seconds between cycles (currently **2700 = 45 min**)
- `articles_per_cycle`: **2**
- `max_articles_per_day`: **18** (hard cap)
- No admin UI for these yet — edit `settings.json` and restart server

## Images

Every approved article gets an image attempt via `graphicDesigner()`:

1. **Brave Images first** (`searchProductImage()`) — only if `brave_search_key` is set AND the LLM classifies the article as `is_product: true` (phones, GPUs, laptops, etc.). Downloads first valid result >5 KB from Brave image search.
2. **Kie AI `nano-banana-2`** fallback — generates illustration with one of 7 rotating visual styles (macro / moody / abstract / isometric / cinematic / retro / schematic). 16:9, 1K, ~15–30 s, $0.01/image. 90 s per-article timeout.
3. If `kie_api_key` is empty → no image generation happens at all.

No setting exists to limit image count per cycle — it's 1-to-1 with published articles.

## Header / Homepage layout

- Two-row header: `.header-top` (brand + clock) + `.header-nav-bar` (nav + inline search)
- Inline search dropdown `#search-results.header-search-results.open`, closes on outside click or Escape, Ctrl/Cmd+K focus
- 2fr / 1fr grid (`.content-layout`) — **both columns need `min-width: 0`** or long content breaks the ratio
- Category pages: max-width 1360px, `<span class="cat-tag cat-${cat}">` heading, same ad-banner + ad-slot structure

## Sidebar "Live Terminal" (fake)

- `#terminal-block` above `// Senaste` in sidebar
- Pure client-side JS picks from template array every 2.2 s; simulates agents, Brave, OpenAI, Kie, cache, pipeline events
- macOS traffic-light chrome, pulsing green LIVE dot, timestamp + colored tags (OK/WARN/PASS/APPROVED)
- Fixed height `calc(10 * 1.55em + 8px)`, lines wrap (`white-space: normal; word-break: break-word`); oldest trimmed while `scrollHeight > clientHeight`
- Seed loop keeps filling until box is full
- Hidden on mobile

## AdSense

- `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1715654756257886" crossorigin="anonymous"></script>`
- Added in both `public/index.html` and `server.js` → `pageShell()` head
- `public/ads.txt` served from static root: `google.com, pub-1715654756257886, DIRECT, f08c47fec0942fa0`

## Om oss page

- Section "Så fungerar redaktionen" with flow illustration
- Image generated via Kie nano-banana-2 → saved to `public/about-flow.png` (6.3 MB, 16:9)
- Generator script: `scripts/gen-about-image.js` (one-shot, reads `kie_api_key` from settings)

## Team strip (REDAKTIONEN)

- 9 AI-agent cards on homepage: Fuller Stackman (editor), Sven Googlund (researcher), Linus Kärna (tech), Hardy Chipström (hardware), Albert Promtsson (ai), Vera Workspace (enterprise), Glosa Grammar (copyedit), Klara Faktelius (factcheck), Pixel Peepgren (design)
- Grid forced to `repeat(9, 1fr)` so all fit one row on desktop; 3 cols on mobile

## Operational rules (for future sessions)

- **Always restart the node server after editing `server.js`** — don't just tell the user to restart. Use:
  ```powershell
  Get-NetTCPConnection -LocalPort 3040 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
  Start-Sleep 1
  node c:\Dev\redaktionen-net\server.js
  ```
  (use absolute path; VS Code terminal keeps resetting cwd to `C:\Dev`)
- Edits to `public/index.html` are served directly — no restart needed
- `settings.json` is git-ignored; never commit keys
- Use Lucide icons only (no emojis) for UI — existing pattern: `<i data-lucide="..." class="luc"></i>` + `refreshIcons()`
- Stockholm timezone for date formatting; same-day → "Today HH:mm"

## Recent commits

- `0d91224` Live terminal, AdSense, Brave Images, ads.txt, about flow image
- Initial commit — two-row header + inline search + badge card layout + category pages
