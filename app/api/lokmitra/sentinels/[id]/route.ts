import { requireAdmin } from "@/lib/lokmitra/auth";
import { bad, body, err, json } from "@/lib/lokmitra/http";
import { deleteSentinel, getSentinel, sentinelEvents, subscriptionsFor } from "@/lib/lokmitra/sentinel";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const okId = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id);

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!okId(id)) return bad("invalid id");
  const s = await getSentinel(id);
  if (!s) return err(Object.assign(new Error("sentinel not found"), { status: 404 }));
  const [events, subs, live] = await Promise.all([sentinelEvents(id, 50), subscriptionsFor(id), tf("agent", `/v1/monitors/${id}`, { timeoutMs: 15_000 }).catch((e) => ({ error: (e as Error).message }))]);
  return json({ sentinel: s, live, events, subscribers: subs.length });
}

/** PATCH { status: "active"|"paused" } — lifecycle only (TinyFish forbids mixing status with edits). */
export async function PATCH(req: Request, ctx: Ctx) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  if (!okId(id)) return bad("invalid id");
  const b = await body<{ status?: string; schedule_cron?: string }>(req);
  try {
    if (b.status === "active" || b.status === "paused") return json(await tf("agent", `/v1/monitors/${id}`, { method: "PATCH", body: { status: b.status }, timeoutMs: 20_000 }));
    if (b.schedule_cron) return json(await tf("agent", `/v1/monitors/${id}`, { method: "PATCH", body: { schedule_cron: b.schedule_cron }, timeoutMs: 20_000 }));
    return bad("status or schedule_cron required");
  } catch (e) {
    return err(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  if (!okId(id)) return bad("invalid id");
  try {
    return json(await deleteSentinel(id));
  } catch (e) {
    return err(e);
  }
}
