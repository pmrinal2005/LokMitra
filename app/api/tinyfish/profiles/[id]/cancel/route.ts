import { badRequest, fail, ok, readJson, SAFE_ID } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/lokmitra/auth";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/** POST /api/tinyfish/profiles/:id/cancel { session_id } → POST /v1/profiles/{id}/setup-session/cancel */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  if (!SAFE_ID.test(id)) return badRequest("invalid profile id");
  const b = (await readJson<{ session_id?: string }>(req)) ?? {};
  if (!b.session_id || !SAFE_ID.test(b.session_id)) return badRequest("session_id required");
  try {
    return ok(await tf("agent", `/v1/profiles/${id}/setup-session/cancel`, { method: "POST", body: { session_id: b.session_id }, timeoutMs: 20_000 }));
  } catch (e) {
    return fail(e);
  }
}
