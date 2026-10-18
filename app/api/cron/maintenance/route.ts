import { isCron } from "@/lib/lokmitra/auth";
import { cfg } from "@/lib/lokmitra/config";
import { err, json } from "@/lib/lokmitra/http";
import { purgeExpiredProfiles } from "@/lib/lokmitra/relay";
import { listSentinels, runSentinelNow } from "@/lib/lokmitra/sentinel";
import { sessions } from "@/lib/lokmitra/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/maintenance — Vercel Cron (Authorization: Bearer $CRON_SECRET), nightly 02:30 IST.
 * Privacy housekeeping only — there is NO pre-fetching / cache warm-up (LokMitra keeps no cache):
 *  1. purge expired ephemeral sessions (consent gates, OTP relays, chat context)
 *  2. delete expired OTP Browser Context Profiles at TinyFish (no long-term credential storage)
 *  3. optional SENTINEL_SWEEP=1: run-now every sentinel when no public webhook URL exists
 */
export async function GET(req: Request) {
  if (!isCron(req)) return json({ error: { code: "FORBIDDEN", message: "cron secret required" } }, 401);
  try {
    const t0 = Date.now();
    const purged = await sessions.purgeExpired();
    const profiles = await purgeExpiredProfiles();
    const out: Record<string, unknown> = { sessions_purged: purged, profiles_deleted: profiles.deleted, profile_errors: profiles.errors };
    if (cfg.sentinelSweep() && !cfg.publicBaseUrl()) {
      const sweep: unknown[] = [];
      for (const s of await listSentinels()) {
        try {
          const r = await runSentinelNow(s.monitor_id);
          sweep.push({ monitor_id: s.monitor_id, changed: r.processed.changed, notified: r.processed.notified });
        } catch (e) {
          sweep.push({ monitor_id: s.monitor_id, error: (e as Error).message });
        }
      }
      out.sentinel_sweep = sweep;
    }
    out.elapsed_ms = Date.now() - t0;
    return json(out);
  } catch (e) {
    return err(e);
  }
}
export const POST = GET;
