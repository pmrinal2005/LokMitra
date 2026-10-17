import "server-only";
import { cfg } from "./config";
import { db, safe, type Row } from "./db";
import { fetch_clean_markdown } from "./ops";
import { listPortals } from "./portal";
import { purgeExpiredProfiles } from "./relay";
import { SCHEMES, stateByCode } from "./schemes";
import { sessions } from "./store";
import { uniq } from "./util";

/**
 * Nightly cron (Vercel Cron → /api/cron/prefetch):
 *  1. Refresh the most popular official pages with FREE Fetch (batched ≤10/request) so the
 *     next morning's citizens are served from a warm cache — before the Wallet is ever touched.
 *  2. Purge expired sessions and delete expired OTP Browser Context Profiles at TinyFish.
 */
export async function prefetch(limit = cfg.prefetchLimit()) {
  const t0 = Date.now();
  const popular = await safe(db.select<Row>("content_cache", { eq: { kind: "fetch" }, order: { col: "hits" }, limit: Math.min(limit, 500) }), []);
  const portals = await listPortals(500);
  const portalLinks = portals.sort((a, b) => (b.hits ?? 0) - (a.hits ?? 0)).flatMap((p) => (p.deep_links ?? []).filter((l) => l.kind !== "status" && l.kind !== "land").map((l) => l.url));
  const seeds = SCHEMES.flatMap((s) => s.infoLinks);
  const urls = uniq([...popular.map((r) => String(r.url ?? "")).filter(Boolean), ...portalLinks, ...seeds]).slice(0, Math.min(limit, 1000));
  // budget: keep well inside the free 1,000 URLs/day and 150/min allowance
  const budget = Math.min(urls.length, Math.max(0, cfg.prefetchLimit()));
  const pages = await fetch_clean_markdown(urls.slice(0, budget), { purpose: "LokMitra nightly prefetch of official scheme pages", force: true, ttlSec: 0 });
  const purged = await sessions.purgeExpired();
  const profiles = await purgeExpiredProfiles();
  return {
    urls: budget,
    ok: pages.filter((p) => !p.error && p.text).length,
    errors: pages.filter((p) => p.error).map((p) => `${p.url}: ${p.error}`).slice(0, 20),
    sessions_purged: purged,
    profiles_deleted: profiles.deleted,
    profile_errors: profiles.errors,
    elapsed_ms: Date.now() - t0,
    states: uniq(portals.map((p) => stateByCode(p.state_code).name)),
  };
}
