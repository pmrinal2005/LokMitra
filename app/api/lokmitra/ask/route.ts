import { sanitizeUserId } from "@/lib/lokmitra/auth";
import { bad, body, err, json, sse } from "@/lib/lokmitra/http";
import { LANG_CODES } from "@/lib/lokmitra/languages";
import { ask, type AskInput } from "@/lib/lokmitra/pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/lokmitra/ask  { text, user_id?, language?, state_code?, district?, identifiers?, channel? }
 * Intent → LIVE Search (portal) → LIVE batched Fetch → extraction → confirm gate → synthesis → localisation.
 * Nothing is cached: two identical questions run two independent, complete live pipelines.
 * Streams SSE (`Accept: text/event-stream` or ?stream=1): stage · intent · search · fetch · section ·
 * confirm_required · report · result · done. Otherwise returns the final JSON.
 */
export async function POST(req: Request) {
  const b = await body<Record<string, unknown>>(req);
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) return bad("`text` is required");
  if (text.length > 2000) return bad("`text` too long (max 2000 chars)");
  const input: AskInput = {
    text,
    user_id: sanitizeUserId(b.user_id),
    channel: b.channel === "csc" ? "csc" : b.channel === "email" ? "email" : "web",
    language: typeof b.language === "string" && LANG_CODES.includes(b.language) ? b.language : null,
    state_code: typeof b.state_code === "string" && /^[A-Z]{2,3}$/.test(b.state_code) ? b.state_code : null,
    district: typeof b.district === "string" ? b.district.slice(0, 60) : null,
    identifiers: b.identifiers && typeof b.identifiers === "object" ? Object.fromEntries(Object.entries(b.identifiers as Record<string, unknown>).filter(([k, v]) => /^[a-z_]{2,30}$/.test(k) && typeof v === "string" && v.trim()).map(([k, v]) => [k, String(v).trim().slice(0, 80)])) : {},
  };
  const wantsStream = (req.headers.get("accept") ?? "").includes("text/event-stream") || new URL(req.url).searchParams.get("stream") === "1";
  if (!wantsStream) {
    try {
      return json(await ask(input));
    } catch (e) {
      return err(e);
    }
  }
  return sse(req, async (send) => {
    const r = await ask(input, (event, data) => send(event, data));
    send("result", r);
  });
}
