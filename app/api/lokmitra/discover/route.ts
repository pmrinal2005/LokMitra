import { discover } from "@/lib/lokmitra/agentflow";
import { requireAdmin } from "@/lib/lokmitra/auth";
import { bad, body, sse } from "@/lib/lokmitra/http";
import { schemeById, type TaskKind } from "@/lib/lokmitra/schemes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/lokmitra/discover { scheme_id, state_code, task: "status"|"land", force? }  (operator)
 * One-time PAID Agent discovery, tee'd live: TinyFish SSE events arrive as `agent` events
 * (STARTED, STREAMING_URL, PROGRESS, COMPLETE…), LokMitra events as `stage` / `result` / `error`.
 */
export async function POST(req: Request) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const b = await body<{ scheme_id?: string; state_code?: string; task?: TaskKind; force?: boolean }>(req);
  if (!b.scheme_id || !schemeById(b.scheme_id)) return bad("valid scheme_id required");
  return sse(req, async (send, signal) => {
    const gen = discover({ scheme_id: b.scheme_id!, state_code: (b.state_code || "IN").toUpperCase(), task: b.task === "land" ? "land" : "status", force: b.force === true }, signal);
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
