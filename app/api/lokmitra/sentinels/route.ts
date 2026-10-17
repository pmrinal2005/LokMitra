import { requireAdmin } from "@/lib/lokmitra/auth";
import { bad, body, err, json } from "@/lib/lokmitra/http";
import { schemeById } from "@/lib/lokmitra/schemes";
import { ensureSentinel, listSentinels, liveMonitors, sentinelEvents, type SentinelKind } from "@/lib/lokmitra/sentinel";
import { db, safe, type Row } from "@/lib/lokmitra/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET /api/lokmitra/sentinels — LokMitra's sentinels joined with live TinyFish monitor status + recent events. */
export async function GET() {
  const [rows, live, events, subs] = await Promise.all([listSentinels(), liveMonitors(), sentinelEvents(undefined, 60), safe(db.select<Row>("monitor_subscriptions", { limit: 5000 }), [])]);
  const byId = new Map(live.monitors.map((m) => [m.id, m]));
  const subCount = new Map<string, number>();
  for (const s of subs) subCount.set(String(s.monitor_id), (subCount.get(String(s.monitor_id)) ?? 0) + 1);
  return json({
    sentinels: rows.map((s) => ({ ...s, scheme_name: schemeById(s.scheme_id)?.name ?? s.scheme_id, live: byId.get(s.monitor_id) ?? null, subscribers: subCount.get(s.monitor_id) ?? 0 })),
    events,
    other_monitors: live.monitors.filter((m) => !rows.some((r) => r.monitor_id === m.id)),
    live_error: live.error ?? null,
  });
}

/** POST /api/lokmitra/sentinels { scheme_id, state_code?, kind, schedule_cron?, target? } — create a Monitor (operator, $0.005 baseline). */
export async function POST(req: Request) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const b = await body<{ scheme_id?: string; state_code?: string; kind?: SentinelKind; schedule_cron?: string; target?: string }>(req);
  if (!b.scheme_id || !schemeById(b.scheme_id)) return bad("valid scheme_id required");
  const kind: SentinelKind = b.kind === "circular" || b.kind === "compliance" ? b.kind : "deadline";
  if (b.schedule_cron && b.schedule_cron.replace(/^CRON_TZ=\S+\s+/, "").trim().split(/\s+/).length !== 5) return bad("schedule_cron must be a 5-field cron (optionally prefixed with CRON_TZ=…)");
  if (b.target && kind !== "circular" && !/^https?:\/\//.test(b.target)) return bad("target must be an http(s) URL for page monitors");
  try {
    return json(await ensureSentinel({ scheme_id: b.scheme_id, state_code: (b.state_code || "IN").toUpperCase(), kind, schedule_cron: b.schedule_cron, target: b.target }), 201);
  } catch (e) {
    return err(e);
  }
}
