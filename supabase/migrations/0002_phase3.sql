-- LokMitra · Phase 2/3 additions. Safe to re-run.

-- runs_log: also audit channel deliveries (telegram / email)
alter table public.runs_log drop constraint if exists runs_log_surface_check;
alter table public.runs_log add constraint runs_log_surface_check
  check (surface in ('search','fetch','agent','browser','monitor','llm','telegram','email'));

-- Monitor sentinel: registry of TinyFish monitors LokMitra created (one per scheme × state × kind)
create table if not exists public.sentinels (
  id            uuid primary key default gen_random_uuid(),
  monitor_id    text not null unique,            -- TinyFish monitor id
  monitor_type  text not null check (monitor_type in ('fetch','search')),
  scheme_id     text not null,
  state_code    text not null default 'IN',
  kind          text not null default 'deadline',-- deadline | circular | compliance
  target        text not null,                   -- url (page) or query (topic)
  schedule_cron text not null,
  purpose       text,
  last_run_at   timestamptz,
  last_change   jsonb,                           -- last detected diff summary
  created_at    timestamptz not null default now(),
  unique (scheme_id, state_code, kind)
);

-- every monitor delivery (webhook or run-now) with the detected change, for audit + fan-out
create table if not exists public.monitor_events (
  id            uuid primary key default gen_random_uuid(),
  monitor_id    text not null,
  run_id        text,
  source        text not null default 'webhook',  -- webhook | run_now | baseline
  changed       boolean not null default false,
  summary       text,
  payload       jsonb not null default '{}',
  notified      integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists monitor_events_created_idx on public.monitor_events (created_at desc);
create index if not exists monitor_events_monitor_idx on public.monitor_events (monitor_id);

-- telegram chat binding (users.id = 'tg:<chat_id>')
alter table public.users add column if not exists telegram_chat_id text;

alter table public.sentinels      enable row level security;
alter table public.monitor_events enable row level security;

-- popular-pages view used by the nightly prefetch cron
create or replace view public.lokmitra_popular_pages as
  select key, url, hits, fetched_at from public.content_cache
  where kind = 'fetch' and url is not null
  order by hits desc, fetched_at desc;
