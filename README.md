# LokMitra × TinyFish — Universal Multilingual Citizen Web Sahayak

LokMitra helps Indian citizens (farmers, e-Shram workers, students, the elderly, MSMEs) and CSC operators use fragmented government portals such as PM-KISAN, PMFBY, Ayushman/PM-JAY, e-Shram, NSP, Bhulekh and mandi prices. It answers in 22 Indian languages over web, Telegram and e-mail, and it runs on all **five TinyFish surfaces**: Search, Fetch, Agent, Browser and Monitor (plus the Wallet).

> **Execution model:** every query runs **fully live**. No caching anywhere, no budget cap. The wallet is shown to operators for transparency only.

- **Stack:** Next.js 15.5 (App Router) · React 19 · TypeScript · Node 22 · Vercel (`bom1`). No Cloudflare / Hono.
- **Security:** every TinyFish/Groq/Resend/Telegram key is server-only (`import "server-only"`).
- **Language layer:** offline UI tables for 7 languages plus Groq (`qwen/qwen3-8b-27b`) for the other 16. **No Bhashini / IndicTrans.** Speech-to-text uses the browser Web Speech API; text-to-speech uses browser SpeechSynthesis.
- **Icons:** professional inline SVG icon set (`components/Icon.tsx`). No emoji in the UI.

## Pipeline (per query, every time)
Intake (web / Telegram / CSC / e-mail) → NLU (Groq, or keyword fallback) → **live Search** (locate the official portal) → **live batched Fetch** (up to 10 URLs) → deterministic extraction + guideline fact-check → **consent gate** → **live Agent** (`run-sse`, `output_schema`) → **OTP relay** (Browser Context Profile + CDP) when the portal is OTP-gated → synthesis (structured Citizen Benefit Report) → localisation → Telegram / e-mail / printable slip with QR.

## TODO checklist (this iteration)
| # | Item | Where | Status |
|---|---|---|---|
| 1 | i18n: offline UI strings (7 langs) + localize API + client helpers (`useT`, `speak`, `relTime`, `localizeTexts`) | `lib/i18n/ui-strings.ts`, `lib/i18n/client.ts`, `app/api/lokmitra/localize` | Done |
| 2 | Role hook + `/api/lokmitra/role`; gates the Settings tab, the nav Wallet pill and the sidebar wallet footer | `hooks/useRole.ts`, `app/api/lokmitra/role`, `components/Sidebar.tsx`, `components/GlassNav.tsx`, `app/settings/Settings.tsx` | Done |
| 3 | WalletTelemetry + LiveExecution moved verbatim to Settings → **Usage & Infrastructure**, plus run log table | `components/UsageInfrastructure.tsx` (deep link `/settings#usage`, follows `hashchange`) | Done |
| 4 | Session summary API (benefit_reports → snapshot, sources, deadlines) | `app/api/lokmitra/session-summary`, `hooks/useSessionSummary.ts` | Done |
| 5 | `useMission` journey events + `useJourney` (ask SSE, consent, agent SSE, OTP relay) | `hooks/useMission.ts`, `hooks/useJourney.ts`, `lib/bus.ts` | Done |
| 6 | SahayakJourney: 7-stage track, status chip, consent modal, TTS, bubbles, OTP/consent, collapse, idle resume | `components/SahayakJourney.tsx` | Done |
| 7 | BenefitSnapshot + VerifiedSource cards | `components/BenefitSnapshot.tsx`, `components/VerifiedSource.tsx` | Done |
| 8 | CommandDeck layout, GlassNav, CSS tokens, responsive (mobile journey header stacks) | `components/CommandDeck.tsx`, `app/globals.css` | Done |
| 9 | Typecheck + build + vercel.json check | `npm run typecheck`, `npm run build`, `vercel.json` | Pass |
| 10 | Live tests against the TinyFish key + UI screenshots | see below, `docs/screenshots/` | Pass |
| 11 | Emoji → professional SVG icons (UI, ticker, terminal, report, e-mail, Telegram) | `components/Icon.tsx` | Done |

## Live verification (2026-10-18, real TinyFish key)
| Surface / flow | Check | Result |
|---|---|---|
| Wallet, runs, batch, usage ×3, monitors, profiles, Search, Fetch, deck aggregator, role, localize, session-summary, ask SSE | `npm run verify:api` | **17/17 pass** |
| Agent `run-sse` (paid) | `DECK_VERIFY_PAID=1 npm run verify:api` | STARTED · STREAMING_URL · PROGRESS · COMPLETE |
| Agent `run-async` + `GET /runs/:id` polling | myscheme.gov.in heading | COMPLETED in 3 steps: `{"heading":"Find schemes based on categories"}` |
| `/api/lokmitra/ask` (SSE) | "Nashik farmer, PM-KISAN status + wheat price" | ~8 s: 2 live Searches, live Fetch of Agmarknet / mandi pages (real Nashik APMC prices), consent gate for PM-KISAN |
| `/api/lokmitra/confirm`: live Agent on pmkisan.gov.in | test reg. no. | 9 steps · $0.144 · live `streaming_url` · detected the real OTP wall → `needs_otp: true` + `retry_confirm_id` |
| OTP relay | `POST /relay` → `/act` (fill) → `/save` → `DELETE` | profile + setup-session created, live page screenshot (reg. no. box, CAPTCHA, "Get OTP"), field filled over CDP, profile saved (2 cookies, `pmkisan.gov.in`), profile deleted |
| Monitor | starter pack (5 sentinels) + run-now | 5 TinyFish monitors created; compliance run processed ("no change") |
| Browser | create + terminate | session `tf-…` with `cdp_url`; terminated |
| UI (Playwright) | full journey: ask → consent modal → report → snapshot/sources → language switch → citizen gate → operator → Usage tab → mobile | zero console errors; see `docs/screenshots/01…11` |

Fixes made during live testing: the OTP-relay field labeller now walks preceding siblings and ancestors, so ASP.NET/NIC forms get proper labels. Single unlabeled identifier boxes are auto-filled. A CAPTCHA input now sets `captcha_present`. The `/settings#usage` deep link now switches tabs on a same-page hash change.

## Pages
| Group | Page | Purpose |
|---|---|---|
| Citizen | `/` | Command Deck: **Sahayak Journey** (hero), **Benefit Snapshot**, **Verified Sources**, Living Network map, Agent reasoning, Browser porthole, Sectors, Impact ticker |
| | `/sahayak` · `/csc` | Full chat (CSC mode with printable slip + QR, "next citizen" reset) |
| | `/portal-map` · `/reports` · `/bot-simulator` | Live portal explorer, benefit reports + Resend, Telegram flows without a token |
| Operate | `/live` · `/sentinel` · `/sessions` | Live Browser sessions, Monitors, OTP relay/profiles |
| Judge | `/judge` · `/impact` · `/runs` | Live SSE wallet counter, live browser embed, two-farmer rehearsal, impact, audit log |
| Operator only | `/settings` (Integrations · **Usage & Infrastructure**) | Wallet Telemetry, Live Execution ring, run log, integrations, endpoint probe |

## Key API routes
- `POST /api/lokmitra/ask` (`?stream=1` for SSE) · `POST /api/lokmitra/confirm` (Agent SSE) · `/crosscheck` · `/discover`
- `POST /api/lokmitra/relay` → `/relay/:id/act` → `/relay/:id/save` → `DELETE /relay/:id` (OTP relay)
- `GET /api/lokmitra/role` / `POST {view}` · `GET|POST /api/lokmitra/localize` · `GET /api/lokmitra/session-summary?user_id=`
- `/api/lokmitra/sentinels` (+ `/starter-pack`, `/:id/run`, `/:id/subscribe`) · `/api/lokmitra/judge/stream`
- `/api/tinyfish/*`: whitelisted proxies (wallet, agent `run`/`run-sse`/`run-async`/`run-batch`, runs, search, fetch, browser, monitors, profiles, usage)
- `/api/telegram/webhook`, `/api/telegram/setup`, `/api/cron/maintenance` (privacy housekeeping only)

## Run locally
```bash
cp .env.example .env.local   # set TINYFISH_API_KEY
npm ci && npm run build && npm start      # http://localhost:3000
npm run verify:api                        # 17 live checks; DECK_VERIFY_PAID=1 adds a paid Agent SSE run
```

## Deploy to Vercel (manual)
1. Import the repo. `vercel.json` pins framework `nextjs`, `npm ci`, `npm run build`, region `bom1`, a daily cron for `/api/cron/maintenance` (GET), and `no-store` on `/api/*`. Node 22 comes from `engines` and `.nvmrc`.
2. Add env vars from `.env.example`. Only `TINYFISH_API_KEY` is required. Recommended: `ADMIN_TOKEN` (turns on operator gating), `CRON_SECRET`, `SESSION_SECRET`, `PUBLIC_BASE_URL`, `GROQ_API_KEY`, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
3. Long routes set `export const maxDuration` (≤ 300 s, the Vercel Fluid Compute limit).

## Optional integrations
Telegram, Groq, Resend and Supabase are optional. Without Groq, the app uses keyword intent detection and the offline glossary/UI tables (7 languages; the other 16 fall back by script). Without Supabase it uses an in-memory store, which resets per instance. `/settings` shows the status of each.

## Data model (Supabase, optional)
`users`, `benefit_reports`, `runs_log`, `monitor_subscriptions`/`sentinels`, `monitor_events`, `user_sessions`, `ephemeral_profiles`. No cache tables (`0004_remove_caching.sql`).

**Status:** typecheck pass · `next build` pass · live-tested against TinyFish · Last updated 2026-10-18
