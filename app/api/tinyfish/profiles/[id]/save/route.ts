import { badRequest, fail, ok, readJson, SAFE_ID } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/lokmitra/auth";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** POST /api/tinyfish/profiles/:id/save { session_id, signed_in_sites? } → POST /v1/profiles/{id}/save */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  if (!SAFE_ID.test(id)) return badRequest("invalid profile id");
  const b = (await readJson<{ session_id?: string; signed_in_sites?: string[] }>(req)) ?? {};
  if (!b.session_id || !SAFE_ID.test(b.session_id)) return badRequest("session_id required");
  const body: Record<string, unknown> = { session_id: b.session_id };
  if (Array.isArray(b.signed_in_sites)) body.signed_in_sites = b.signed_in_sites.filter((s) => typeof s === "string").slice(0, 20);
  try {
    return ok(await tf("agent", `/v1/profiles/${id}/save`, { method: "POST", body, timeoutMs: 60_000 }));
  } catch (e) {
    return fail(e);
  }
}
