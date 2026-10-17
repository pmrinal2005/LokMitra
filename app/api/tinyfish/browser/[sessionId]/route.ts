import { badRequest, fail, ok, SAFE_ID } from "@/lib/api-helpers";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/** DELETE /api/tinyfish/browser/:sessionId → DELETE api.browser.tinyfish.ai/{sessionId} (idempotent, 204) */
export async function DELETE(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  if (!SAFE_ID.test(sessionId)) return badRequest("Invalid session id");
  try {
    await tf("browser", `/${encodeURIComponent(sessionId)}`, { method: "DELETE", timeoutMs: 20_000 });
    return ok({ terminated: true, session_id: sessionId });
  } catch (e) {
    return fail(e);
  }
}
