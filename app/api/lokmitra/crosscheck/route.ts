import { crossCheck } from "@/lib/lokmitra/agentflow";
import { bad, body, sse } from "@/lib/lokmitra/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** POST /api/lokmitra/crosscheck { confirm_ids: string[≤5] } — parallel multi-domain Agent verification. */
export async function POST(req: Request) {
  const b = await body<{ confirm_ids?: string[] }>(req);
  const ids = (b.confirm_ids ?? []).filter((x) => typeof x === "string" && /^confirm_[0-9a-f-]{36}$/.test(x)).slice(0, 5);
  if (!ids.length) return bad("confirm_ids required");
  return sse(req, async (send, signal) => {
    await crossCheck(ids, (idx, e) => {
      const kind = e.type === "LM_STAGE" ? "stage" : e.type === "LM_RESULT" ? "result" : e.type === "LM_ERROR" ? "error" : "agent";
      send(kind, { ...e, idx, confirm_id: ids[idx] });
    }, signal);
  });
}
