import { isWebhook } from "@/lib/lokmitra/auth";
import { json } from "@/lib/lokmitra/http";
import { processMonitorResult } from "@/lib/lokmitra/sentinel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/webhooks/monitor?s=<WEBHOOK_SECRET>
 * TinyFish Monitor scheduled-run delivery (Page payload: fetch_monitor_id · Topic payload: search_monitor_id).
 * Detects the change (hash diff / new_result_positions), summarises it with Groq and fans out
 * Telegram / e-mail alerts to every subscribed citizen in that state. Zero Agent spend.
 */
export async function POST(req: Request) {
  if (!isWebhook(req)) return json({ error: { code: "FORBIDDEN", message: "bad webhook secret" } }, 403);
  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ error: { code: "BAD_REQUEST", message: "JSON body required" } }, 400);
  const r = await processMonitorResult(payload as Parameters<typeof processMonitorResult>[0], "webhook");
  return json({ ok: true, ...r });
}
