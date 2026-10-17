import { badRequest, fail, ok, pickParams, SAFE_ID } from "@/lib/api-helpers";
import { tf, type TfRun } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/** GET /api/tinyfish/runs/:id → GET /v1/runs/{id}?screenshots=none|url|base64&html=none|url */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!SAFE_ID.test(id)) return badRequest("Invalid run id");
  try {
    const sp = new URL(req.url).searchParams;
    const query = { screenshots: "none", html: "none", ...pickParams(sp, ["screenshots", "html"]) };
    return ok(await tf<TfRun>("agent", `/v1/runs/${encodeURIComponent(id)}`, { query, timeoutMs: 20_000 }));
  } catch (e) {
    return fail(e);
  }
}
