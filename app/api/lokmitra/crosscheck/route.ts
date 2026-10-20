import { crossCheck } from "@/lib/lokmitra/agentflow";
import { bad, body, sse } from "@/lib/lokmitra/http";
import { rateLimit } from "@/lib/lokmitra/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/lokmitra/crosscheck { confirm_ids: string[≤5], identifiers?: { [confirm_id]: {key: value} }, report_id? }
 * Parallel multi-domain Agent verification (PM-KISAN + Ayushman + NSP … at once). Every event is
 * tagged with `idx` + `confirm_id` so the UI can route it to the right task card.
 */
export async function POST(req: Request) {
  const b = await body<{ confirm_ids?: string[]; identifiers?: Record<string, Record<string, unknown>>; report_id?: string }>(req);
  const ids = [...new Set((b.confirm_ids ?? []).filter((x) => typeof x === "string" && /^confirm_[0-9a-f-]{36}$/.test(x)))].slice(0, 5);
  if (!ids.length) return bad("confirm_ids required");
  const rl = await rateLimit(`crosscheck:${ids.join(",").slice(0, 80)}`, 1);
  if (!rl.ok) return bad("rate limited");
  const identifiers: Record<string, Record<string, string>> = {};
  for (const id of ids) {
    const raw = b.identifiers?.[id];
    if (raw && typeof raw === "object")
      identifiers[id] = Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^[a-z_]{2,30}$/.test(k) && typeof v === "string" && v.trim()).map(([k, v]) => [k, String(v).trim().slice(0, 80)]));
  }
  const reportId = typeof b.report_id === "string" && /^[0-9a-f-]{36}$/i.test(b.report_id) ? b.report_id : null;
  return sse(req, async (send, signal) => {
    await crossCheck(
      ids,
      (idx, e) => {
        const kind = e.type === "LM_STAGE" ? "stage" : e.type === "LM_RESULT" ? "result" : e.type === "LM_ERROR" ? "error" : "agent";
        send(kind, { ...e, idx, confirm_id: ids[idx] });
      },
      signal,
      { identifiers, report_id: reportId },
    );
  });
}
