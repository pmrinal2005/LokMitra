import { badRequest, fail, ok, SAFE_ID } from "@/lib/api-helpers";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/tinyfish/monitors/:id/runs → run a Monitor immediately */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!SAFE_ID.test(id)) return badRequest("Invalid monitor id");
  try {
    return ok(await tf("agent", `/v1/monitors/${id}/runs`, { method: "POST", timeoutMs: 110_000 }), { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
