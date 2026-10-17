import "server-only";
import { tf, tfRaw, TinyFishError, type TfFetchResponse, type TfRun, type TfSearchResponse, type TfWallet } from "../tinyfish";
import { cfg } from "./config";
import { db, safe, type Row } from "./db";
import { logRun, updateRunLog } from "./store";
import { chunk, clip, hostOf, nowIso, sha256, sseEvents } from "./util";

/* ================================================================== */
/* Wallet / cost guard                                                 */
/* ================================================================== */
export interface Rates {
  step: number;
  browserPerMin: number;
  monitor: number;
  source: "wallet" | "fallback";
}

let walletCache: { at: number; wallet: TfWallet | null; error?: string } | null = null;

export async function getWallet(force = false): Promise<{ wallet: TfWallet | null; error?: string }> {
  if (!force && walletCache && Date.now() - walletCache.at < 20_000) return walletCache;
  try {
    const w = await tf<TfWallet>("agent", "/v1/wallet", { timeoutMs: 12_000 });
    walletCache = { at: Date.now(), wallet: w };
  } catch (e) {
    walletCache = { at: Date.now(), wallet: null, error: (e as Error).message };
  }
  return walletCache;
}

export function ratesFrom(w: TfWallet | null): Rates {
  const meters = w?.rates?.meters ?? [];
  const step = meters.find((m) => /step|agent/i.test(m.label));
  const br = meters.find((m) => /browser/i.test(m.label));
  const mon = meters.find((m) => /monitor/i.test(m.label));
  let browserPerMin = cfg.browserRateFallback();
  if (br) {
    const v = Number(br.unit_amount);
    browserPerMin = /hour/i.test(`${br.per ?? ""} ${br.label}`) ? v / 60 : v;
  }
  return {
    step: step ? Number(step.unit_amount) : cfg.stepRateFallback(),
    browserPerMin,
    monitor: mon ? Number(mon.unit_amount) : cfg.monitorRateFallback(),
    source: step ? "wallet" : "fallback",
  };
}

export async function rates(): Promise<Rates> {
  return ratesFrom((await getWallet()).wallet);
}

export interface GuardResult {
  allowed: boolean;
  balance: number | null;
  estimate_usd: number;
  reason?: string;
  rates: Rates;
}

/**
 * Wallet guard: refuse a paid Agent/Browser run if the live wallet would drop below MIN_WALLET_USD,
 * or if LokMitra's own logged spend has crossed the DECK_BUDGET_USD ceiling.
 * Graceful degradation — callers fall back to Fetch + LLM guidance.
 */
export async function walletGuard(estSteps: number): Promise<GuardResult> {
  const { wallet, error } = await getWallet();
  const r = ratesFrom(wallet);
  const estimate = Math.round(estSteps * r.step * 10000) / 10000;
  const balance = wallet ? Number(wallet.available_balance) : null;
  if (balance === null) return { allowed: false, balance, estimate_usd: estimate, rates: r, reason: `wallet unavailable (${error ?? "unknown"})` };
  if (balance - estimate < cfg.minWalletUsd()) return { allowed: false, balance, estimate_usd: estimate, rates: r, reason: `wallet low: $${balance.toFixed(3)} (floor $${cfg.minWalletUsd()})` };
  const spent = await lokmitraSpend();
  if (spent + estimate > cfg.budgetUsd()) return { allowed: false, balance, estimate_usd: estimate, rates: r, reason: `LokMitra budget reached: $${spent.toFixed(3)} of $${cfg.budgetUsd()}` };
  return { allowed: true, balance, estimate_usd: estimate, rates: r };
}

export async function lokmitraSpend(): Promise<number> {
  const rows = await safe(db.select<Row>("runs_log", { select: "cost_usd", limit: 5000, order: { col: "created_at" } }), []);
  return rows.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
}

/* ================================================================== */
/* search_schemes — TinyFish Search (FREE)                             */
/* ================================================================== */
export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  site_name: string;
  position: number;
  date?: string;
}

export async function search_schemes(
  query: string,
  opts: { include_domains?: string[]; purpose?: string; scheme_id?: string; state_code?: string; recency_minutes?: number; cacheTtlSec?: number; domain_type?: "web" | "news" } = {},
): Promise<{ hits: SearchHit[]; cached: boolean; error?: string }> {
  const q = query.trim().slice(0, 400);
  const key = sha256(`search|${q}|${(opts.include_domains ?? []).join(",")}|${opts.domain_type ?? ""}`);
  const ttl = opts.cacheTtlSec ?? cfg.cacheTtlSec();
  const cachedRow = await safe(db.one<Row>("content_cache", { eq: { key } }), null);
  if (cachedRow && Date.now() - new Date(String(cachedRow.fetched_at)).getTime() < ttl * 1000) {
    void safe(db.update("content_cache", { key }, { hits: Number(cachedRow.hits ?? 0) + 1 }), []);
    void logRun({ surface: "search", purpose: opts.purpose ?? "search", scheme_id: opts.scheme_id, state_code: opts.state_code, cache: "hit", latency_ms: 0, meta: { q: clip(q, 120) } });
    return { hits: (cachedRow.body as { hits: SearchHit[] }).hits ?? [], cached: true };
  }
  const t0 = Date.now();
  try {
    const query: Record<string, string | number | undefined> = { query: q, location: "IN", language: "en" };
    if (opts.purpose) query.purpose = opts.purpose.slice(0, 300);
    if (opts.include_domains?.length) query.include_domains = opts.include_domains.slice(0, 20).join(",");
    if (opts.recency_minutes) query.recency_minutes = opts.recency_minutes;
    if (opts.domain_type) query.domain_type = opts.domain_type;
    let res = await tf<TfSearchResponse>("search", "/", { query, timeoutMs: 20_000 });
    // domain restriction can be too strict for state-specific portals → widen once
    if (!res.results?.length && opts.include_domains?.length) {
      delete query.include_domains;
      res = await tf<TfSearchResponse>("search", "/", { query, timeoutMs: 20_000 });
    }
    const hits: SearchHit[] = (res.results ?? []).slice(0, 10).map((r) => ({ title: r.title, url: r.url, snippet: r.snippet, site_name: r.site_name, position: r.position, date: r.date }));
    await safe(db.insert("content_cache", { key, kind: "search", query: q, body: { hits }, fetched_at: nowIso(), hits: 0 }, { onConflict: "key" }), []);
    void logRun({ surface: "search", purpose: opts.purpose ?? "search", scheme_id: opts.scheme_id, state_code: opts.state_code, cache: "miss", latency_ms: Date.now() - t0, meta: { q: clip(q, 120), n: hits.length } });
    return { hits, cached: false };
  } catch (e) {
    void logRun({ surface: "search", purpose: opts.purpose ?? "search", scheme_id: opts.scheme_id, status: "error", latency_ms: Date.now() - t0, meta: { q: clip(q, 120), err: (e as Error).message } });
    if (cachedRow) return { hits: (cachedRow.body as { hits: SearchHit[] }).hits ?? [], cached: true, error: (e as Error).message };
    return { hits: [], cached: false, error: (e as Error).message };
  }
}

/* ================================================================== */
/* fetch_clean_markdown — TinyFish Fetch (FREE), batched ≤10, cached   */
/* ================================================================== */
export interface FetchedPage {
  url: string;
  final_url: string | null;
  title: string | null;
  language: string | null;
  text: string;
  links?: string[];
  cached: boolean;
  etag?: string | null;
  last_modified?: string | null;
  latency_ms?: number | null;
  error?: string;
}

const MAX_STORED_CHARS = 40_000;

export async function fetch_clean_markdown(
  urls: string[],
  opts: { purpose?: string; ttlSec?: number; links?: boolean; scheme_id?: string; state_code?: string; force?: boolean; maxChars?: number } = {},
): Promise<FetchedPage[]> {
  const list = [...new Set(urls.filter((u) => /^https?:\/\//.test(u)))].slice(0, 50);
  const ttl = opts.ttlSec ?? cfg.cacheTtlSec();
  const out = new Map<string, FetchedPage>();
  const toFetch: string[] = [];
  const stale = new Map<string, Row>();

  for (const u of list) {
    const key = sha256(`fetch|${u}`);
    const row = opts.force ? null : await safe(db.one<Row>("content_cache", { eq: { key } }), null);
    if (row && Date.now() - new Date(String(row.fetched_at)).getTime() < ttl * 1000) {
      const b = row.body as { text?: string; final_url?: string; links?: string[] };
      out.set(u, { url: u, final_url: b.final_url ?? u, title: (row.title as string) ?? null, language: (row.language as string) ?? null, text: b.text ?? "", links: b.links, cached: true, etag: (row.etag as string) ?? null });
      void safe(db.update("content_cache", { key }, { hits: Number(row.hits ?? 0) + 1 }), []);
    } else {
      if (row) stale.set(u, row);
      toFetch.push(u);
    }
  }
  if (out.size) void logRun({ surface: "fetch", purpose: opts.purpose ?? "fetch", scheme_id: opts.scheme_id, state_code: opts.state_code, cache: "hit", latency_ms: 0, meta: { n: out.size, hosts: [...out.keys()].map(hostOf).slice(0, 10) } });

  for (const batch of chunk(toFetch, 10)) {
    const t0 = Date.now();
    try {
      const body: Record<string, unknown> = { urls: batch, format: "markdown", per_url_timeout_ms: 45_000, include_etag_and_last_modified: true, links: opts.links === true };
      if (opts.purpose) body.purpose = opts.purpose.slice(0, 500);
      const res = await tf<TfFetchResponse & { results: (TfFetchResponse["results"][number] & { links?: string[]; etag?: string; last_modified?: string })[] }>("fetch", "/", { method: "POST", body, timeoutMs: 120_000 });
      for (const r of res.results ?? []) {
        const text = typeof r.text === "string" ? r.text : r.text ? JSON.stringify(r.text) : "";
        const page: FetchedPage = { url: r.url, final_url: r.final_url, title: r.title, language: r.language, text, links: r.links, cached: false, etag: r.etag ?? null, last_modified: r.last_modified ?? null, latency_ms: r.latency_ms ?? null };
        out.set(r.url, page);
        await safe(
          db.insert(
            "content_cache",
            { key: sha256(`fetch|${r.url}`), kind: "fetch", url: r.url, title: r.title, language: r.language, etag: r.etag ?? null, last_modified: r.last_modified ?? null, body: { text: text.slice(0, MAX_STORED_CHARS), final_url: r.final_url, links: (r.links ?? []).slice(0, 200) }, fetched_at: nowIso(), hits: Number(stale.get(r.url)?.hits ?? 0) },
            { onConflict: "key" },
          ),
          [],
        );
      }
      for (const e of res.errors ?? []) {
        const old = stale.get(e.url);
        if (old) {
          const b = old.body as { text?: string; final_url?: string };
          out.set(e.url, { url: e.url, final_url: b.final_url ?? e.url, title: (old.title as string) ?? null, language: null, text: b.text ?? "", cached: true, error: `live fetch failed (${e.error}); served stale cache` });
        } else out.set(e.url, { url: e.url, final_url: null, title: null, language: null, text: "", cached: false, error: e.error });
      }
      void logRun({ surface: "fetch", purpose: opts.purpose ?? "fetch", scheme_id: opts.scheme_id, state_code: opts.state_code, cache: "miss", latency_ms: Date.now() - t0, meta: { n: batch.length, ok: res.results?.length ?? 0, errors: (res.errors ?? []).map((e) => `${hostOf(e.url)}:${e.error}`) } });
    } catch (e) {
      void logRun({ surface: "fetch", purpose: opts.purpose ?? "fetch", scheme_id: opts.scheme_id, status: "error", latency_ms: Date.now() - t0, meta: { n: batch.length, err: (e as Error).message } });
      for (const u of batch) {
        const old = stale.get(u);
        out.set(u, old ? { url: u, final_url: u, title: (old.title as string) ?? null, language: null, text: (old.body as { text?: string }).text ?? "", cached: true, error: `served stale cache: ${(e as Error).message}` } : { url: u, final_url: null, title: null, language: null, text: "", cached: false, error: (e as Error).message });
      }
    }
  }
  const maxChars = opts.maxChars ?? 16_000;
  return list.map((u) => {
    const p = out.get(u) ?? { url: u, final_url: null, title: null, language: null, text: "", cached: false, error: "not fetched" };
    return { ...p, text: p.text.slice(0, maxChars) };
  });
}

/* ================================================================== */
/* run_agent_goal — TinyFish Agent (PAID) via SSE                      */
/* ================================================================== */
export interface AgentEvent {
  type: string;
  run_id?: string;
  streaming_url?: string;
  purpose?: string;
  status?: string;
  result?: unknown;
  error?: string;
  help_message?: string;
  profile_hint?: { message: string; setup_url: string; reason: string };
  tinyfish_api?: string;
  timestamp?: string;
  [k: string]: unknown;
}

export interface AgentGoal {
  url: string;
  goal: string;
  output_schema?: Record<string, unknown>;
  max_steps?: number;
  max_duration_seconds?: number;
  browser_profile?: "lite" | "stealth";
  use_profile?: boolean;
  profile_id?: string;
  webhook_url?: string;
  purpose: string;
  scheme_id?: string;
  state_code?: string;
}

export interface AgentOutcome {
  run_id: string | null;
  status: "COMPLETED" | "FAILED" | "CANCELLED" | "ERROR";
  result: Record<string, unknown> | null;
  steps: number;
  cost_usd: number;
  streaming_url: string | null;
  error?: string;
  profile_hint?: AgentEvent["profile_hint"];
}

export function agentBody(g: AgentGoal) {
  const body: Record<string, unknown> = {
    url: g.url,
    goal: g.goal,
    agent_config: {
      mode: "strict",
      cursor_style: "fish",
      max_steps: Math.min(g.max_steps ?? cfg.maxAgentSteps(), cfg.maxAgentSteps()),
      max_duration_seconds: g.max_duration_seconds ?? (Number(process.env.TINYFISH_MAX_DURATION_SECONDS || 0) || 180),
    },
    capture_config: { screenshots: true },
    browser_profile: g.browser_profile ?? "stealth",
  };
  if (g.output_schema) body.output_schema = g.output_schema;
  if (g.use_profile) body.use_profile = true;
  if (g.profile_id) {
    body.use_profile = true;
    body.profile_id = g.profile_id;
  }
  const base = cfg.publicBaseUrl();
  const hook = g.webhook_url ?? (base.startsWith("https://") ? `${base}/api/webhooks/tinyfish${cfg.webhookSecret() ? `?s=${encodeURIComponent(cfg.webhookSecret())}` : ""}` : undefined);
  if (hook) body.webhook_url = hook;
  return body;
}

/**
 * Runs an Agent goal over /v1/automation/run-sse and yields every event (tee-able to the browser),
 * while logging cost from the real step count. The generator's return value is the outcome.
 */
export async function* run_agent_goal(g: AgentGoal, signal?: AbortSignal): AsyncGenerator<AgentEvent, AgentOutcome> {
  const r = await rates();
  const t0 = Date.now();
  let runId: string | null = null;
  let streaming: string | null = null;
  let steps = 0;
  let logged = false;
  try {
    const res = await tfRaw("agent", "/v1/automation/run-sse", { method: "POST", body: agentBody(g), accept: "text/event-stream", timeoutMs: 45_000, signal });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      throw new TinyFishError(res.status, `HTTP_${res.status}`, clip(txt, 300) || res.statusText);
    }
    for await (const raw of sseEvents(res.body, signal)) {
      const ev = raw as AgentEvent;
      if (ev.type === "STARTED" && ev.run_id) {
        runId = ev.run_id;
        await logRun({ surface: "agent", purpose: g.purpose, scheme_id: g.scheme_id, state_code: g.state_code, run_id: runId, status: "running", cache: "miss", meta: { host: hostOf(g.url), max_steps: g.max_steps } });
        logged = true;
      }
      if (ev.type === "STREAMING_URL" && ev.streaming_url) streaming = ev.streaming_url;
      if (ev.type === "PROGRESS") steps += 1;
      yield ev;
      if (ev.type === "COMPLETE") {
        const finalSteps = await stepsOf(runId, steps);
        const cost = finalSteps * r.step;
        if (runId) await updateRunLog(runId, { status: ev.status === "COMPLETED" ? "ok" : "error", steps: finalSteps, cost_usd: cost, latency_ms: Date.now() - t0, meta: { host: hostOf(g.url), error: ev.error ?? null } });
        return {
          run_id: runId,
          status: (ev.status as AgentOutcome["status"]) ?? "COMPLETED",
          result: (ev.result as Record<string, unknown>) ?? null,
          steps: finalSteps,
          cost_usd: cost,
          streaming_url: streaming,
          error: ev.error ?? ev.help_message,
          profile_hint: ev.profile_hint,
        };
      }
    }
    // stream closed before COMPLETE (serverless timeout / disconnect) → poll the run
    if (runId) {
      const run = await pollRun(runId, 12, 5000, signal);
      const finalSteps = run?.num_of_steps ?? steps;
      const cost = finalSteps * r.step;
      await updateRunLog(runId, { status: run?.status === "COMPLETED" ? "ok" : run ? "error" : "running", steps: finalSteps, cost_usd: cost, latency_ms: Date.now() - t0 });
      return { run_id: runId, status: (run?.status as AgentOutcome["status"]) ?? "ERROR", result: run?.result ?? null, steps: finalSteps, cost_usd: cost, streaming_url: streaming, error: run ? run.error?.message : "stream closed before COMPLETE" };
    }
    return { run_id: null, status: "ERROR", result: null, steps, cost_usd: 0, streaming_url: null, error: "stream closed before STARTED" };
  } catch (e) {
    if (!logged) void logRun({ surface: "agent", purpose: g.purpose, scheme_id: g.scheme_id, state_code: g.state_code, run_id: runId, status: "error", latency_ms: Date.now() - t0, meta: { err: (e as Error).message, host: hostOf(g.url) } });
    return { run_id: runId, status: "ERROR", result: null, steps, cost_usd: steps * r.step, streaming_url: streaming, error: (e as Error).message };
  }
}

async function stepsOf(runId: string | null, fallback: number) {
  if (!runId) return fallback;
  try {
    const run = await tf<TfRun>("agent", `/v1/runs/${runId}`, { query: { screenshots: "none", html: "none" }, timeoutMs: 10_000 });
    return run.num_of_steps ?? fallback;
  } catch {
    return fallback;
  }
}

export async function pollRun(runId: string, tries = 12, everyMs = 5000, signal?: AbortSignal): Promise<TfRun | null> {
  for (let i = 0; i < tries; i++) {
    if (signal?.aborted) return null;
    try {
      const run = await tf<TfRun>("agent", `/v1/runs/${runId}`, { query: { screenshots: "none", html: "none" }, timeoutMs: 10_000 });
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.status)) return run;
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return null;
}

/** Drain an agent generator, forwarding events to `onEvent`; returns the outcome. */
export async function drainAgent(gen: AsyncGenerator<AgentEvent, AgentOutcome>, onEvent?: (e: AgentEvent) => void | Promise<void>): Promise<AgentOutcome> {
  while (true) {
    const n = await gen.next();
    if (n.done) return n.value;
    if (onEvent) await onEvent(n.value);
  }
}

/** Async variant (run-async) — used for OTP-relay flows that outlive one HTTP request. */
export async function start_agent_async(g: AgentGoal): Promise<{ run_id: string | null; error?: string }> {
  const t0 = Date.now();
  try {
    const res = await tf<{ run_id: string | null; error: { code: string; message: string } | null }>("agent", "/v1/automation/run-async", { method: "POST", body: agentBody(g), timeoutMs: 30_000 });
    await logRun({ surface: "agent", purpose: g.purpose, scheme_id: g.scheme_id, state_code: g.state_code, run_id: res.run_id, status: res.run_id ? "running" : "error", cache: "miss", latency_ms: Date.now() - t0, meta: { host: hostOf(g.url), async: true } });
    return { run_id: res.run_id, error: res.error?.message };
  } catch (e) {
    return { run_id: null, error: (e as Error).message };
  }
}

/* ================================================================== */
/* parallel_cross_check — several Agent goals at once (multi-domain)   */
/* ================================================================== */
export async function parallel_cross_check(goals: AgentGoal[], onEvent?: (idx: number, e: AgentEvent) => void | Promise<void>, signal?: AbortSignal): Promise<AgentOutcome[]> {
  const est = goals.reduce((a, g) => a + (g.max_steps ?? 8), 0);
  const guard = await walletGuard(est);
  if (!guard.allowed) return goals.map(() => ({ run_id: null, status: "ERROR" as const, result: null, steps: 0, cost_usd: 0, streaming_url: null, error: `wallet guard: ${guard.reason}` }));
  return Promise.all(goals.slice(0, 5).map((g, i) => drainAgent(run_agent_goal(g, signal), (e) => onEvent?.(i, e))));
}

/* ================================================================== */
/* Monitor helpers                                                     */
/* ================================================================== */
export interface MonitorCreate {
  type: "fetch" | "search";
  name: string;
  config: Record<string, unknown>;
  schedule_cron: string;
  purpose?: string;
  webhook_url?: string;
}
export async function create_monitor(m: MonitorCreate) {
  const t0 = Date.now();
  const res = await tf<{ monitor: { id: string; status: string }; run?: unknown }>("agent", "/v1/monitors", { method: "POST", body: m, timeoutMs: 90_000 });
  const r = await rates();
  void logRun({ surface: "monitor", purpose: "sentinel_create", run_id: res.monitor?.id, cost_usd: r.monitor, latency_ms: Date.now() - t0, meta: { type: m.type, name: m.name } });
  return res;
}
export async function run_monitor_now(id: string) {
  const t0 = Date.now();
  const res = await tf<{ run: Record<string, unknown> }>("agent", `/v1/monitors/${id}/runs`, { method: "POST", timeoutMs: 110_000 });
  const r = await rates();
  void logRun({ surface: "monitor", purpose: "sentinel_run_now", run_id: id, cost_usd: r.monitor, latency_ms: Date.now() - t0 });
  return res;
}
