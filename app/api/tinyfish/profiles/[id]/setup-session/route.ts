import { badRequest, fail, isHttpUrl, ok, readJson, SAFE_ID } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/lokmitra/auth";
import { sessions } from "@/lib/lokmitra/store";
import { seal } from "@/lib/lokmitra/util";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * POST /api/tinyfish/profiles/:id/setup-session { url?, timeout_seconds? } → POST /v1/profiles/{id}/setup-session
 * The raw cdp_url is kept server-side (sealed in a "browser" session usable from the Live page);
 * the response returns a control handle instead.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  if (!SAFE_ID.test(id)) return badRequest("invalid profile id");
  const b = (await readJson<Record<string, unknown>>(req)) ?? {};
  const body: Record<string, unknown> = {};
  if (b.url !== undefined) {
    if (!isHttpUrl(b.url)) return badRequest("url must be http(s)");
    body.url = b.url;
  }
  const t = Number(b.timeout_seconds);
  if (Number.isFinite(t) && t >= 5 && t <= 86400) body.timeout_seconds = Math.floor(t);
  try {
    const r = await tf<{ session_id: string; cdp_url: string; base_url: string; timeout_seconds: number; expires_at: string }>("agent", `/v1/profiles/${id}/setup-session`, { method: "POST", body, timeoutMs: 60_000 });
    const h = await sessions.put("browser", { kind: "profile_setup", profile_id: id, session_id: r.session_id, cdp: seal(r.cdp_url), url: body.url ?? null, started: Date.now() }, Math.min(r.timeout_seconds || 900, 86400));
    return ok({ session_id: r.session_id, handle: h.id, timeout_seconds: r.timeout_seconds, expires_at: r.expires_at, base_url: r.base_url }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
