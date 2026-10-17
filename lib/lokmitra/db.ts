import "server-only";
import { cfg } from "./config";

/**
 * Minimal Supabase (PostgREST) data layer — no SDK, just fetch.
 * If SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing we fall back to a
 * process-local in-memory store so the app still works for local demos.
 * (On Vercel the memory store is per-instance and NOT durable — configure
 * Supabase for production; /settings shows which backend is active.)
 */

export type Row = Record<string, unknown>;
export interface Query {
  eq?: Record<string, string | number | boolean | null>;
  gte?: { col: string; val: string | number };
  lt?: { col: string; val: string | number };
  inList?: { col: string; vals: (string | number)[] };
  order?: { col: string; asc?: boolean };
  limit?: number;
  select?: string;
}

export class DbError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function dbBackend(): "supabase" | "memory" {
  return cfg.supabaseUrl() && cfg.supabaseKey() ? "supabase" : "memory";
}

/* ------------------------------------------------------------------ */
/* Supabase REST                                                       */
/* ------------------------------------------------------------------ */
function pgVal(v: unknown) {
  if (v === null) return "is.null";
  return `eq.${String(v)}`;
}
function qs(q: Query) {
  const p = new URLSearchParams();
  p.set("select", q.select ?? "*");
  for (const [k, v] of Object.entries(q.eq ?? {})) p.append(k, pgVal(v));
  if (q.gte) p.append(q.gte.col, `gte.${q.gte.val}`);
  if (q.lt) p.append(q.lt.col, `lt.${q.lt.val}`);
  if (q.inList) p.append(q.inList.col, `in.(${q.inList.vals.map((v) => `"${String(v).replace(/"/g, "")}"`).join(",")})`);
  if (q.order) p.set("order", `${q.order.col}.${q.order.asc ? "asc" : "desc"}`);
  if (q.limit) p.set("limit", String(q.limit));
  return p.toString();
}
async function sb(path: string, init: RequestInit & { prefer?: string } = {}) {
  const headers: Record<string, string> = {
    apikey: cfg.supabaseKey(),
    Authorization: `Bearer ${cfg.supabaseKey()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (init.prefer) headers.Prefer = init.prefer;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${cfg.supabaseUrl()}/rest/v1/${path}`, { ...init, headers, cache: "no-store", signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new DbError(res.status, `supabase ${res.status}: ${text.slice(0, 240)}`);
    return text ? JSON.parse(text) : null;
  } catch (e) {
    if (e instanceof DbError) throw e;
    throw new DbError(502, `supabase unreachable: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------------------------------------------ */
/* Memory fallback                                                     */
/* ------------------------------------------------------------------ */
type Mem = Map<string, Row[]>;
const g = globalThis as unknown as { __lokmitraMem?: Mem };
const mem: Mem = g.__lokmitraMem ?? (g.__lokmitraMem = new Map());
const tbl = (t: string) => {
  let r = mem.get(t);
  if (!r) mem.set(t, (r = []));
  return r;
};
function matches(r: Row, q: Query) {
  for (const [k, v] of Object.entries(q.eq ?? {})) if ((r[k] ?? null) !== v) return false;
  if (q.gte && !(String(r[q.gte.col] ?? "") >= String(q.gte.val))) return false;
  if (q.lt && !(String(r[q.lt.col] ?? "") < String(q.lt.val))) return false;
  if (q.inList && !q.inList.vals.map(String).includes(String(r[q.inList.col]))) return false;
  return true;
}
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const PK: Record<string, string> = { users: "id", content_cache: "key", user_sessions: "id", sentinels: "monitor_id" };
const DEFAULTS: Record<string, () => Row> = {
  portal_map: () => ({ id: uuid(), deep_links: [], nav_path: [], selectors: {}, source: "seed", discovery_cost_usd: 0, hits: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  runs_log: () => ({ id: uuid(), status: "ok", cost_usd: 0, meta: {}, created_at: new Date().toISOString() }),
  benefit_reports: () => ({ id: uuid(), cost_usd: 0, cache_hits: 0, cache_misses: 0, sources: [], created_at: new Date().toISOString() }),
  monitor_subscriptions: () => ({ id: uuid(), kind: "deadline", created_at: new Date().toISOString() }),
  users: () => ({ language: "hi", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  content_cache: () => ({ hits: 0, fetched_at: new Date().toISOString() }),
  user_sessions: () => ({ data: {}, created_at: new Date().toISOString() }),
  sentinels: () => ({ id: uuid(), state_code: "IN", kind: "deadline", created_at: new Date().toISOString() }),
  monitor_events: () => ({ id: uuid(), source: "webhook", changed: false, payload: {}, notified: 0, created_at: new Date().toISOString() }),
};

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */
export const db = {
  async select<T extends Row = Row>(table: string, q: Query = {}): Promise<T[]> {
    if (dbBackend() === "supabase") return (await sb(`${table}?${qs(q)}`)) as T[];
    let rows = tbl(table).filter((r) => matches(r, q));
    if (q.order) {
      const { col, asc } = q.order;
      rows = [...rows].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (asc ? 1 : -1));
    }
    if (q.limit) rows = rows.slice(0, q.limit);
    return rows.map((r) => ({ ...r })) as T[];
  },

  async one<T extends Row = Row>(table: string, q: Query): Promise<T | null> {
    const r = await db.select<T>(table, { ...q, limit: 1 });
    return r[0] ?? null;
  },

  /** Insert rows; with onConflict → upsert (merge duplicates). Returns inserted rows. */
  async insert<T extends Row = Row>(table: string, rows: Row | Row[], opts: { onConflict?: string } = {}): Promise<T[]> {
    const list = Array.isArray(rows) ? rows : [rows];
    if (!list.length) return [];
    if (dbBackend() === "supabase") {
      const path = opts.onConflict ? `${table}?on_conflict=${encodeURIComponent(opts.onConflict)}` : table;
      return (await sb(path, {
        method: "POST",
        body: JSON.stringify(list),
        prefer: `return=representation${opts.onConflict ? ",resolution=merge-duplicates" : ""}`,
      })) as T[];
    }
    const t = tbl(table);
    const out: Row[] = [];
    for (const r of list) {
      const keyCols = opts.onConflict ? opts.onConflict.split(",") : PK[table] ? [PK[table]] : [];
      const existing = keyCols.length ? t.find((x) => keyCols.every((k) => x[k] === r[k])) : undefined;
      if (existing && opts.onConflict) {
        Object.assign(existing, r, { updated_at: new Date().toISOString() });
        out.push({ ...existing });
      } else if (existing) {
        throw new DbError(409, `duplicate key in ${table}`);
      } else {
        const row = { ...(DEFAULTS[table]?.() ?? {}), ...r };
        t.push(row);
        out.push({ ...row });
      }
    }
    if (t.length > 5000) t.splice(0, t.length - 5000);
    return out as T[];
  },

  async update<T extends Row = Row>(table: string, eq: Query["eq"], patch: Row): Promise<T[]> {
    if (dbBackend() === "supabase") {
      return (await sb(`${table}?${qs({ eq })}`, { method: "PATCH", body: JSON.stringify(patch), prefer: "return=representation" })) as T[];
    }
    const rows = tbl(table).filter((r) => matches(r, { eq }));
    rows.forEach((r) => Object.assign(r, patch));
    return rows.map((r) => ({ ...r })) as T[];
  },

  async remove(table: string, q: Query): Promise<number> {
    if (dbBackend() === "supabase") {
      const r = (await sb(`${table}?${qs(q)}`, { method: "DELETE", prefer: "return=representation" })) as Row[] | null;
      return r?.length ?? 0;
    }
    const t = tbl(table);
    let n = 0;
    for (let i = t.length - 1; i >= 0; i--) if (matches(t[i], q)) (t.splice(i, 1), n++);
    return n;
  },

  async rpc(fn: string, args: Row) {
    if (dbBackend() === "supabase") return sb(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
    if (fn === "lokmitra_portal_hit") {
      const r = tbl("portal_map").find((x) => x.id === args.p_id);
      if (r) r.hits = Number(r.hits ?? 0) + 1;
    }
    return null;
  },

  async ping(): Promise<{ ok: boolean; backend: string; error?: string }> {
    try {
      await db.select("portal_map", { limit: 1, select: "id" });
      return { ok: true, backend: dbBackend() };
    } catch (e) {
      return { ok: false, backend: dbBackend(), error: (e as Error).message };
    }
  },
};

/** Never let a logging/caching failure break a citizen request. */
export async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.warn("[lokmitra:db]", (e as Error).message);
    return fallback;
  }
}
