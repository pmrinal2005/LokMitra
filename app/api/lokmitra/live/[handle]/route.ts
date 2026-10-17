import { requireAdmin } from "@/lib/lokmitra/auth";
import { bad, body, err, json } from "@/lib/lokmitra/http";
import { actLive, stopLive, type LiveAction } from "@/lib/lokmitra/live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;
type Ctx = { params: Promise<{ handle: string }> };
const okH = (h: string) => /^browser_[0-9a-f-]{36}$/.test(h);

/** POST /api/lokmitra/live/:handle { actions:[{op:navigate,url}|{op:fill,idx,value}|{op:click,idx}|{op:scan}] } */
export async function POST(req: Request, ctx: Ctx) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const { handle } = await ctx.params;
  if (!okH(handle)) return bad("invalid handle");
  const b = await body<{ actions?: LiveAction[] }>(req);
  const actions = (Array.isArray(b.actions) ? b.actions : []).filter(
    (a) => a && (a.op === "scan" || (a.op === "navigate" && typeof a.url === "string") || (a.op === "fill" && Number.isInteger(a.idx) && typeof a.value === "string") || (a.op === "click" && Number.isInteger(a.idx))),
  );
  try {
    return json(await actLive(handle, actions.length ? actions : [{ op: "scan" }]));
  } catch (e) {
    return err(e);
  }
}

/** DELETE /api/lokmitra/live/:handle — terminate (Browser API DELETE / setup-session cancel) and log metered cost. */
export async function DELETE(req: Request, ctx: Ctx) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const { handle } = await ctx.params;
  if (!okH(handle)) return bad("invalid handle");
  try {
    return json(await stopLive(handle));
  } catch (e) {
    return err(e);
  }
}
