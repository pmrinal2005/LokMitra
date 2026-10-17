import type { SectorId } from "./classify";

export interface ApiErr {
  code: string;
  message: string;
  status: number;
}

export interface NodeStat {
  id: string;
  volume: number;
  hits: number;
  misses: number;
  active: number;
  last_updated: string | null;
  spark: number[];
  top_label: string | null;
  hosts: string[];
}

export interface TickerItem {
  kind: "success" | "active" | "fail" | "free";
  icon: string;
  text: string;
  state: string;
  sector: SectorId | null;
  at: string | null;
}

export interface RecentRun {
  run_id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  goal: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  num_of_steps: number | null;
  duration_ms: number | null;
  error: { message: string; category: string } | null;
  result: Record<string, unknown> | null;
  state: string;
  sector: SectorId | null;
}

export interface WalletShape {
  available_balance: string;
  currency: string;
  as_of: string;
  auto_reload: { state: string; threshold?: string; recharge_to?: string } | null;
  pending_top_up: { amount: string; started_at: string } | null;
  rates: { meters: { label: string; unit_amount: string; currency: string; per?: string }[]; as_of: string } | null;
}

export interface DeckOverview {
  configured: boolean;
  generated_at: string;
  errors: Record<string, ApiErr>;
  wallet: WalletShape | null;
  runs: { total: number; active: number; completed: number; failed: number; cancelled: number; steps: number; recent: RecentRun[] };
  usage: { search: number; fetch: number; browser_sessions: number; browser_minutes: number; search_cached: number };
  monitors: { total: number; active: number; items: { id: string; name: string | null; type: string; status: string; schedule_cron: string }[] };
  cache: { free_calls: number; paid_calls: number; free_pct: number };
  nodes: NodeStat[];
  sectors: { id: SectorId; served: number; states: number }[];
  ticker: TickerItem[];
  spend_estimate_usd: number | null;
  budget_usd: number;
}

/** Terminal line model (client) */
export interface LogLine {
  id: string;
  glyph: "▶" | "✓" | "⚠" | "✕" | "·" | "◆";
  tone: "action" | "success" | "retry" | "fail" | "meta" | "free";
  text: string;
  at: string;
  json?: unknown;
}
