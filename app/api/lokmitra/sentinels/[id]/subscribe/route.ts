import { sanitizeUserId } from "@/lib/lokmitra/auth";
import { bad, body, err, json } from "@/lib/lokmitra/http";
import { subscribe, unsubscribe } from "@/lib/lokmitra/sentinel";
import { rateLimit } from "@/lib/lokmitra/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** POST { user_id? , email? } — subscribe a citizen (web/email/telegram id) to a sentinel's alerts. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return bad("invalid id");
  const b = await body<{ user_id?: string; email?: string }>(req);
  const email = typeof b.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ? b.email.trim().toLowerCase() : null;
  const uid = sanitizeUserId(b.user_id) ?? (email ? `email:${email}` : null);
  if (!uid) return bad("user_id (web:/tg:/email:) or a valid email required");
  const rl = await rateLimit(`sub:${uid}`, 1);
  if (!rl.ok) return err(Object.assign(new Error("rate limited"), { status: 429 }));
  try {
    return json(await subscribe({ monitor_id: id, user_id: uid, email, channel: uid.startsWith("tg:") ? "telegram" : email ? "email" : "web" }), 201);
  } catch (e) {
    return err(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const uid = sanitizeUserId(new URL(req.url).searchParams.get("user_id"));
  if (!uid) return bad("user_id required");
  return json({ removed: await unsubscribe(id, uid) });
}
