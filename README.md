<div align="center">

# ✦ LOKMITRA ✦

### *The People's Bridge to Every Government Benefit*
**Universal Multilingual Citizen Web Sahayak · powered by TinyFish**

<br/>

[![Next.js](https://img.shields.io/badge/Next.js_15.5-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Motion](https://img.shields.io/badge/Motion_13-0055FF?style=for-the-badge&logo=framer&logoColor=white)](https://motion.dev)
[![TinyFish](https://img.shields.io/badge/TinyFish_5_surfaces-2EF2C3?style=for-the-badge&logoColor=black)](https://docs.tinyfish.ai)
[![Groq](https://img.shields.io/badge/Groq-F55036?style=for-the-badge&logoColor=white)](https://groq.com)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Telegram](https://img.shields.io/badge/Telegram_Bot-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)

<br/>

**📦 Repository** · [`github.com/pmrinal2005/LokMitra`](https://github.com/pmrinal2005/LokMitra)
**🚀 Hosting** · Vercel (one Next.js project: UI + API routes + SSE + Telegram webhook + cron)

---

*A voice first, 22 language citizen assistant that opens India's fragmented government portals for you (PM KISAN, PMFBY, Ayushman Bharat, eShram, NSP, Bhulekh, mandi prices), shows you the agent working live inside the real site, and hands back one plain language Citizen Benefit Report with proof links, deadlines and a printable QR slip.*

</div>

---

## 📖 Table of Contents

1. [The Name: LokMitra](#-1-the-name-lokmitra)
2. [Project Overview](#-2-project-overview)
3. [Why LokMitra Stands Apart](#-3-why-lokmitra-stands-apart)
4. [The Visitor Journey: Landing Page to Dashboard](#-4-the-visitor-journey-landing-page-to-dashboard)
5. [Architecture: Five TinyFish Surfaces, One Conversation](#-5-architecture-five-tinyfish-surfaces-one-conversation)
6. [Tech Stack](#-6-tech-stack)
7. [Feature Catalogue](#-7-feature-catalogue)
8. [Project Structure](#-8-project-structure)
9. [API Surface](#-9-api-surface)
10. [Live Verification Against the Real TinyFish Key](#-10-live-verification-against-the-real-tinyfish-key)
11. [Data Model](#-11-data-model)
12. [User Guide](#-12-user-guide)
13. [Local Development](#-13-local-development)
14. [Deployment (Vercel)](#-14-deployment-vercel)
15. [Constraints Compliance Matrix](#-15-constraints-compliance-matrix)
16. [Roadmap](#-16-roadmap)
17. [Image Credits & License](#-17-image-credits--license)

---

## ✦ 1. The Name: LokMitra

> **लोकमित्र** · *Lok·Mitra*

| Root | Meaning | Why it matters here |
|---|---|---|
| **लोक** *(Lok)* | "The people", the public, the citizen at large. | Built for the farmer, the eShram worker, the grandmother on a pension and the first generation student, not for the portal operator. |
| **मित्र** *(Mitra)* | "Friend", the one who walks beside you. | A Sahayak that speaks your language, never asks for money, and always shows you how to do it yourself next time. |

**LokMitra** means *"the people's friend"*: a companion that stands between a citizen and a maze of login walls, cascading dropdowns, OTP screens and English only PDF circulars, and turns all of it into one friendly conversation.

---

## ✦ 2. Project Overview

Over a billion Indians lose entitled benefits every year because welfare delivery is spread across hundreds of incompatible portals. The same scheme has a different URL, DOM and State, District, Tehsil, Village cascade in every state. Status pages are OTP and CAPTCHA gated, eligibility lives inside PDF circulars, and nearly all of it is English or Hindi only. Citizens end up paying a middleman or losing a day at a Common Service Centre (CSC) to check a single status.

**LokMitra** collapses that into a two minute conversation:

> A citizen sends a voice note or a message in their own language: *"Main Nashik ka kisan hoon. PM KISAN status, aaj pyaz ka bhaav, aur Ayushman mein naya kya hai?"* LokMitra understands every sub request, locates the official portals live with **TinyFish Search**, reads them with **TinyFish Fetch** (up to 10 URLs per call), asks for consent before anything personal, runs a **TinyFish Agent** on the real gated site while the citizen watches the live browser stream, relays the OTP through a **Browser Context Profile**, keeps watch on deadlines with **TinyFish Monitor**, and answers back in the citizen's language with sources, next steps and a QR slip.

Channels: **Web PWA** (landing page plus full dashboard), **Telegram bot** (with an in-app simulator), **CSC desk mode** (printable slip plus QR), and **Resend e-mail** reports.

---

## ✦ 3. Why LokMitra Stands Apart

1. **All five TinyFish surfaces, each used for what the docs recommend.** Search to locate, Fetch to read, Agent to act on gated sites, Browser for live sessions and OTP relay, Monitor for passive deadline watching.
2. **Radical transparency.** The citizen (or a judge) watches the agent click through pmkisan.gov.in live via the `streaming_url` porthole. Every answer carries verified source links.
3. **Consent first, never irreversible.** Personal identifiers are requested only after an explicit consent modal that shows the estimated steps and cost. The agent is instructed never to submit irreversible actions.
4. **Truly multilingual.** 22+ Indian languages. Offline UI tables for 7 languages, Groq (`qwen/qwen3.8-27b`, the real Groq id of `qwen3-8b-27b`) for the rest. Browser Web Speech API for voice input, SpeechSynthesis for read-aloud. **No Bhashini or IndicTrans anywhere.**
5. **Cross sector in one session.** Agriculture, health, education, labour/eShram, welfare/PDS, land revenue, MSME and compliance deadlines in a single report, plus *"you may also qualify for"* discovery.
6. **Do it yourself steps on every answer.** No lock in. Every section explains how to check it yourself next time.
7. **Cinematic first impression.** A scroll scrubbed video hero, scramble type, coverflow proof cards and a motion iris reveal of the communities LokMitra serves, before handing off into the command deck.

---

## ✦ 4. The Visitor Journey: Landing Page to Dashboard

Entering the site always shows the **landing page first** (`/`). Every call to action (*Open My Sahayak*, *Start*, *Start My Check*) fades through a veil (*"Opening your Sahayak"*) into the **full dashboard** at `/dashboard`. The dashboard sidebar logo links back to `/`.

| Section | What the visitor sees |
|---|---|
| **Hero** | Scroll scrubbed background video, scramble in title *Every Scheme · One Voice*, a short promise of what LokMitra does. |
| **Cinematic paragraph** | 3D parallax story: no queues, no middlemen, one friendly conversation. |
| **Proof carousel** | Six coverflow cards: 22 languages, 2 minute answers, 8 life needs, proof on every reply, Rs 0 middleman fees, 24x7 deadline watch. |
| **Reveal (last section)** | Motion iris opens onto an orbit of **six new community photos** (farmer, rural women, students, SMS alerts, a digital classroom, a mandi stall) with *"Every rupee you are owed, found, checked and explained"* and the *Start My Check* CTA. |

**Copy rules applied to the landing page:** no dashes and no semicolons anywhere in the visible text, titles, alt or aria labels (verified automatically in a headless browser at desktop and mobile widths: **0 violations**). The copy focuses on product uniqueness and benefits, not on technical depth.

> The landing component hierarchy, layout, motion system and styling were ported from the Vaidyam frontend (`github.com/pmrinal2005/Vaidyam`). Only the frontend was taken. All copy was rewritten for LokMitra, and only the six orbit images in the last section were replaced.

---

## ✦ 5. Architecture: Five TinyFish Surfaces, One Conversation

```
 Citizen (voice / text, any of 22 languages)
   │   Web PWA  ·  Telegram  ·  CSC desk  ·  e-mail
   ▼
 Intake ─► NLU (Groq gpt-oss-120b / 20b / qwen3.8-27b, keyword fallback)
   │          splits a message into tasks: {scheme, state, district, commodity, task}
   ▼
 ┌─────────────── per task, fully live ────────────────────────────────────────┐
 │ 1. TinyFish SEARCH  (free)   locate the current official portal               │
 │ 2. TinyFish FETCH   (free)   batch read up to 10 URLs → clean markdown/JSON   │
 │ 3. Deterministic extraction + guideline vs portal fact check                 │
 │ 4. CONSENT GATE              show est. steps & cost, ask for identifiers      │
 │ 5. TinyFish AGENT   (paid)   run-sse with output_schema on the gated site     │
 │       └─ streaming_url  ─► live Browser Porthole in the UI                    │
 │ 6. OTP RELAY                 Browser Context Profile + CDP fill + save        │
 │ 7. TinyFish MONITOR          deadline & circular sentinels, fan out alerts    │
 └──────────────────────────────────────────────────────────────────────────────┘
   ▼
 Synthesis ─► Citizen Benefit Report (sections, sources, deadlines, DIY steps)
   ▼
 Localisation (offline tables + Groq) ─► Telegram · e-mail (Resend) · QR slip · TTS
```

| Surface | Used for | Endpoint(s) |
|---|---|---|
| **Search** | Find the correct current portal, scheme cards, PDFs | `GET /api/tinyfish/search` |
| **Fetch** | Mandi prices, eligibility pages, guidelines, batched ≤10 URLs | `POST /api/tinyfish/fetch` |
| **Agent** | PM KISAN status, Bhulekh cascades, gated checks, structured output | `/api/tinyfish/agent/run`, `run-sse`, `run-async`, `run-batch`, `/api/tinyfish/runs/*` |
| **Browser** | Live sessions, Browser Context Profiles, OTP relay over CDP | `/api/tinyfish/browser`, `/api/tinyfish/profiles/*`, `/api/lokmitra/relay/*` |
| **Monitor** | Deadline and circular sentinels, compliance checks | `/api/tinyfish/monitors/*`, `/api/lokmitra/sentinels/*` |
| **Wallet** | Live balance and spend telemetry (operator view) | `GET /api/tinyfish/wallet`, `/api/tinyfish/usage/:kind` |

Every TinyFish, Groq, Resend and Telegram key is **server only** (`import "server-only"`). The browser never sees a token.

---

## ✦ 6. Tech Stack

<div align="center">

| Layer | Technology | Why |
|---|---|---|
| **Framework** | Next.js 15.5 App Router, React 19, route groups `(landing)` and `(deck)` | One project hosts landing, dashboard, API routes, SSE and webhooks |
| **Language** | TypeScript 5 (strict), Zod | Typed TinyFish contracts and request validation |
| **Landing motion** | `motion` 13 (Framer Motion), Swiper 11 coverflow, Lenis smooth scroll | Iris reveal, orbit gallery, scroll scrubbed video |
| **Dashboard styling** | Hand written design system (`app/(deck)/globals.css`), inline SVG icon set | Bioluminescent command deck, no emoji, calm mode |
| **Web automation** | **TinyFish** Search · Fetch · Agent · Browser · Monitor | The only line item drawing on the Wallet |
| **LLM / NLU / translation** | Groq via `groq-sdk` (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`) | Multi intent parsing, synthesis, Indic localisation |
| **Speech** | Browser Web Speech API (STT) + SpeechSynthesis (TTS) | Zero cost, works on low end phones |
| **Persistence** | Supabase REST (optional) with in memory fallback | Reports, audit log, sentinels, sessions |
| **Messaging** | Telegram Bot API webhook, Resend e-mail | Grassroots reach plus records for CSC operators |
| **Hosting** | Vercel (`bom1`), Node 22 | **No Cloudflare, no Hono, no Render** |

</div>

---

## ✦ 7. Feature Catalogue

### This iteration (TODO list)

<div align="center">

| # | TODO | Status | Where |
|:-:|---|:-:|---|
| 1 | Clone the Vaidyam repo and extract **only the frontend** components | ✅ | `components/reveal/*`, `app/(landing)/*`, `public/static/landing.*`, `public/static/reveal/reveal.css` |
| 1a | Integrate component hierarchy, layout, routing and styling | ✅ | Route groups: `app/(landing)` (own root layout) and `app/(deck)` (dashboard shell) |
| 1b | Dependencies, icons, styling frameworks configured | ✅ | `motion@13.1.0` added, Bootstrap Icons + Swiper via CDN, precompiled Tailwind v4 reveal CSS |
| 2 | Replace every placeholder text, title, heading, CTA, microcopy | ✅ | Hero, cinematic copy, 6 carousel cards, reveal text, nav, footer, aria labels, meta, transition veil |
| 2a | Engaging, high converting tone aligned to LokMitra | ✅ | Citizen benefit focused, no technical jargon |
| 2b | No dashes and no semicolons in landing text | ✅ | Automated headless check: 0 violations (desktop and mobile) |
| 3 | Landing page shown first, then the full dashboard | ✅ | `/` landing → CTA → `/dashboard` (Mission Deck) |
| 4 | Replace **only** the 6 images in the last section | ✅ | `public/images/orbit-1..6.jpg` (Creative Commons, see §17) |
| 5 | README in the style of the provided format | ✅ | This file |
| 6 | Vercel config verified | ✅ | `vercel.json` valid JSON, `npm ci && npm run build` passes |
| 7 | Live tests against the provided TinyFish key | ✅ | See §10 |

</div>

### Carried over from previous iterations (unchanged, still passing)

| Area | Highlights |
|---|---|
| **Sahayak Journey** | 7 stage track, 3D cursor tracking mascot, consent modal, TTS, scrollable suggestion chips, icon only mic, collapse fix |
| **Benefit Snapshot & Verified Sources** | Per session summary of schemes checked, likely eligible, deadlines, live source cards |
| **Command Deck** | Living Network map, Agent Terminal reasoning log, Browser Porthole (live `streaming_url`), Sector tiles, Impact ticker |
| **CSC Desk** | Printable slip with QR codes to the official portals, "next citizen" reset |
| **Sentinel** | Starter pack of TinyFish monitors, run now, subscriptions, compliance fact check |
| **Judge Console** | Live SSE wallet counter, cost per run, rehearsal mode |
| **Settings** | Integrations status, endpoint probe, operator only **Usage & Infrastructure** tab |
| **i18n & roles** | 22 languages, citizen vs operator gating, Groq audit fixes |

---

## ✦ 8. Project Structure

```
webapp/
├── app/
│   ├── (landing)/                 # NEW: cinematic landing, its own root layout
│   │   ├── layout.tsx             #   fonts, Swiper, landing.css, reveal.css, landing.js
│   │   └── page.tsx               #   hero · cinematic · stats carousel · reveal · footer
│   ├── (deck)/                    # dashboard shell (Sidebar AppShell + globals.css)
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── not-found.tsx
│   │   ├── dashboard/page.tsx     #   Mission Deck (moved from "/")
│   │   ├── sahayak/ csc/ portal-map/ reports/ report/[id]/ bot-simulator/
│   │   ├── live/ sentinel/ sessions/ judge/ impact/ runs/ settings/
│   └── api/                       # 60+ server routes (tinyfish/*, lokmitra/*, telegram/*, webhooks/*, cron/*)
├── components/
│   ├── reveal/                    # NEW: RevealStage.tsx, OrbitImages.tsx (+ css)
│   └── CommandDeck, SahayakJourney, Sidebar, Porthole, LivingMap, ...
├── hooks/  lib/  lib/lokmitra/  lib/i18n/
├── public/
│   ├── images/orbit-1..6.jpg      # NEW: the six replaced last section images
│   └── static/landing.css · landing.js · reveal/reveal.css
├── scripts/verify-endpoints.mjs   # 18 live checks (DECK_VERIFY_PAID=1 adds a paid Agent run)
├── supabase/migrations/           # optional persistence schema
├── docs/screenshots/              # 01..24 UI captures (16..24 are this iteration)
├── vercel.json · next.config.mjs · package.json · .nvmrc (22) · .env.example
```

---

## ✦ 9. API Surface

- `POST /api/lokmitra/ask` (`?stream=1` for SSE): full pipeline, returns the Citizen Benefit Report
- `POST /api/lokmitra/confirm` `{ confirm_id, identifiers }`: consented live Agent run (SSE)
- `POST /api/lokmitra/relay` → `/relay/:id/act` → `/relay/:id/save` → `DELETE /relay/:id`: OTP relay
- `/api/lokmitra/sentinels` (+ `/starter-pack`, `/:id/run`, `/:id/subscribe`) · `/api/lokmitra/judge/stream`
- `/api/lokmitra/{role, localize, session-summary, schemes, portals, reports, stats, simulator, crosscheck, discover}`
- `/api/tinyfish/*`: whitelisted proxies for wallet, agent (`run`, `run-sse`, `run-async`, `run-batch`), runs, search, fetch, browser, monitors, profiles, usage
- `/api/telegram/webhook`, `/api/telegram/setup`, `/api/cron/maintenance`, `/api/health`

---

## ✦ 10. Live Verification Against the Real TinyFish Key

Run on 2026-10-18 against the provided key, production build (`next start`).

<div align="center">

| Surface / flow | Check | Result |
|---|---|---|
| Health, Wallet, Runs, Batch, Usage ×3, Monitors, Profiles | `npm run verify:api` | ✅ wallet **$39.50 USD**, 24 runs, 27 monitors |
| **Search** (free) | "PM Kisan official site" | ✅ 7 results, top `https://pmkisan.gov.in/` |
| **Fetch** (free) | single + batch of 3 gov URLs | ✅ PM Kisan + myScheme pages extracted; one unreachable host reported per URL without failing the batch |
| **Agent** `run-sse` (paid) | verifier | ✅ STARTED · STREAMING_URL · PROGRESS · COMPLETE |
| **Agent** `run-async` + poll | myscheme.gov.in heading | ✅ COMPLETED → `{"heading":"National Scholarship Portal"}` |
| **Agent** `run-batch` | india.gov.in title | ✅ `run_ids` returned, run polled to RUNNING/COMPLETED |
| **Browser** | create + terminate | ✅ `tf-…` session with `cdp_url`, `terminated: true` |
| **Monitor** | page + topic create, get, run now (POST), delete | ✅ created, live run returned myScheme snapshot, deleted |
| `/api/lokmitra/ask` SSE | Nashik farmer query | ✅ intent → search → fetch → report in ~6 s |
| `/api/lokmitra/ask` → `/confirm` | PM KISAN status, consent then live Agent | ✅ 8 steps · **$0.128** · live `streaming_url` · detected the real OTP wall → `needs_otp: true` + DIY steps |
| OTP relay | `POST /relay` → `DELETE` | ✅ profile + setup session on pmkisan.gov.in "Know Your Status" page, cancelled & profile deleted |
| Telegram simulator | Hindi onion price query | ✅ real APMC Nasik prices (₹3200/quintal, min ₹1500, max ₹4050) answered in Hindi |
| UI (Playwright) | landing → CTA → dashboard, reveal CTA, 14 dashboard pages, live journey, logo → landing | ✅ **zero console errors** |
| Landing copy | dash/semicolon scan (desktop + mobile) | ✅ **0 violations** |

</div>

Fix during this iteration: the mobile header CTA was clipped at 390 px, so it now reads *Start* on mobile (desktop keeps *Open My Sahayak*).

---

## ✦ 11. Data Model

Supabase (optional, `supabase/migrations/0001..0004`): `users`, `benefit_reports`, `runs_log`, `sentinels` / `monitor_subscriptions`, `monitor_events`, `user_sessions`, `ephemeral_profiles`. Without Supabase the app falls back to an in memory store (resets per instance). Every query runs live. There are no cache tables (`0004_remove_caching.sql`).

---

## ✦ 12. User Guide

1. Open the site. The **landing page** greets you. Scroll to explore, or press **Open My Sahayak**.
2. In the **Mission Deck**, type or speak (mic button) your question in any language, or tap a suggestion chip.
3. Watch the journey track: *Question → Understanding → Portal search → Page reading → Your consent → Live agent → Report*.
4. For personal checks (for example PM KISAN status) LokMitra asks for consent and your registration number, then you can **watch the agent live** in the Browser Porthole. If an OTP is needed, enter it when asked.
5. Read the report: results per sector, verified sources, deadlines, *"you may also qualify for"*, and DIY steps. Use **Listen**, switch language, print a **Slip + QR**, or e-mail it.
6. Operators: switch to operator view in the sidebar to see Wallet telemetry, Usage & Infrastructure, Sentinels and the Judge Console.

---

## ✦ 13. Local Development

```bash
git clone https://github.com/pmrinal2005/LokMitra && cd LokMitra
cp .env.example .env.local          # set TINYFISH_API_KEY (required)
npm ci
npm run typecheck
npm run build && npm start          # http://localhost:3000  (landing) → /dashboard
npm run verify:api                  # 18 live checks; DECK_VERIFY_PAID=1 adds a paid Agent SSE run
# optional sandbox process manager
pm2 start ecosystem.config.cjs
```

---

## ✦ 14. Deployment (Vercel)

- **Framework preset**: Next.js (pinned in `vercel.json`)
- **Install**: `npm ci` · **Build**: `npm run build` · **Output directory**: leave empty (Vercel consumes `.next`)
- **Region**: `bom1` (Mumbai) · **Node**: 22 (`engines` + `.nvmrc`)
- **Cron**: daily `GET /api/cron/maintenance` (privacy housekeeping)
- **Headers**: `no-store` on `/api/*`, security headers from `next.config.mjs`
- **Env vars**: `TINYFISH_API_KEY` (required). Recommended: `ADMIN_TOKEN`, `CRON_SECRET`, `SESSION_SECRET`, `PUBLIC_BASE_URL`, `GROQ_API_KEY`, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `RESEND_API_KEY`
- Long routes declare `export const maxDuration` (≤ 300 s, Fluid Compute limit)

---

## ✦ 15. Constraints Compliance Matrix

<div align="center">

| Constraint | Status | Evidence |
|---|:-:|---|
| Built on the cloned LokMitra repo, continuing previous work | ✅ | All prior pages, APIs and hooks retained. Mission Deck moved to `/dashboard` |
| Only the Vaidyam **frontend** used | ✅ | No Vaidyam API, DB, engine or Drizzle code imported |
| Landing first, then dashboard | ✅ | `/` → `/dashboard` via every CTA |
| Only the 6 last section images replaced | ✅ | `public/images/orbit-1..6.jpg`. The hero video and everything else were kept |
| No dashes or semicolons in landing text | ✅ | Automated scan, 0 violations |
| No Cloudflare / Hono | ✅ | No wrangler, no Hono dependency. Vercel only |
| No Bhashini / IndicTrans | ✅ | Groq + offline tables only |
| STT via Web Speech API, translation via Groq qwen | ✅ | `components/SahayakJourney.tsx`, `lib/lokmitra/groq.ts` |
| All TinyFish endpoints live with the real key | ✅ | §10 |
| Valid `vercel.json`, build passes | ✅ | `next build` succeeds, 70+ routes |

</div>

---

## ✦ 16. Roadmap

- WhatsApp channel alongside Telegram
- Offline first PWA cache of the last report for low connectivity villages
- State by state Bhulekh cascade library with saved agent goals
- CSC operator analytics: friction heatmaps per portal for policy feedback
- Voice reply notes on Telegram using browser recorded TTS

---

## ✦ 17. Image Credits & License

The six orbit images in the landing page's last section are Creative Commons / public domain photographs (via Flickr: CIMMYT, CGIAR CCAFS, UN Women Asia Pacific, and Rawpixel and the American India Foundation). They were cropped to squares for the orbit gallery. The landing motion system is adapted from the Vaidyam frontend by the same author.

Released under the **MIT License**.

---

<div align="center">

**LokMitra** · *the people's friend*
Every scheme. One voice. Proof on every answer.

</div>
