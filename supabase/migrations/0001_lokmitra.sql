-- LokMitra · Supabase schema (Phase 0)
-- Run once in Supabase → SQL Editor (or `supabase db push`).
-- All access happens server-side with the service-role key, so RLS is enabled
-- with NO public policies (anon/auth keys cannot read anything).

create extension if not exists pgcrypto;

-- ── citizens (Telegram / web / email channel identities) ─────────────────
create table if not exists public.users (
  id            text primary key,                 -- e.g. "tg:123456", "web:<uuid>"
  channel       text not null check (channel in ('telegram','web','email','csc')),
  display_name  text,
  language      text not null default 'hi',       -- ISO 639-1 / BCP-47 short code
  state_code    text,                             -- e.g. "MH"
  district      text,
  email         text,
  consent_at    timestamptz,                      -- explicit consent for personal-data entry
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Monitor sentinel subscriptions (fan-out to citizens) ─────────────────
create table if not exists public.monitor_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  monitor_id   text not null,                     -- TinyFish monitor id
  scheme_id    text,
  state_code   text,
  user_id      text references public.users(id) on delete cascade,
  kind         text not null default 'deadline',  -- deadline | circular | compliance
  created_at   timestamptz not null default now(),
  unique (monitor_id, user_id)
);

-- ── generated Citizen Benefit Reports ────────────────────────────────────
create table if not exists public.benefit_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       text,
  language      text not null default 'en',
  query         text not null,
  intent        jsonb not null,
  sections      jsonb not null,                   -- per-scheme structured results
  summary_en    text,
  summary_local text,
  sources       jsonb not null default '[]',
  cost_usd      numeric(10,4) not null default 0,
  live_calls    jsonb not null default '{}',      -- {search, fetch_urls, fetch_ok} made live for this report
  elapsed_ms    integer,
  created_at    timestamptz not null default now()
);
create index if not exists benefit_reports_created_idx on public.benefit_reports (created_at desc);

-- ── anonymised audit log of every TinyFish call LokMitra made ────────────
create table if not exists public.runs_log (
  id            uuid primary key default gen_random_uuid(),
  surface       text not null check (surface in ('search','fetch','agent','browser','monitor','llm')),
  purpose       text not null,                    -- discovery | status | info | prefetch | sentinel ...
  state_code    text,
  scheme_id     text,
  run_id        text,                             -- TinyFish run/monitor/session id
  status        text not null default 'ok',
  steps         integer,
  cost_usd      numeric(10,4) not null default 0,
  latency_ms    integer,
  meta          jsonb not null default '{}',      -- never contains raw Aadhaar/OTP
  created_at    timestamptz not null default now()
);
create index if not exists runs_log_created_idx on public.runs_log (created_at desc);
create index if not exists runs_log_run_idx on public.runs_log (run_id);

-- ── ephemeral sessions: confirmation gates, OTP relay, profile sessions ──
create table if not exists public.user_sessions (
  id          text primary key,
  user_id     text,
  kind        text not null,                      -- confirm | otp | profile_setup | chat
  data        jsonb not null default '{}',
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists user_sessions_expiry_idx on public.user_sessions (expires_at);

alter table public.users                 enable row level security;
alter table public.monitor_subscriptions enable row level security;
alter table public.benefit_reports       enable row level security;
alter table public.runs_log              enable row level security;
alter table public.user_sessions         enable row level security;
