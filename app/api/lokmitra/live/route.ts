import { isHttpUrl } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/lokmitra/auth";
import { bad, body, err, json } from "@/lib/lokmitra/http";
import { listLive, startLive } from "@/lib/lokmitra/live";
import { walletGuard } from "@/lib/lokmitra/ops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** GET /api/lokmitra/live — open live browser sessions (Browser API + profile setup sessions). */
export async function GET() {
  return json({ sessions: await listLive() });
}

/** POST /api/lokmitra/live { url, timeout_seconds?, label? } — TinyFish Browser API session + first CDP snapshot (operator). */
export async function POST(req: Request) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const b = await body<{ url?: string; timeout_seconds?: number; label?: string }>(req);
  if (b.url !== undefined && b.url !== "" && !isHttpUrl(b.url)) return bad("url must be http(s)");
  const guard = await walletGuard(1); // Browser is cheap ($0.002/min) but still refuses below the wallet floor
  if (!guard.allowed) return err(Object.assign(new Error(`wallet guard: ${guard.reason}`), { status: 402 }));
  try {
    return json(await startLive({ url: b.url || null, timeout_seconds: b.timeout_seconds, label: typeof b.label === "string" ? b.label.slice(0, 80) : null }), 201);
  } catch (e) {
    return err(e);
  }
}
