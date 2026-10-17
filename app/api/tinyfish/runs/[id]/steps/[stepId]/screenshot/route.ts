import { badRequest, fail, NO_STORE, SAFE_ID } from "@/lib/api-helpers";
import { tfRaw } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/** GET /api/tinyfish/runs/:id/steps/:stepId/screenshot → binary JPEG passthrough */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; stepId: string }> }) {
  const { id, stepId } = await ctx.params;
  if (!SAFE_ID.test(id) || !SAFE_ID.test(stepId)) return badRequest("Invalid id");
  try {
    const res = await tfRaw("agent", `/v1/runs/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}/screenshot`, {
      accept: "image/jpeg",
      timeoutMs: 20_000,
    });
    if (!res.ok) {
      return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json", ...NO_STORE } });
    }
    return new Response(res.body, {
      status: 200,
      headers: { "Content-Type": res.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch (e) {
    return fail(e);
  }
}
