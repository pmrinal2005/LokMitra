import { badRequest, fail, ok, readJson, SAFE_ID } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/lokmitra/auth";
import { deleteProfile } from "@/lib/lokmitra/relay";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/tinyfish/profiles/:id → GET /v1/profiles/{id} (saved domains) */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!SAFE_ID.test(id)) return badRequest("invalid profile id");
  try {
    return ok(await tf("agent", `/v1/profiles/${id}`, { timeoutMs: 15_000 }));
  } catch (e) {
    return fail(e);
  }
}

/** PATCH /api/tinyfish/profiles/:id { name?, set_as_default?, proxy_country_code? } */
export async function PATCH(req: Request, ctx: Ctx) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  if (!SAFE_ID.test(id)) return badRequest("invalid profile id");
  const b = (await readJson<Record<string, unknown>>(req)) ?? {};
  const body: Record<string, unknown> = {};
  for (const k of ["name", "set_as_default", "proxy_country_code"]) if (k in b) body[k] = b[k];
  if (!Object.keys(body).length) return badRequest("nothing to update");
  try {
    return ok(await tf("agent", `/v1/profiles/${id}`, { method: "PATCH", body, timeoutMs: 15_000 }));
  } catch (e) {
    return fail(e);
  }
}

/** DELETE /api/tinyfish/profiles/:id */
export async function DELETE(req: Request, ctx: Ctx) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  if (!SAFE_ID.test(id)) return badRequest("invalid profile id");
  try {
    await deleteProfile(id);
    return ok({ deleted: true, id });
  } catch (e) {
    return fail(e);
  }
}
