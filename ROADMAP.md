# Roadmap — redaktionen.net

Tracking UX + reliability improvements. Items grouped by impact.

## In progress

- [ ] **2. Kie AI timeout resilience** — Retry 2× with backoff in `graphicDesigner`. Flag articles published without image as needs-attention.

## High-impact UX

- [ ] **4. Reading width + deck hierarchy** — Cap body copy at ~70ch; visually separate summary/deck from first paragraph.
- [ ] **5. "Senast uppdaterad" timestamps** — Track and show `updated_at` when ≠ `published_at`.
- [ ] **6. Related articles block** — 3 same-category articles at end of each article body.
- [ ] **7. Reading time estimate** — Under byline: `Math.ceil(words/200)` min.
- [ ] **8. Comment submission state** — "Din kommentar granskas" feedback after submit.

## Performance

- [ ] **10. Self-host fonts** — Space Grotesk + JetBrains Mono locally with `font-display: swap`.

## Editorial trust & SEO

- [ ] **11. Author pages** — `/redaktion/<slug>` pages + transparency page on how the AI newsroom works.
- [ ] **12. NewsArticle JSON-LD** — Verify schema on every article (author, datePublished, dateModified, image, publisher).
- [ ] **13. OG image meta** — Ensure `og:image:width`/`height` tags and 1200×630 minimum.
- [ ] **14. Custom 404 page** — Branded 404 with "Senaste artiklar" recovery list.

## Accessibility

- [ ] **15. Descriptive alt text** — Stop duplicating title as alt. Generate dedicated Swedish alt via LLM or derive from image_prompt.
- [ ] **16. Focus styles** — Verify keyboard nav + comment form have visible focus rings.

## Operational resilience

- [ ] **17. Log file rotation** — Delete `data/logs/server-*.log` older than 14 days on startup.
- [ ] **18. Healthcheck endpoint** — `/healthz` with db/scheduler/pending status.
- [ ] **19. Cycle lock** — Prevent overlapping `runCycle()` runs if one drags on.

## Completed

- [x] **1. Cache-bust hero images** — `?v=<mtime>` appended in public API + server-rendered feed cards + hero + sitemap
- [x] **3. Admin "Needs attention" panel** — new tab shows 7-day window of issues (no image, broadcast failures, faktakoll warnings). Badge on tab label.
- [x] **9. WebP hero pipeline** — Sharp resizes to 1600px max and encodes WebP q82 for both Brave and Kie AI branches; stale PNGs cleaned up.
- [x] Image source caption (Brave vs AI-generated) under hero image
- [x] Retry social broadcast once after 30s on transient (5xx/network) failures
- [x] Server stdout/stderr mirrored to `data/logs/server-YYYY-MM-DD.log`
- [x] Brave classifier rejects malware/CVEs/breaches (no reliable real imagery)
- [x] Admin approve endpoint triggers social broadcast
- [x] FAKTAKOLL brackets stripped (new writes + 178-article migration)
- [x] Newsletter redesign + test-send script
