import { sanitizeUserId } from "@/lib/lokmitra/auth";
import { body, err, json } from "@/lib/lokmitra/http";
import { startRelay } from "@/lib/lokmitra/relay";
import { rateLimit } from "@/lib/lokmitra/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/lokmitra/relay { confirm_id } | { scheme_id, state_code, identifiers }
 * Starts an OTP relay: short-lived Browser Context Profile + setup-session, opens the official
 * login page over CDP, pre-fills identifiers and returns a screenshot + the visible form fields.
 */
export async function POST(req: Request) {
  const b = await body<{ confirm_id?: string; scheme_id?: string; state_code?: string; identifiers?: Record<string, string>; user_id?: string }>(req);
  const uid = sanitizeUserId(b.user_id);
  const rl = await rateLimit(`relay:${uid ?? req.headers.get("x-forwarded-for") ?? "anon"}`, 1);
  if (!rl.ok) return err(Object.assign(new Error("Too many OTP sessions, try later."), { status: 429 }));
  try {
    return json(await startRelay({ confirm_id: b.confirm_id, scheme_id: b.scheme_id, state_code: b.state_code, identifiers: b.identifiers, user_id: uid }), 201);
  } catch (e) {
    return err(e);
  }
}
