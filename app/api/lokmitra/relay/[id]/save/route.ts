import { err, json } from "@/lib/lokmitra/http";
import { relaySave } from "@/lib/lokmitra/relay";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** POST /api/lokmitra/relay/:id/save → POST /v1/profiles/{id}/save — capture the logged-in cookies. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^otp_[0-9a-f-]{36}$/.test(id)) return err(Object.assign(new Error("invalid relay id"), { status: 400 }));
  try {
    return json(await relaySave(id));
  } catch (e) {
    return err(e);
  }
}
