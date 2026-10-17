import { fail, ok, pickParams } from "@/lib/api-helpers";
import { tf, type TfRunList } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/** GET /api/tinyfish/runs → GET /v1/runs (status, goal, created_after, created_before, sort_direction, cursor, limit) */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const query = pickParams(sp, ["status", "goal", "created_after", "created_before", "sort_direction", "cursor", "limit"]);
    return ok(await tf<TfRunList>("agent", "/v1/runs", { query, timeoutMs: 20_000 }));
  } catch (e) {
    return fail(e);
  }
}
