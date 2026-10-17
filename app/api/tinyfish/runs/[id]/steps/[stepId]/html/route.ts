import { badRequest, fail, NO_STORE, SAFE_ID } from "@/lib/api-helpers";
import { tfRaw } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/**
 * GET /api/tinyfish/runs/:id/steps/:stepId/html → GET /v1/runs/{id}/steps/{stepId}/html
 * Served as text/plain + a locked-down CSP so captured third-party markup can never execute on our origin.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; stepId: string }> }) {
  const { id, stepId } = await ctx.params;
  if (!SAFE_ID.test(id) || !SAFE_ID.test(stepId)) return badRequest("Invalid id");
  try {
    const res = await tfRaw("agent", `/v1/runs/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}/html`, { accept: "text/html", timeoutMs: 20_000 });
    const text = await res.text();
    if (!res.ok) return new Response(text, { status: res.status, headers: { "Content-Type": "application/json", ...NO_STORE } });
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
