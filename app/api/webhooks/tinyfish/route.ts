import { isWebhook } from "@/lib/lokmitra/auth";
import { db, safe, type Row } from "@/lib/lokmitra/db";
import { json } from "@/lib/lokmitra/http";
import { rates } from "@/lib/lokmitra/ops";
import { getPortal, sanitizeNavPath, saveAgentDiscovery, type DiscoveryResult } from "@/lib/lokmitra/portal";
import { logRun, updateRunLog } from "@/lib/lokmitra/store";
import type { TfRun } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/webhooks/tinyfish?s=<WEBHOOK_SECRET>
 * TinyFish run webhook (run.completed | run.failed | run.cancelled) — payload.data has the GET /v1/runs/{id} shape.
 * Reconciles runs_log (real step count → real cost) even when the serverless SSE stream was cut off,
 * and completes a one-time discovery write-back if the SSE route never saw COMPLETE.
 */
export async function POST(req: Request) {
  if (!isWebhook(req)) return json({ error: { code: "FORBIDDEN", message: "bad webhook secret" } }, 403);
  const p = (await req.json().catch(() => null)) as { event?: string; run_id?: string; status?: string; data?: Partial<TfRun> } | null;
  const runId = p?.run_id ?? p?.data?.run_id;
  if (!runId) return json({ ok: true, ignored: "no run_id" });
  const data = p?.data ?? {};
  const steps = Number(data.num_of_steps ?? (data.steps ?? []).length ?? 0);
  const r = await rates();
  const cost = steps * r.step;
  const row = await safe(db.one<Row>("runs_log", { eq: { run_id: runId } }), null);
  const status = p?.status === "COMPLETED" ? "ok" : p?.status === "CANCELLED" ? "cancelled" : "error";
  if (row) {
    await updateRunLog(runId, { status, steps, cost_usd: cost, meta: { ...((row.meta as Record<string, unknown>) ?? {}), webhook: p?.event ?? null, error: data.error?.message ?? null } });
    // late discovery write-back (stream died before COMPLETE)
    if (row.purpose === "discovery" && p?.status === "COMPLETED" && data.result && row.scheme_id && row.state_code) {
      for (const task of ["status", "land"] as const) {
        const existing = await getPortal(String(row.state_code), String(row.scheme_id), task);
        if (existing && existing.source !== "agent" && existing.entry_url) {
          const res = data.result as Record<string, unknown>;
          const d = (res.result && typeof res.result === "object" ? res.result : res) as DiscoveryResult;
          await saveAgentDiscovery({ scheme_id: String(row.scheme_id), state_code: String(row.state_code), task, entry_url: existing.entry_url, run_id: runId, cost_usd: cost, discovery: d, nav_path: sanitizeNavPath((data.steps ?? []).map((s) => s.action), []) });
          break;
        }
      }
    }
  } else {
    void logRun({ surface: "agent", purpose: "webhook_unmatched", run_id: runId, status, steps, cost_usd: 0, meta: { event: p?.event ?? null, note: "run not launched by LokMitra (cost tracked by TinyFish wallet only)" } });
  }
  return json({ ok: true, run_id: runId, steps, cost_usd: Math.round(cost * 10000) / 10000 });
}
