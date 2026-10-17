# 🌊 LokMitra × TinyFish — The Bioluminescent Command Deck

A live command deck that shows TinyFish web agents as glowing "fish" moving across a map of India's government web portals in real time. Every number on screen comes from the **real TinyFish APIs** (Agent, Search, Fetch, Browser, Monitor, Wallet). Nothing is mocked in production.

- **Stack:** Next.js **15.5.28** (App Router, `backport` LTS line) · React **19.1.10** · TypeScript 5 · no UI framework, no chart library, no icon pack
- **Runtime:** Node.js 22 LTS (`engines: 22.x`, `.nvmrc` = 22) · Vercel serverless functions, region `bom1` (Mumbai)
- **Security:** `TINYFISH_API_KEY` is read only inside server Route Handlers (`import "server-only"`). The browser never sees it.

---

## Features

| Panel | What it shows | Live source |
|---|---|---|
| **Glass Nav** | Swimming figure-8 fish logo, sliding nav-pill indicator, LIVE chip that pulses with real agent count, sound and Calm Mode toggles, auto-hides on scroll | `/api/deck/overview` |
| **Living Network Map** | Line-art map of India. State nodes are sized by query volume. Canvas fish swim between nodes with comet trails. Hover tooltip shows scheme, HIT/MISS, last-updated time and a 24h sparkline. Caustic light background and depth-gauge legend | runs + search/fetch usage |
| **Wallet Telemetry** | Liquid-fill tank with wave motion and odometer digits. Shows the $5 budget line and shifts to coral as spend nears it. Meter list (steps, browser minutes, monitors, Search/Fetch shown as FREE ∞) | `GET /v1/wallet` (live rates) |
| **Cache Intelligence Ring** | Outer arc = free Search + Fetch calls, inner arc = paid Agent runs. A spark orbits the ring when a citizen is served from cache | usage endpoints |
| **Live Agent Reasoning** | Typewriter log with ▶ ✓ ⚠ ✕ glyphs, scanlines and a blinking caret. Click a line for an on-brand JSON view. Mission launcher has **SEARCH · FETCH · MONITOR · AGENT** modes, Hindi presets, run replay, and monitor run-now | SSE + REST |
| **Browser Porthole** | Live agent `streaming_url` inside a round porthole with bezel, rivets and radar sweep. Falls back to the last step screenshot | SSE `STREAMING_URL` |
| **Sector Tiles** | Agriculture, Health, Education, Land, Welfare, Legal. Each has its own single-line SVG icon that animates on hover, plus live counts of people served and states | classified live goals/queries |
| **Impact Ticker** | Marquee of real completed runs, free searches and fetches. Pauses on hover | runs + usage |

**Motion and accessibility:** custom "water" easing, panels rise into place one after another on load, gentle idle bobbing, a 3-fish loading school, and idle-state captions. **Calm Mode** turns off all ambient motion and is also enabled automatically by `prefers-reduced-motion`. `aria-live` regions announce changing values, the map nodes are keyboard-focusable, and ambient sound (Web Audio hum + sonar bloop) is **off by default**.

**Responsive:** under 860px the deck becomes a vertical snap-scroll card stack, and the map is swapped for a lightweight rotating top-3 states card so it runs well on low-end phones.

---

## API surface (all proxied server-side, verified against the official OpenAPI specs)

Specs: `https://agent.tinyfish.ai/v1/openapi/{main,search,fetch,browser}` + Monitor docs.

| Deck route | Method | Upstream |
|---|---|---|
| `/api/health` | GET | — (config check) |
| `/api/deck/overview` | GET | Combines 6 endpoints in parallel: wallet, runs, search/fetch/browser usage, monitors |
| `/api/tinyfish/wallet` | GET | `agent` `GET /v1/wallet` |
| `/api/tinyfish/agent/run-sse` | POST | `agent` `POST /v1/automation/run-sse` (streamed straight through) |
| `/api/tinyfish/agent/run` | POST | `agent` `POST /v1/automation/run` |
| `/api/tinyfish/agent/run-async` | POST | `agent` `POST /v1/automation/run-async` |
| `/api/tinyfish/agent/run-batch` | POST | `agent` `POST /v1/automation/run-batch` |
| `/api/tinyfish/runs` | GET | `agent` `GET /v1/runs` |
| `/api/tinyfish/runs/batch` | POST | `agent` `POST /v1/runs/batch` |
| `/api/tinyfish/runs/batch/cancel` | POST | `agent` `POST /v1/runs/batch/cancel` |
| `/api/tinyfish/runs/:id` | GET | `agent` `GET /v1/runs/{id}` |
| `/api/tinyfish/runs/:id/cancel` | POST | `agent` `POST /v1/runs/{id}/cancel` |
| `/api/tinyfish/runs/:id/steps/:stepId/screenshot` | GET | binary JPEG passthrough |
| `/api/tinyfish/runs/:id/steps/:stepId/html` | GET | served as sandboxed `text/plain` |
| `/api/tinyfish/profiles` | GET | `agent` `GET /v1/profiles` |
| `/api/tinyfish/monitors` | GET, POST | `agent` `/v1/monitors` |
| `/api/tinyfish/monitors/:id` | GET, PATCH, DELETE | `agent` `/v1/monitors/{id}` |
| `/api/tinyfish/monitors/:id/runs` | POST | `agent` run-now |
| `/api/tinyfish/search` | GET | `search` `GET /` (free) |
| `/api/tinyfish/fetch` | POST | `fetch` `POST /` (free) |
| `/api/tinyfish/browser` | POST | `browser` `POST /` |
| `/api/tinyfish/browser/:sessionId` | DELETE | `browser` `DELETE /{id}` |
| `/api/tinyfish/usage/{search\|fetch\|browser}` | GET | `{svc}` `GET /usage` |

Every request body is checked against a whitelist. IDs must match `^[A-Za-z0-9_-]{1,128}$`. Upstream errors come back in one shape: `{ error: { code, message, upstream } }`. `TINYFISH_MAX_DURATION_SECONDS` puts a hard cap on every agent run to protect the wallet.

---

## Run locally

```bash
cp .env.example .env.local     # add TINYFISH_API_KEY (https://agent.tinyfish.ai/api-keys)
npm ci
npm run dev                    # http://localhost:3000
# or production mode
npm run build && npm start
```

### Verify every endpoint against real live data
```bash
npm run verify:api                                   # free and read-only checks (wallet, runs, usage, monitors, profiles, Search, Fetch, overview)
DECK_VERIFY_PAID=1 npm run verify:api                # also runs one small paid Agent SSE run (max 5 steps)
npm run verify:api -- https://your-app.vercel.app    # check a deployed instance
```

---

## Deploy to Vercel (manual)

1. Push this repo to GitHub, then go to **Vercel → Add New Project → Import**. The framework is detected as **Next.js** (also pinned in `vercel.json`).
2. **Settings → Environment Variables:** add `TINYFISH_API_KEY` (required). Optional: `DECK_BUDGET_USD=5`, `TINYFISH_MAX_DURATION_SECONDS=180`.
3. Deploy. `vercel.json` sets `npm ci`, `npm run build`, region `bom1`, and `no-store` headers for `/api/*`.
4. Function time limits are set **in code** with `export const maxDuration` on each long route (SSE/run 300s, fetch 150s, monitor run-now 120s, browser 60s, overview 30s). This avoids the glob-path pitfalls of `vercel.json → functions` with `[id]` folders.
   - On the **Hobby** plan with Fluid Compute on (the default for new projects), up to 300s is allowed. If Fluid is off, Hobby is capped at 60s, so long agent streams will be cut off. The UI handles this: it logs "stream closed before COMPLETE", the run keeps going on the TinyFish side, and the deck catches up through `/v1/runs` polling.
5. After deploying, run `npm run verify:api -- https://<your-app>.vercel.app`.

---

## Project structure
```
app/
  layout.tsx · page.tsx · not-found.tsx · globals.css   (design system)
  api/health · api/deck/overview · api/tinyfish/**       (server-only proxies)
components/  CommandDeck · GlassNav · LivingMap · MobileTop3 · WalletGauge · Odometer
             CacheRing · AgentTerminal · Porthole · SectorTiles · ImpactTicker
hooks/       useDeckData (polling + diff → event bus) · useMission (SSE/search/fetch/monitor)
             useSonar (WebAudio) · useCalm
lib/         tinyfish.ts (client) · api-helpers · agent-body (validation) · bus · classify · geo-data · deck-types
scripts/     verify-endpoints.mjs
```

## Data model
- **No database.** The deck has no state of its own. TinyFish is the only source of truth: runs, usage logs, monitors and wallet.
- `lib/classify.ts` maps goals, queries and URLs to an **Indian state** (map node) and a **citizen sector** (tile) using keyword and portal-domain heuristics.
- Cache "HIT" = free Search/Fetch traffic. "MISS → AGENT" = a paid agent discovery run.

## Not yet implemented / next steps
- Real-time push (TinyFish webhooks → a Vercel KV/Upstash channel) instead of 6–15s polling
- Profile/vault management UI (the read-only profiles proxy already exists)
- Per-state drill-down page with run history and monitor diffs
- i18n of the full UI chrome (presets already include Devanagari)

**Status:** ✅ builds cleanly (`next build`) · ✅ typechecks · ✅ 0 npm audit vulnerabilities · Last updated 2026-10-17
