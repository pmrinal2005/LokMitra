import { badRequest, fail, ok, SAFE_ID } from "@/lib/api-helpers";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/** POST /api/tinyfish/runs/:id/cancel → POST /v1/runs/{id}/cancel */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!SAFE_ID.test(id)) return badRequest("Invalid run id");
  try {
    return ok(await tf("agent", `/v1/runs/${encodeURIComponent(id)}/cancel`, { method: "POST", timeoutMs: 20_000 }));
  } catch (e) {
    return fail(e);
  }
}
