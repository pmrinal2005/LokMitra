import { ok } from "@/lib/api-helpers";
import { classifySector, classifyState, hostOf, SECTORS, type SectorId } from "@/lib/classify";
import { STATE_NODES } from "@/lib/geo-data";
import {
  hasApiKey,
  tf,
  TinyFishError,
  type TfBrowserUsageItem,
  type TfFetchUsageItem,
  type TfMonitor,
  type TfRun,
  type TfRunList,
  type TfSearchUsageItem,
  type TfUsagePage,
  type TfWallet,
} from "@/lib/tinyfish";
import type { DeckOverview, NodeStat, TickerItem } from "@/lib/deck-types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SPARK_BUCKETS = 12;
const BUCKET_MS = 2 * 60 * 60 * 1000; // 2h buckets → last 24h

function settle<T>(p: Promise<T>) {
  return p.then(
    (value) => ({ ok: true as const, value }),
    (e: unknown) => ({
      ok: false as const,
      error: e instanceof TinyFishError ? { code: e.code, message: e.message, status: e.status } : { code: "ERROR", message: String(e), status: 500 },
    }),
  );
}

function dur(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

function fmtDur(ms: number) {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

function clip(s: string, n = 64) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/**
 * GET /api/deck/overview
 * Fan-out aggregator: calls 6 live TinyFish endpoints in parallel
 * (wallet, runs, search usage, fetch usage, browser usage, monitors) and
 * folds them into the deck's visual model (map nodes, sectors, live-execution ring, ticker).
 */
export async function GET() {
  const now = Date.now();
  if (!hasApiKey()) {
    return ok<DeckOverview>({
      configured: false,
      generated_at: new Date(now).toISOString(),
      errors: { config: { code: "TINYFISH_API_KEY_MISSING", message: "Set TINYFISH_API_KEY in your environment.", status: 503 } },
      wallet: null,
      runs: { total: 0, active: 0, completed: 0, failed: 0, cancelled: 0, steps: 0, recent: [] },
      usage: { search: 0, fetch: 0, browser_sessions: 0, browser_minutes: 0 },
      monitors: { total: 0, active: 0, items: [] },
      live: { open_web_calls: 0, agent_calls: 0, open_web_pct: 0 },
      nodes: [],
      sectors: SECTORS.map((s) => ({ id: s.id, served: 0, states: 0 })),
      ticker: [],
      spend_estimate_usd: null,
    });
  }

  const [wallet, runs, searchU, fetchU, browserU, monitors] = await Promise.all([
    settle(tf<TfWallet>("agent", "/v1/wallet", { timeoutMs: 12_000 })),
    settle(tf<TfRunList>("agent", "/v1/runs", { query: { limit: 100, sort_direction: "desc" }, timeoutMs: 15_000 })),
    settle(tf<TfUsagePage<TfSearchUsageItem>>("search", "/usage", { query: { limit: 200 }, timeoutMs: 12_000 })),
    settle(tf<TfUsagePage<TfFetchUsageItem>>("fetch", "/usage", { query: { limit: 200 }, timeoutMs: 12_000 })),
    settle(tf<TfUsagePage<TfBrowserUsageItem>>("browser", "/usage", { query: { limit: 200 }, timeoutMs: 12_000 })),
    settle(tf<{ monitors: TfMonitor[] }>("agent", "/v1/monitors", { timeoutMs: 12_000 })),
  ]);

  const errors: DeckOverview["errors"] = {};
  if (!wallet.ok) errors.wallet = wallet.error;
  if (!runs.ok) errors.runs = runs.error;
  if (!searchU.ok) errors.search_usage = searchU.error;
  if (!fetchU.ok) errors.fetch_usage = fetchU.error;
  if (!browserU.ok) errors.browser_usage = browserU.error;
  if (!monitors.ok) errors.monitors = monitors.error;

  const runList: TfRun[] = runs.ok ? runs.value.data ?? [] : [];
  const searchItems = searchU.ok ? searchU.value.items ?? [] : [];
  const fetchItems = fetchU.ok ? fetchU.value.items ?? [] : [];
  const browserItems = browserU.ok ? browserU.value.items ?? [] : [];
  const monitorItems = monitors.ok ? monitors.value.monitors ?? [] : [];

  /* ---------- node (state) + sector aggregation ---------- */
  const nodeMap = new Map<string, NodeStat>();
  const getNode = (id: string) => {
    let n = nodeMap.get(id);
    if (!n) {
      n = { id, volume: 0, open_web: 0, agentic: 0, active: 0, last_updated: null, spark: Array(SPARK_BUCKETS).fill(0), top_label: null, hosts: [] };
      nodeMap.set(id, n);
    }
    return n;
  };
  const sectorAgg = new Map<SectorId, { served: number; states: Set<string> }>();
  SECTORS.forEach((s) => sectorAgg.set(s.id, { served: 0, states: new Set() }));

  const touch = (text: string, at: string | null, kind: "open_web" | "agentic", label: string, url?: string | null, active = false) => {
    const stateId = classifyState(text);
    const n = getNode(stateId);
    n.volume += 1;
    if (kind === "open_web") n.open_web += 1;
    else n.agentic += 1;
    if (active) n.active += 1;
    if (at) {
      if (!n.last_updated || at > n.last_updated) {
        n.last_updated = at;
        n.top_label = label;
      }
      const age = now - new Date(at).getTime();
      const b = SPARK_BUCKETS - 1 - Math.floor(age / BUCKET_MS);
      if (b >= 0 && b < SPARK_BUCKETS) n.spark[b] += 1;
    }
    const h = hostOf(url);
    if (h && !n.hosts.includes(h) && n.hosts.length < 4) n.hosts.push(h);
    const sec = classifySector(text);
    if (sec) {
      const agg = sectorAgg.get(sec)!;
      agg.served += 1;
      agg.states.add(stateId);
    }
  };

  for (const r of runList) {
    touch(`${r.goal}`, r.created_at, "agentic", clip(r.goal, 48), null, r.status === "RUNNING" || r.status === "PENDING");
  }
  for (const s of searchItems) touch(s.query, s.created_at, "open_web", clip(s.query, 48));
  for (const f of fetchItems) touch(`${f.url} ${f.title ?? ""}`, f.created_at, "open_web", clip(f.title || hostOf(f.url) || f.url, 48), f.url);

  const nodes = STATE_NODES.map((s) => nodeMap.get(s.id)).filter(Boolean) as NodeStat[];

  /* ---------- run stats ---------- */
  const count = (st: TfRun["status"]) => runList.filter((r) => r.status === st).length;
  const steps = runList.reduce((a, r) => a + (r.num_of_steps ?? 0), 0);
  const recent = runList.slice(0, 25).map((r) => ({
    run_id: r.run_id,
    status: r.status,
    goal: r.goal,
    created_at: r.created_at,
    started_at: r.started_at,
    finished_at: r.finished_at,
    num_of_steps: r.num_of_steps,
    duration_ms: dur(r.started_at ?? r.created_at, r.finished_at),
    error: r.error ? { message: r.error.message, category: r.error.category } : null,
    result: r.result,
    state: classifyState(r.goal),
    sector: classifySector(r.goal),
  }));

  /* ---------- usage + live execution mix ---------- */
  const searchTotal = searchU.ok ? searchU.value.total ?? searchItems.length : 0;
  const fetchTotal = fetchU.ok ? fetchU.value.total ?? fetchItems.length : 0;
  const browserMinutes = browserItems.reduce((a, b) => a + (b.duration_ms ?? 0), 0) / 60000;
  const paid = runs.ok ? runs.value.pagination?.total ?? runList.length : 0;
  const free = searchTotal + fetchTotal;
  const freePct = free + paid > 0 ? Math.round((free / (free + paid)) * 1000) / 10 : 0;

  /* ---------- spend estimate from live contract rates ---------- */
  let spend: number | null = null;
  const meters = wallet.ok ? wallet.value.rates?.meters ?? [] : [];
  const stepMeter = meters.find((m) => /step/i.test(m.label));
  const browserMeter = meters.find((m) => /browser/i.test(m.label));
  if (stepMeter || browserMeter) {
    spend = 0;
    if (stepMeter) spend += steps * Number(stepMeter.unit_amount);
    if (browserMeter && /min/i.test(`${browserMeter.per ?? ""} ${browserMeter.label}`)) spend += browserMinutes * Number(browserMeter.unit_amount);
    else if (browserMeter && /hour/i.test(`${browserMeter.per ?? ""}`)) spend += (browserMinutes / 60) * Number(browserMeter.unit_amount);
    spend = Math.round(spend * 10000) / 10000;
  }

  /* ---------- human ticker (only real events) ---------- */
  const ticker: TickerItem[] = [];
  for (const r of runList.slice(0, 12)) {
    const d = dur(r.started_at ?? r.created_at, r.finished_at);
    const where = classifyState(r.goal);
    const sec = classifySector(r.goal);
    if (r.status === "COMPLETED")
      ticker.push({ kind: "success", icon: "⚡", text: `${clip(r.goal, 58)} — done${d ? ` in ${fmtDur(d)}` : ""}${r.num_of_steps ? ` · ${r.num_of_steps} steps` : ""}`, state: where, sector: sec, at: r.finished_at ?? r.created_at });
    else if (r.status === "RUNNING" || r.status === "PENDING")
      ticker.push({ kind: "active", icon: "🐟", text: `Agent swimming: ${clip(r.goal, 60)}`, state: where, sector: sec, at: r.created_at });
    else if (r.status === "FAILED") ticker.push({ kind: "fail", icon: "⚠", text: `Retry queued: ${clip(r.goal, 60)}`, state: where, sector: sec, at: r.created_at });
  }
  for (const s of searchItems.slice(0, 8))
    ticker.push({ kind: "free", icon: "🔎", text: `“${clip(s.query, 48)}” → ${s.result_count} results, live`, state: classifyState(s.query), sector: classifySector(s.query), at: s.created_at });
  for (const f of fetchItems.slice(0, 8))
    if (f.status === "completed")
      ticker.push({ kind: "free", icon: "📄", text: `${clip(f.title || hostOf(f.url), 44)} fetched live${f.latency_ms ? ` in ${Math.round(f.latency_ms)}ms` : ""}${f.language ? ` · ${f.language}` : ""}`, state: classifyState(f.url), sector: classifySector(`${f.url} ${f.title}`), at: f.created_at });
  ticker.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  const body: DeckOverview = {
    configured: true,
    generated_at: new Date(now).toISOString(),
    errors,
    wallet: wallet.ok ? wallet.value : null,
    runs: {
      total: paid,
      active: count("RUNNING") + count("PENDING"),
      completed: count("COMPLETED"),
      failed: count("FAILED"),
      cancelled: count("CANCELLED"),
      steps,
      recent,
    },
    usage: {
      search: searchTotal,
      fetch: fetchTotal,
      browser_sessions: browserU.ok ? browserU.value.total ?? browserItems.length : 0,
      browser_minutes: Math.round(browserMinutes * 10) / 10,
    },
    monitors: {
      total: monitorItems.length,
      active: monitorItems.filter((m) => m.status === "active").length,
      items: monitorItems.slice(0, 10).map((m) => ({ id: m.id, name: m.name ?? null, type: m.type, status: m.status, schedule_cron: m.schedule_cron })),
    },
    live: { open_web_calls: free, agent_calls: paid, open_web_pct: freePct },
    nodes,
    sectors: SECTORS.map((s) => ({ id: s.id, served: sectorAgg.get(s.id)!.served, states: sectorAgg.get(s.id)!.states.size })),
    ticker: ticker.slice(0, 24),
    spend_estimate_usd: spend,
  };
  return ok(body);
}
