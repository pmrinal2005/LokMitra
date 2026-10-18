# 🌊 LokMitra × TinyFish — Universal Multilingual Citizen Web Sahayak

LokMitra helps Indian citizens (farmers, eShram workers, students, the elderly, MSMEs) and CSC operators use fragmented government portals such as PM-KISAN, PMFBY, Ayushman/PM-JAY, e-Shram, NSP, Bhulekh and mandi prices. It answers in 22 Indian languages, over web, Telegram and e-mail.

It runs on all **five TinyFish surfaces**: Search, Fetch, Agent, Browser and Monitor, plus the Wallet.

> **Execution model:** every query runs **fully live**. There is **no caching** anywhere (no `portal_map`, no content cache, no stored answers) and **no budget cap**. Asking the same question twice runs two complete, independent pipelines. The wallet counter is shown for transparency only.

- **Stack:** Next.js 15.5 (App Router) · React 19 · TypeScript · Node 22 · Vercel (`bom1`)
- **Security:** every TinyFish/Groq/Resend/Telegram key is server-only (`import "server-only"`).

## Pipeline (per query, every time)
Intake (web / Telegram / CSC / e-mail)
→ NLU (Groq, or keyword fallback)
→ **live Search** (locate the official portal)
→ **live batched Fetch** (up to 10 URLs)
→ deterministic extraction + guideline fact-check
→ consent gate → **live Agent** (`run-sse`, `output_schema`) for gated portals
→ **synthesis** (structured Citizen Benefit Report)
→ **localisation** (Groq `qwen/qwen3-8b-27b`, plus an offline glossary for priority languages)
→ Telegram / e-mail / printable slip with QR.

## Pages (collapsible sidebar)
| Group | Page | Purpose |
|---|---|---|
| Citizen | `/sahayak` | Voice/text chat. Renders the structured, sector-grouped report (agri, health, edu, land, labour, MSME, welfare) with contradictions, sentinel facts, also-eligible schemes and next steps |
| | `/csc` | Shared-tablet CSC desk: printable slip, QR, HMAC token, "next citizen" reset |
| | `/portal-map` | Live Portal Explorer: fresh Search / Fetch / Agent mapping on every press |
| | `/reports` | Benefit reports, e-mail preview, send via Resend |
| | `/bot-simulator` | Full Telegram flows without a bot token |
| Operate | `/` | Mission Deck (map, wallet, live ring, agent terminal, porthole) |
| | `/live` | Live Browser sessions · `/sentinel` Monitors · `/sessions` OTP relay/profiles |
| Judge | `/judge` | Live SSE wallet counter, per-surface live-call ring, live browser embed, two-farmer "no cache" rehearsal |
| | `/impact` · `/runs` · `/settings` | Impact metrics, audit log, integration status |
| | `/report/:id?t=TOKEN` | Printable slip with "token verified ✓" banner |

## Key API routes
- `POST /api/lokmitra/ask`: full live pipeline. Returns JSON, or streams SSE with `?stream=1`.
- `POST /api/lokmitra/confirm`, `/crosscheck`, `/discover`: live Agent runs (SSE).
- `GET|POST /api/lokmitra/report/:id/email`: `?preview=1` HTML, `?format=json`, POST sends via Resend (returns 503 `NOT_CONFIGURED` without a key).
- `/api/lokmitra/sentinels` (+ `/starter-pack`, `/:id/run`, `/:id/subscribe`): TinyFish Monitors, deterministic compliance fact-check.
- `/api/lokmitra/judge/stream`: SSE ticks for the Judge console.
- `/api/lokmitra/simulator`, `/api/telegram/webhook`, `/api/telegram/setup`.
- `/api/tinyfish/*`: whitelisted proxies for wallet, agent (`run` / `run-sse` / `run-async` / `run-batch`), runs, search, fetch, browser, monitors, profiles and usage.
- `/api/cron/maintenance`: nightly privacy housekeeping only. It does no pre-fetching.

## Live verification (2026-10-18, real TinyFish key)
| Surface | Check | Result |
|---|---|---|
| Wallet / runs / usage / monitors / profiles | `npm run verify:api` | 13/13 ✓ |
| Search + Fetch | `/ask` run twice with the same question | 2 independent runs, each with 3 Search calls and 8/9 pages fetched live |
| Agent | live e-Shram `discover` over SSE | 21 steps, $0.336, `STREAMING_URL`, structured output |
| Monitor | starter pack (5 watchers) + run-now | baselines captured, compliance fact-check ✓, sentinel facts appear in the report |
| Browser | session create + terminate | ✓ |
| Email / slip / Telegram simulator / Judge SSE | — | ✓ (Resend returns 503 NOT_CONFIGURED without a key) |

## Run locally
```bash
cp .env.example .env.local   # set TINYFISH_API_KEY
npm ci && npm run build && npm start      # http://localhost:3000
npm run verify:api                        # free checks; DECK_VERIFY_PAID=1 adds a paid Agent run
```

## Deploy to Vercel (manual)
1. Import the repo. The framework is detected as Next.js and pinned in `vercel.json` (`npm ci`, `npm run build`, region `bom1`, cron `/api/cron/maintenance`, `no-store` on `/api/*`).
2. Add the env vars from `.env.example`. Only `TINYFISH_API_KEY` is required. Also set `CRON_SECRET`, `ADMIN_TOKEN` and `PUBLIC_BASE_URL`.
3. Long routes set `export const maxDuration` in code (up to 300s; needs Fluid Compute on the Hobby plan).

## Optional integrations
Telegram, Groq, Resend and Supabase are optional. Without them the app falls back to keyword intent detection and the offline glossary, keeps data in an in-memory store, and reports "not configured". See `/settings`.

## Data model (Supabase, optional)
`users`, `benefit_reports`, `runs_log`, `monitor_subscriptions`/sentinels, `user_sessions`, relay tables. **No cache tables:** migration `0004_remove_caching.sql` drops `portal_map` and `content_cache`.

**Status:** ✅ typecheck · ✅ `next build` · ✅ live-tested · Last updated 2026-10-18
