import "server-only";
import { tf } from "../tinyfish";
import { getWallet } from "./ops";
import { computeStats } from "./stats";

/**
 * Judge Console telemetry — one compact snapshot pushed over SSE every few seconds:
 * live TinyFish wallet balance (forced refresh, not the 20 s cache), session delta since
 * the console was opened, LokMitra spend vs budget, cache hit / free-call ratio, and the
 * newest running Agent run (with its streaming_url for the embedded live browser preview).
 */
export interface JudgeTick {
  at: string;
  wallet: number | null;
  wallet_error: string | null;
  spend_usd: number;
  budget_usd: number;
  cache: { hits: number; misses: number; hit_pct: number; free_calls: number; paid_calls: number; free_pct: number };
  portal_map: { rows: number; agent_rows: number; hits: number; discovery_usd: number };
  reports: number;
  hours_saved: number;
  calls_by_surface: Record<string, number>;
  live_run: { run_id: string; status: string; goal: string; streaming_url: string | null; steps: number; created_at: string } | null;
  recent_runs: { run_id: string; status: string; goal: string; steps: number; streaming_url: string | null; created_at: string }[];
}

interface RunRow { run_id: string; status: string; goal?: string; num_of_steps?: number | string; streaming_url?: string | null; created_at: string }

async function recentRuns(): Promise<RunRow[]> {
  try {
    const r = await tf<{ data: RunRow[] }>("agent", "/v1/runs", { query: { limit: "6" }, timeoutMs: 10_000 });
    return r.data ?? [];
  } catch {
    return [];
  }
}

export async function judgeTick(): Promise<JudgeTick> {
  const [w, s, runs] = await Promise.all([getWallet(true), computeStats(), recentRuns()]);
  const map = (r: RunRow) => ({ run_id: r.run_id, status: r.status, goal: String(r.goal ?? "").slice(0, 200), steps: Number(r.num_of_steps ?? 0), streaming_url: r.streaming_url ?? null, created_at: r.created_at });
  const live = runs.find((r) => r.status === "RUNNING" || r.status === "PENDING");
  return {
    at: new Date().toISOString(),
    wallet: w.wallet ? Number(w.wallet.available_balance) : null,
    wallet_error: w.error ?? null,
    spend_usd: s.spend_usd,
    budget_usd: s.budget_usd,
    cache: s.cache,
    portal_map: { rows: s.portal_map.rows, agent_rows: s.portal_map.agent_rows, hits: s.portal_map.hits, discovery_usd: s.portal_map.discovery_usd },
    reports: s.reports.total,
    hours_saved: s.impact.hours_saved,
    calls_by_surface: s.calls_by_surface,
    live_run: live ? map(live) : null,
    recent_runs: runs.map(map),
  };
}
