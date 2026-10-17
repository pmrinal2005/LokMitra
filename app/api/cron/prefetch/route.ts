import { isCron } from "@/lib/lokmitra/auth";
import { cfg } from "@/lib/lokmitra/config";
import { err, json } from "@/lib/lokmitra/http";
import { prefetch } from "@/lib/lokmitra/prefetch";
import { listSentinels, runSentinelNow } from "@/lib/lokmitra/sentinel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/prefetch — Vercel Cron (Authorization: Bearer $CRON_SECRET), nightly 02:30 IST.
 *  1. FREE Fetch warm-up of the most popular official pages (≤ PREFETCH_LIMIT, batched 10/request)
 *  2. purge expired sessions + delete expired OTP Browser Context Profiles at TinyFish
 *  3. optional SENTINEL_SWEEP=1: run-now every sentinel when no public webhook URL exists
 *     (each run = $0.005 Monitor fee; scheduled webhooks are preferred and cost the same)
 */
export async function GET(req: Request) {
  if (!isCron(req)) return json({ error: { code: "FORBIDDEN", message: "cron secret required" } }, 401);
  try {
    const out: Record<string, unknown> = { prefetch: await prefetch() };
    if (cfg.sentinelSweep() && !cfg.publicBaseUrl()) {
      const sweep: unknown[] = [];
      for (const s of (await listSentinels()).slice(0, 20)) {
        try {
          const r = await runSentinelNow(s.monitor_id);
          sweep.push({ monitor_id: s.monitor_id, changed: r.processed.changed, notified: r.processed.notified });
        } catch (e) {
          sweep.push({ monitor_id: s.monitor_id, error: (e as Error).message });
        }
      }
      out.sentinel_sweep = sweep;
    }
    return json(out);
  } catch (e) {
    return err(e);
  }
}
export const POST = GET;
