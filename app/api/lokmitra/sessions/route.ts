import { requireAdmin } from "@/lib/lokmitra/auth";
import { db, safe, type Row } from "@/lib/lokmitra/db";
import { json } from "@/lib/lokmitra/http";
import { relayCancel } from "@/lib/lokmitra/relay";
import { sessions, type SessionKind } from "@/lib/lokmitra/store";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SHOW: SessionKind[] = ["confirm", "otp", "browser", "chat", "tg_state"];

/** Never expose sealed blobs / cdp urls — only shape + metadata. */
function scrub(kind: string, d: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const keep = ["scheme_id", "task", "state_code", "entry_url", "est_steps", "language", "used", "report_id", "profile_id", "saved", "saved_at", "cookie_count", "domains", "steps", "kind", "session_id", "label", "url", "last_url", "last_title", "actions", "mode", "started"];
  for (const k of keep) if (k in d) out[k] = d[k];
  if (kind === "tg_state" && Array.isArray(d.pending)) out.pending = (d.pending as { label: string }[]).map((p) => p.label);
  return out;
}

/** GET /api/lokmitra/sessions — ephemeral sessions (confirm gates, OTP relays, live browsers) + ephemeral profiles. */
export async function GET() {
  const lists = await Promise.all(SHOW.map((k) => sessions.list(k, 100)));
  const all = lists.flat().filter((s) => !String(s.id).startsWith("tgupd_") && !String(s.id).startsWith("rate_"));
  const profiles = await safe(db.select<Row>("ephemeral_profiles", { order: { col: "created_at" }, limit: 100 }), []);
  const tfProfiles = await tf<{ profiles?: { id: string; name: string; created_at?: string }[] }>("agent", "/v1/profiles", { timeoutMs: 15_000 }).catch((e) => ({ profiles: [], error: (e as Error).message }));
  return json({
    sessions: all.map((s) => ({ id: s.id, kind: s.kind, user_id: s.user_id ? String(s.user_id).replace(/:(.{2}).*(.{2})$/, ":$1…$2") : null, expires_at: s.expires_at, created_at: s.created_at, data: scrub(s.kind, s.data as Record<string, unknown>) })),
    ephemeral_profiles: profiles,
    tinyfish_profiles: tfProfiles,
  });
}

/** DELETE /api/lokmitra/sessions?id=… — end a session (OTP relays also delete their TinyFish profile). Operator. */
export async function DELETE(req: Request) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_:-]{3,128}$/.test(id)) return json({ error: { code: "BAD_REQUEST", message: "id required" } }, 400);
  if (id.startsWith("otp_")) return json(await relayCancel(id));
  await sessions.del(id);
  return json({ deleted: id });
}
