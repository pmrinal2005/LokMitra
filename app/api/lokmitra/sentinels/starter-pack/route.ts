import { requireAdmin, sanitizeUserId } from "@/lib/lokmitra/auth";
import { body, err, json } from "@/lib/lokmitra/http";
import { registerStarterPack, starterPackPlan } from "@/lib/lokmitra/sentinel";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const st = (v: unknown) => (typeof v === "string" && /^[A-Z]{2,3}$/.test(v.toUpperCase()) ? v.toUpperCase() : "IN");

/** GET /api/lokmitra/sentinels/starter-pack?state=MH — what the pack would register (free). */
export async function GET(req: Request) {
  try {
    return json(await starterPackPlan(st(new URL(req.url).searchParams.get("state"))));
  } catch (e) {
    return err(e);
  }
}

/**
 * POST { state_code, user_id?, email?, schedule_cron? } (operator) — registers the Monitor starter pack:
 * PMFBY deadline (state) · NSP deadline · PM-KISAN + Ayushman compliance (deterministic fact-check) · PM-KISAN circulars.
 * Existing (scheme × state × kind) monitors are reused, so re-running costs $0.
 */
export async function POST(req: Request) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const b = await body<{ state_code?: string; user_id?: string; email?: string; schedule_cron?: string }>(req);
  try {
    const email = typeof b.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ? b.email : null;
    return json(await registerStarterPack(st(b.state_code), { user_id: sanitizeUserId(b.user_id) ?? (email ? `email:${email}` : null), email, schedule_cron: b.schedule_cron }), 201);
  } catch (e) {
    return err(e);
  }
}
