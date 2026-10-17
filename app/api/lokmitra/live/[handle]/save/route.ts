import { requireAdmin } from "@/lib/lokmitra/auth";
import { bad, body, err, json } from "@/lib/lokmitra/http";
import { saveLiveProfile } from "@/lib/lokmitra/live";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** POST /api/lokmitra/live/:handle/save { signed_in_sites? } — save a profile setup session into its Browser Context Profile. */
export async function POST(req: Request, ctx: { params: Promise<{ handle: string }> }) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const { handle } = await ctx.params;
  if (!/^browser_[0-9a-f-]{36}$/.test(handle)) return bad("invalid handle");
  const b = await body<{ signed_in_sites?: string[] }>(req);
  try {
    return json(await saveLiveProfile(handle, (b.signed_in_sites ?? []).filter((s) => typeof s === "string")));
  } catch (e) {
    return err(e);
  }
}
