import { bad, body, err, json } from "@/lib/lokmitra/http";
import { relayAct, type RelayAction } from "@/lib/lokmitra/relay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * POST /api/lokmitra/relay/:id/act { actions: [{op:"fill",idx,value}|{op:"click",idx}|{op:"navigate",url}|{op:"scan"}] }
 * The citizen types CAPTCHA / OTP and presses buttons; LokMitra relays them over CDP and returns
 * a fresh screenshot + field list.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^otp_[0-9a-f-]{36}$/.test(id)) return bad("invalid relay id");
  const b = await body<{ actions?: RelayAction[] }>(req);
  const actions = (Array.isArray(b.actions) ? b.actions : [{ op: "scan" } as RelayAction]).filter(
    (a) => a && (a.op === "scan" || (a.op === "fill" && Number.isInteger(a.idx) && typeof a.value === "string") || (a.op === "click" && Number.isInteger(a.idx)) || (a.op === "navigate" && typeof a.url === "string")),
  );
  try {
    return json(await relayAct(id, actions.length ? actions : [{ op: "scan" }]));
  } catch (e) {
    return err(e);
  }
}
