import "server-only";
import { db, safe, type Row } from "./db";
import { cfg } from "./config";
import { nowIso, redact, uuid } from "./util";

/* ================================================================== */
/* Audit log (anonymised) — every TinyFish / LLM / channel call        */
/* ================================================================== */
export type Surface = "search" | "fetch" | "agent" | "browser" | "monitor" | "llm" | "telegram" | "email";
export interface RunLog {
  surface: Surface;
  purpose: string;
  state_code?: string | null;
  scheme_id?: string | null;
  run_id?: string | null;
  status?: "ok" | "error" | "running" | "cancelled" | "skipped";
  cache?: "hit" | "miss" | "bypass" | null;
  steps?: number | null;
  cost_usd?: number;
  latency_ms?: number | null;
  meta?: Record<string, unknown>;
}

function scrubMeta(meta: Record<string, unknown> = {}) {
  try {
    return JSON.parse(redact(JSON.stringify(meta)));
  } catch {
    return {};
  }
}

export async function logRun(r: RunLog): Promise<string> {
  const id = uuid();
  await safe(
    db.insert("runs_log", {
      id,
      surface: r.surface,
      purpose: r.purpose,
      state_code: r.state_code ?? null,
      scheme_id: r.scheme_id ?? null,
      run_id: r.run_id ?? null,
      status: r.status ?? "ok",
      cache: r.cache ?? null,
      steps: r.steps ?? null,
      cost_usd: Math.round((r.cost_usd ?? 0) * 10000) / 10000,
      latency_ms: r.latency_ms ?? null,
      meta: scrubMeta(r.meta),
      created_at: nowIso(),
    }),
    [],
  );
  return id;
}

export async function updateRunLog(runId: string, patch: Partial<RunLog>) {
  const p: Row = { ...patch };
  if (patch.meta) p.meta = scrubMeta(patch.meta);
  if (typeof patch.cost_usd === "number") p.cost_usd = Math.round(patch.cost_usd * 10000) / 10000;
  await safe(db.update("runs_log", { run_id: runId }, p), []);
}

/* ================================================================== */
/* Ephemeral sessions (confirm gate, OTP relay, profile setup, chat)   */
/* ================================================================== */
export type SessionKind = "confirm" | "otp" | "profile_setup" | "chat" | "rate" | "tg_state" | "agent_run";

export interface SessionRow<T = Record<string, unknown>> {
  id: string;
  user_id: string | null;
  kind: SessionKind;
  data: T;
  expires_at: string;
  created_at: string;
}

export const sessions = {
  async put<T extends Record<string, unknown>>(kind: SessionKind, data: T, ttlSec: number, opts: { id?: string; user_id?: string | null } = {}) {
    const row = {
      id: opts.id ?? `${kind}_${uuid()}`,
      user_id: opts.user_id ?? null,
      kind,
      data,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      created_at: nowIso(),
    };
    await db.insert("user_sessions", row, { onConflict: "id" });
    return row as SessionRow<T>;
  },
  async get<T = Record<string, unknown>>(id: string): Promise<SessionRow<T> | null> {
    const r = await safe(db.one<Row>("user_sessions", { eq: { id } }), null);
    if (!r) return null;
    if (String(r.expires_at) < nowIso()) {
      await safe(db.remove("user_sessions", { eq: { id } }), 0);
      return null;
    }
    return r as unknown as SessionRow<T>;
  },
  async patch<T extends Record<string, unknown>>(id: string, data: Partial<T>) {
    const cur = await sessions.get<T>(id);
    if (!cur) return null;
    const next = { ...(cur.data as Record<string, unknown>), ...data };
    await safe(db.update("user_sessions", { id }, { data: next }), []);
    return { ...cur, data: next as T };
  },
  async del(id: string) {
    await safe(db.remove("user_sessions", { eq: { id } }), 0);
  },
  async list(kind?: SessionKind, limit = 100) {
    const rows = await safe(db.select<Row>("user_sessions", { eq: kind ? { kind } : undefined, gte: { col: "expires_at", val: nowIso() }, order: { col: "created_at" }, limit }), []);
    return rows as unknown as SessionRow[];
  },
  async purgeExpired() {
    return safe(db.remove("user_sessions", { lt: { col: "expires_at", val: nowIso() } }), 0);
  },
};

/* ================================================================== */
/* Rate limiting (per user / CSC) — fixed 1h window                    */
/* ================================================================== */
export async function rateLimit(userKey: string, cost = 1): Promise<{ ok: boolean; remaining: number; limit: number }> {
  const limit = cfg.rateLimitPerHour();
  if (limit <= 0) return { ok: true, remaining: Infinity, limit };
  const hour = new Date().toISOString().slice(0, 13);
  const id = `rate_${userKey}_${hour}`.replace(/[^A-Za-z0-9_:-]/g, "_").slice(0, 128);
  const cur = await sessions.get<{ n: number }>(id);
  const n = (cur?.data.n ?? 0) + cost;
  if (n > limit) return { ok: false, remaining: 0, limit };
  await safe(sessions.put("rate", { n }, 3700, { id, user_id: userKey }), null);
  return { ok: true, remaining: limit - n, limit };
}

/* ================================================================== */
/* Citizens                                                            */
/* ================================================================== */
export interface UserRow {
  id: string;
  channel: "telegram" | "web" | "email" | "csc";
  display_name?: string | null;
  language: string;
  state_code?: string | null;
  district?: string | null;
  email?: string | null;
  consent_at?: string | null;
}

export async function upsertUser(u: Partial<UserRow> & { id: string; channel: UserRow["channel"] }) {
  const existing = await safe(db.one<Row>("users", { eq: { id: u.id } }), null);
  const row: Row = { ...(existing ?? {}), ...Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined)), updated_at: nowIso() };
  if (!existing) row.created_at = nowIso();
  if (!row.language) row.language = "hi";
  const out = await safe(db.insert<Row>("users", row, { onConflict: "id" }), []);
  return (out[0] ?? row) as unknown as UserRow;
}

export async function getUser(id: string) {
  return (await safe(db.one<Row>("users", { eq: { id } }), null)) as unknown as UserRow | null;
}
