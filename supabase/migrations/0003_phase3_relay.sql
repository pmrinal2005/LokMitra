-- LokMitra · Phase 3: OTP relay (ephemeral Browser Context Profiles) + email subscribers. Safe to re-run.

-- Every Browser Context Profile LokMitra creates for a citizen's OTP login is short-lived.
-- The nightly cron deletes it at TinyFish once expires_at passes (no long-term credential storage).
create table if not exists public.ephemeral_profiles (
  profile_id   text primary key,                 -- TinyFish prof_…
  user_id      text,
  scheme_id    text,
  state_code   text,
  purpose      text not null default 'otp_relay',
  expires_at   timestamptz not null,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists ephemeral_profiles_expiry_idx on public.ephemeral_profiles (expires_at) where deleted_at is null;
alter table public.ephemeral_profiles enable row level security;

-- Monitor fan-out can also go to e-mail (Resend) for CSC operators / family members
alter table public.monitor_subscriptions add column if not exists email text;
alter table public.monitor_subscriptions add column if not exists channel text not null default 'telegram';

-- benefit reports can be updated after a paid Agent run completes
alter table public.benefit_reports add column if not exists agent_results jsonb not null default '[]';
alter table public.benefit_reports add column if not exists updated_at timestamptz;
