import "server-only";
import { db, dbBackend, safe, type Row } from "./db";
import { cfg, integrations } from "./config";
import { getWallet, lokmitraSpend, ratesFrom } from "./ops";
import { listPortals } from "./portal";
import { schemeById, stateByCode } from "./schemes";
import { listSentinels } from "./sentinel";
import { sessions } from "./store";

/**
 * Judge/Admin metrics from LokMitra's own audit log (runs_log) + live TinyFish wallet.
 *  - cache hit vs miss (Discover-Once-Fetch-Forever proof)
 *  - cumulative Wallet spend by surface vs DECK_BUDGET_USD
 *  - schemes surfaced, citizens served, estimated hours saved
 */

const MINUTES_SAVED_PER_SECTION = 75; // conservative midpoint of "1–4 hours of manual effort / CSC visit" per scheme

export interface Stats {
  generated_at: string;
  backend: "supabase" | "memory";
  wallet: { balance: number | null; error?: string | null; rates: ReturnType<typeof ratesFrom> };
  budget_usd: number;
  spend_usd: number;
  spend_by_surface: Record<string, number>;
  calls_by_surface: Record<string, number>;
  cache: { hits: number; misses: number; hit_pct: number; free_calls: number; paid_calls: number; free_pct: number };
  portal_map: { rows: number; agent_rows: number; hits: number; discovery_usd: number; amortised_usd_per_hit: number | null };
  reports: { total: number; sections: number; citizens: number; languages: Record<string, number>; schemes: { id: string; name: string; n: number }[]; states: { code: string; name: string; n: number }[] };
  impact: { schemes_surfaced: number; hours_saved: number; agent_runs: number; avg_cost_per_report_usd: number | null };
  sentinels: { total: number; subscribers: number; changes_7d: number };
  live: { browser_sessions: number; otp_relays: number; pending_confirms: number };
  timeline: { hour: string; free: number; paid: number; cost: number }[];
  integrations: ReturnType<typeof integrations>;
}

export async function computeStats(): Promise<Stats> {
  const [walletRes, logs, reports, portals, sentinels, subs, events, spend, liveB, liveO, liveC] = await Promise.all([
    getWallet(),
    safe(db.select<Row>("runs_log", { order: { col: "created_at" }, limit: 5000 }), []),
    safe(db.select<Row>("benefit_reports", { order: { col: "created_at" }, limit: 1000, select: "id,user_id,language,intent,cache_hits,cache_misses,cost_usd,created_at" }), []),
    listPortals(500),
    listSentinels(),
    safe(db.select<Row>("monitor_subscriptions", { limit: 5000, select: "id" }), []),
    safe(db.select<Row>("monitor_events", { order: { col: "created_at" }, limit: 500, select: "changed,created_at" }), []),
    lokmitraSpend(),
    sessions.list("browser", 100),
    sessions.list("otp", 100),
    sessions.list("confirm", 200),
  ]);

  const spend_by_surface: Record<string, number> = {};
  const calls_by_surface: Record<string, number> = {};
  let hits = 0;
  let misses = 0;
  let free = 0;
  let paid = 0;
  const buckets = new Map<string, { free: number; paid: number; cost: number }>();
  const since = Date.now() - 24 * 3600_000;
  for (const l of logs) {
    const s = String(l.surface);
    const c = Number(l.cost_usd ?? 0);
    spend_by_surface[s] = (spend_by_surface[s] ?? 0) + c;
    calls_by_surface[s] = (calls_by_surface[s] ?? 0) + 1;
    if (s === "search" || s === "fetch") free++;
    if ((s === "agent" && l.run_id && l.purpose !== "discovery_saved" && l.purpose !== "discovery_refreshed" && !String(l.purpose).endsWith("_result")) || (s === "browser" && c > 0) || (s === "monitor" && c > 0)) paid++;
    if (l.cache === "hit") hits++;
    else if (l.cache === "miss") misses++;
    const t = new Date(String(l.created_at)).getTime();
    if (t >= since) {
      const h = new Date(t).toISOString().slice(0, 13);
      const b = buckets.get(h) ?? { free: 0, paid: 0, cost: 0 };
      if (s === "search" || s === "fetch") b.free++;
      if (c > 0) (b.paid++, (b.cost += c));
      buckets.set(h, b);
    }
  }
  for (const k of Object.keys(spend_by_surface)) spend_by_surface[k] = Math.round(spend_by_surface[k] * 10000) / 10000;

  const timeline: Stats["timeline"] = [];
  for (let i = 23; i >= 0; i--) {
    const h = new Date(Date.now() - i * 3600_000).toISOString().slice(0, 13);
    const b = buckets.get(h) ?? { free: 0, paid: 0, cost: 0 };
    timeline.push({ hour: h, free: b.free, paid: b.paid, cost: Math.round(b.cost * 10000) / 10000 });
  }

  const languages: Record<string, number> = {};
  const schemeN = new Map<string, number>();
  const stateN = new Map<string, number>();
  const citizens = new Set<string>();
  let sections = 0;
  let reportCost = 0;
  for (const r of reports) {
    languages[String(r.language ?? "en")] = (languages[String(r.language ?? "en")] ?? 0) + 1;
    if (r.user_id) citizens.add(String(r.user_id));
    reportCost += Number(r.cost_usd ?? 0);
    const intent = (r.intent ?? {}) as { sub_queries?: { scheme_id: string }[]; state_code?: string | null };
    for (const q of intent.sub_queries ?? []) schemeN.set(q.scheme_id, (schemeN.get(q.scheme_id) ?? 0) + 1);
    sections += (intent.sub_queries ?? []).length || Number(r.cache_hits ?? 0) + Number(r.cache_misses ?? 0);
    const st = intent.state_code || "IN";
    stateN.set(st, (stateN.get(st) ?? 0) + 1);
  }

  const pm = portals.reduce((a, p) => ({ rows: a.rows + 1, agent_rows: a.agent_rows + (p.source === "agent" ? 1 : 0), hits: a.hits + (p.hits ?? 0), discovery_usd: a.discovery_usd + Number(p.discovery_cost_usd ?? 0) }), { rows: 0, agent_rows: 0, hits: 0, discovery_usd: 0 });
  const wk = Date.now() - 7 * 86400_000;
  const agentRuns = logs.filter((l) => l.surface === "agent" && l.run_id && (l.purpose === "discovery" || l.purpose === "status" || l.purpose === "land")).length;

  return {
    generated_at: new Date().toISOString(),
    backend: dbBackend(),
    wallet: { balance: walletRes.wallet ? Number(walletRes.wallet.available_balance) : null, error: walletRes.error ?? null, rates: ratesFrom(walletRes.wallet) },
    budget_usd: cfg.budgetUsd(),
    spend_usd: Math.round(spend * 10000) / 10000,
    spend_by_surface,
    calls_by_surface,
    cache: { hits, misses, hit_pct: hits + misses ? Math.round((hits / (hits + misses)) * 100) : 0, free_calls: free, paid_calls: paid, free_pct: free + paid ? Math.round((free / (free + paid)) * 100) : 100 },
    portal_map: { rows: pm.rows, agent_rows: pm.agent_rows, hits: pm.hits, discovery_usd: Math.round(pm.discovery_usd * 10000) / 10000, amortised_usd_per_hit: pm.hits ? Math.round((pm.discovery_usd / pm.hits) * 1e6) / 1e6 : null },
    reports: {
      total: reports.length,
      sections,
      citizens: citizens.size,
      languages,
      schemes: [...schemeN.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([id, n]) => ({ id, name: schemeById(id)?.name ?? id, n })),
      states: [...stateN.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([code, n]) => ({ code, name: stateByCode(code).name, n })),
    },
    impact: { schemes_surfaced: schemeN.size, hours_saved: Math.round(((sections * MINUTES_SAVED_PER_SECTION) / 60) * 10) / 10, agent_runs: agentRuns, avg_cost_per_report_usd: reports.length ? Math.round((reportCost / reports.length) * 10000) / 10000 : null },
    sentinels: { total: sentinels.length, subscribers: subs.length, changes_7d: events.filter((e) => e.changed && new Date(String(e.created_at)).getTime() > wk).length },
    live: { browser_sessions: liveB.length, otp_relays: liveO.length, pending_confirms: liveC.length },
    timeline,
    integrations: integrations(),
  };
}
