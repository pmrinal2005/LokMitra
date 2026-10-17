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

-- ── Discover-Once-Fetch-Forever: the shared "virtual API" registry ───────
create table if not exists public.portal_map (
  id               uuid primary key default gen_random_uuid(),
  state_code       text not null,                 -- "IN" for national/central
  scheme_id        text not null,                 -- e.g. "pm-kisan"
  task             text not null,                 -- "info" | "status" | "land" | "deadline" ...
  entry_url        text not null,                 -- official portal entry point
  deep_links       jsonb not null default '[]',   -- [{url,label,kind}] free-Fetch targets
  nav_path         jsonb not null default '[]',   -- ordered steps the Agent discovered
  selectors        jsonb not null default '{}',   -- field labels / ids discovered by the Agent
  output_schema    jsonb,                          -- schema used for status extraction
  source           text not null default 'seed',  -- seed | search | agent
  discovered_by_run text,                          -- TinyFish run_id that paid for this
  discovery_cost_usd numeric(10,4) not null default 0,
  hits             integer not null default 0,     -- citizens served from cache
  last_verified_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (state_code, scheme_id, task)
);

-- ── content cache for free Search/Fetch (keyed by URL/query hash + etag) ─
create table if not exists public.content_cache (
  key            text primary key,                -- sha256(kind|url-or-query)
  kind           text not null check (kind in ('fetch','search')),
  url            text,
  query          text,
  title          text,
  language       text,
  etag           text,
  last_modified  text,
  body           jsonb not null,                  -- trimmed text / results
  fetched_at     timestamptz not null default now(),
  hits           integer not null default 0
);
create index if not exists content_cache_fetched_idx on public.content_cache (fetched_at desc);

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
  cache_hits    integer not null default 0,
  cache_misses  integer not null default 0,
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
  cache         text check (cache in ('hit','miss','bypass')),
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
alter table public.portal_map            enable row level security;
alter table public.content_cache         enable row level security;
alter table public.monitor_subscriptions enable row level security;
alter table public.benefit_reports       enable row level security;
alter table public.runs_log              enable row level security;
alter table public.user_sessions         enable row level security;

-- atomic hit counter used by the cache layer
create or replace function public.lokmitra_portal_hit(p_id uuid)
returns void language sql security definer as $$
  update public.portal_map set hits = hits + 1, updated_at = now() where id = p_id;
$$;
