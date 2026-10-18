-- LokMitra · remove the caching layer entirely (safe to re-run; no-op on fresh installs).
-- Every citizen query now runs live Search → Fetch → Agent; nothing is stored for reuse.

drop view     if exists public.lokmitra_popular_pages;
drop function if exists public.lokmitra_portal_hit(uuid);
drop table    if exists public.portal_map;
drop table    if exists public.content_cache;

alter table public.runs_log        drop column if exists cache;
alter table public.benefit_reports drop column if exists cache_hits;
alter table public.benefit_reports drop column if exists cache_misses;
alter table public.benefit_reports add column if not exists live_calls jsonb not null default '{}';
alter table public.benefit_reports add column if not exists elapsed_ms integer;
