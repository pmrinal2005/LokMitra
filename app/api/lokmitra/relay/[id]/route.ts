import { err, json } from "@/lib/lokmitra/http";
import { relayCancel, relayGet } from "@/lib/lokmitra/relay";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const ok = (id: string) => /^otp_[0-9a-f-]{36}$/.test(id);

/** GET /api/lokmitra/relay/:id — relay status (never exposes cdp_url). */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!ok(id)) return err(Object.assign(new Error("invalid relay id"), { status: 400 }));
  try {
    return json((await relayGet(id)).view);
  } catch (e) {
    return err(e);
  }
}

/** DELETE /api/lokmitra/relay/:id — cancel setup-session + delete the temporary profile at TinyFish. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!ok(id)) return err(Object.assign(new Error("invalid relay id"), { status: 400 }));
  try {
    return json(await relayCancel(id));
  } catch (e) {
    return err(e);
  }
}
