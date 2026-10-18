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
DECK_VERIFY_PAID=1 npm run verify:api                # also runs one small paid Agent SSE run (60s wall-clock cap; max_steps is a TinyFish beta-gated field)
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


---

## Phase 0-3 completion notes (2026-10-18)

**Live-verified against the real TinyFish API (wallet-balance diff, total spend < $1 of the $3 cap):**

| Surface | Check | Result |
|---|---|---|
| Search (free) | `GET /api/tinyfish/search`, portal discovery in `resolvePortal` | live results (pmkisan.gov.in first) |
| Fetch (free) | batched <=10 URLs, nightly `/api/cron/prefetch` | 20/26 official pages OK; 403 / unreachable pages reported per-URL, not fatal |
| Agent | one-time `discover` (7 steps, $0.112), citizen-confirmed status run (10 steps, $0.16), parallel cross-check PM-KISAN + Ayushman (19 + 13 steps) | structured `output_schema` JSON, live `STREAMING_URL`; PM-KISAN correctly stops at `blocked_by: otp` |
| Discover-Once | 2nd `discover` for the same state x scheme | **$0.00**, served from `portal_map` |
| Browser | session create + delete, OTP relay profile create / save / delete | OK |
| Monitor | create sentinel ($0.005 baseline), subscribe, run-now | OK, change-diff + fan-out path exercised |

**Fixes made in this pass**
- NLU keyword false positives (`ration` in *registration*, `rate` in *separate*, `beta` in *alphabet* ...): all Latin-script terms now use `\b` word boundaries, with plural forms preserved (`scholarships?`, `students?` ...). Devanagari terms are untouched.
- Task detection is now scoped per clause, so "PM-KISAN status ..., Ayushman mein naya kya" no longer turns every scheme into a deadline lookup.
- **Mandi prices now return real data.** Agmarknet answers 403 to Fetch and the eNAM dashboard is JS-only, so prices were always empty. `priceLinks()` adds bot-friendly pages built on AgMarkNet data (acrop.app district overview + agriplus.in state table) and a deterministic parser (`parsePriceTables`) fills `typical_price` + per-mandi min/max/modal without an LLM.
- Excerpts no longer leak `## SOURCE` markers or portal boilerplate; raw-IP mirror hosts (e.g. `34.93.80.85`) are never ranked or shown to citizens.
- `agent_config.mode:"strict"` and `max_steps` are **beta-gated** on TinyFish accounts (403 "join /beta"). They are now opt-in (`TINYFISH_AGENT_MODE=strict`, `TINYFISH_SEND_MAX_STEPS=1`); spend is bounded by `max_duration_seconds` + the wallet guard + `DECK_BUDGET_USD` instead.
- `vercel.json` now declares the nightly cron (`/api/cron/prefetch`, `0 21 * * *` UTC = 02:30 IST).

**Honest limitations**
- Personal PM-KISAN status needs a real OTP on the citizen's phone; the agent stops at the OTP gate by design (`needs_otp`). Telegram, Resend, Groq and Supabase are optional integrations: without keys the deck degrades gracefully (heuristic NLU, in-memory store, documented in `/settings`). Add keys to enable them. `TINYFISH_API_KEY` is the only required variable.
- With no Supabase configured, `portal_map` lives in server memory, so the "discover once" cache resets on cold start. Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and run `supabase/migrations/*.sql` for permanence on Vercel.
- Vercel Cron is called with `Authorization: Bearer $CRON_SECRET`, so set `CRON_SECRET` in Vercel.
