import { badRequest, fail, ok, readJson, SAFE_ID } from "@/lib/api-helpers";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/** POST /api/tinyfish/runs/batch { run_ids: string[1..100] } → POST /v1/runs/batch (bulk status lookup) */
export async function POST(req: Request) {
  const input = await readJson<{ run_ids?: unknown }>(req);
  const ids = Array.isArray(input?.run_ids) ? (input!.run_ids as unknown[]).filter((x): x is string => typeof x === "string" && SAFE_ID.test(x)) : [];
  if (!ids.length || ids.length > 100) return badRequest("`run_ids` must contain 1–100 valid run ids");
  try {
    return ok(await tf("agent", "/v1/runs/batch", { method: "POST", body: { run_ids: ids }, timeoutMs: 20_000 }));
  } catch (e) {
    return fail(e);
  }
}
