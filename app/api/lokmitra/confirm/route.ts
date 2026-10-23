import { runConfirmed } from "@/lib/lokmitra/agentflow";
import { bad, body, sse } from "@/lib/lokmitra/http";
import { rateLimit } from "@/lib/lokmitra/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/lokmitra/confirm { confirm_id, identifiers?, relay_id?, report_id?, token? }
 * task = status | land (personal check) or verify (the guaranteed live Agent of every Sahayak journey).
 * `token` = sealed task session from /ask, so the run works even on a different serverless instance.
 * Starts the live Agent status / land check for a task planned by /ask — called automatically by every
 * channel (no consent gate). Strict output_schema, live SSE tee (steps, cost, STREAMING_URL, video_url),
 * optional Browser Context Profile reuse from the OTP relay. `confirm_id` is only the task handle.
 */
export async function POST(req: Request) {
  const b = await body<{ confirm_id?: string; identifiers?: Record<string, string>; relay_id?: string; report_id?: string; token?: string }>(req);
  if (!b.confirm_id || !/^confirm_[0-9a-f-]{36}$/.test(b.confirm_id)) return bad("valid confirm_id required");
  const rl = await rateLimit(`confirm:${b.confirm_id}`, 1);
  if (!rl.ok) return bad("rate limited");
  return sse(req, async (send, signal) => {
    const gen = runConfirmed({ confirm_id: b.confirm_id!, identifiers: b.identifiers, relay_id: b.relay_id ?? null, report_id: b.report_id ?? null, token: typeof b.token === "string" ? b.token.slice(0, 8000) : null }, signal);
    while (true) {
      const n = await gen.next();
      if (n.done) break;
      const e = n.value;
      if (e.type === "LM_STAGE") send("stage", e);
      else if (e.type === "LM_RESULT") send("result", e);
      else if (e.type === "LM_ERROR") send("error", e);
      else send("agent", e);
    }
  });
}
