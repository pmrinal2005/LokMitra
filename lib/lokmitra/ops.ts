import "server-only";
import { tf, tfRaw, TinyFishError, type TfFetchResponse, type TfRun, type TfSearchResponse, type TfWallet } from "../tinyfish";
import { cfg } from "./config";
import { db, safe, type Row } from "./db";
import { logRun, updateRunLog } from "./store";
import { chunk, clip, hostOf, sseEvents } from "./util";

/* ================================================================== */
/* Wallet — purely informational (no budget cap, no spend ceiling)     */
/* ================================================================== */
export interface Rates {
  step: number;
  browserPerMin: number;
  monitor: number;
  source: "wallet" | "fallback";
}

/**
 * Live wallet read. There is deliberately NO memoisation: every call asks TinyFish
 * for the real current balance + rates. The wallet is shown for transparency only —
 * it never throttles, defers or alters what LokMitra does.
 */
export async function getWallet(): Promise<{ wallet: TfWallet | null; error?: string }> {
  try {
    const w = await tf<TfWallet>("agent", "/v1/wallet", { timeoutMs: 12_000 });
    return { wallet: w };
  } catch (e) {
    return { wallet: null, error: (e as Error).message };
  }
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

/** Informational only: what LokMitra has spent according to its own audit log. Never used as a limit. */
export async function lokmitraSpend(): Promise<number> {
  const rows = await safe(db.select<Row>("runs_log", { select: "cost_usd", limit: 5000, order: { col: "created_at" } }), []);
  return rows.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
}

/* ================================================================== */
/* search_schemes — TinyFish Search, LIVE on every call (no cache)     */
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
  opts: { include_domains?: string[]; purpose?: string; scheme_id?: string; state_code?: string; recency_minutes?: number; domain_type?: "web" | "news" } = {},
): Promise<{ hits: SearchHit[]; error?: string; latency_ms: number }> {
  const q = query.trim().slice(0, 400);
  const t0 = Date.now();
  try {
    const params: Record<string, string | number | undefined> = { query: q, location: "IN", language: "en" };
    if (opts.purpose) params.purpose = opts.purpose.slice(0, 300);
    if (opts.include_domains?.length) params.include_domains = opts.include_domains.slice(0, 20).join(",");
    if (opts.recency_minutes) params.recency_minutes = opts.recency_minutes;
    if (opts.domain_type) params.domain_type = opts.domain_type;
    let res = await tf<TfSearchResponse>("search", "/", { query: params, timeoutMs: 20_000 });
    // domain restriction can be too strict for state-specific portals → widen once
    if (!res.results?.length && opts.include_domains?.length) {
      delete params.include_domains;
      res = await tf<TfSearchResponse>("search", "/", { query: params, timeoutMs: 20_000 });
    }
    const hits: SearchHit[] = (res.results ?? []).slice(0, 10).map((r) => ({ title: r.title, url: r.url, snippet: r.snippet, site_name: r.site_name, position: r.position, date: r.date }));
    void logRun({ surface: "search", purpose: opts.purpose ?? "search", scheme_id: opts.scheme_id, state_code: opts.state_code, latency_ms: Date.now() - t0, meta: { q: clip(q, 120), n: hits.length } });
    return { hits, latency_ms: Date.now() - t0 };
  } catch (e) {
    void logRun({ surface: "search", purpose: opts.purpose ?? "search", scheme_id: opts.scheme_id, state_code: opts.state_code, status: "error", latency_ms: Date.now() - t0, meta: { q: clip(q, 120), err: (e as Error).message } });
    return { hits: [], error: (e as Error).message, latency_ms: Date.now() - t0 };
  }
}

/* ================================================================== */
/* fetch_clean_markdown — TinyFish Fetch, LIVE, batched ≤10 per request */
/* ================================================================== */
export interface FetchedPage {
  url: string;
  final_url: string | null;
  title: string | null;
  language: string | null;
  text: string;
  links?: string[];
  etag?: string | null;
  last_modified?: string | null;
  latency_ms?: number | null;
  error?: string;
}

/**
 * Every URL is fetched live from the real portal on every call. Nothing is stored or
 * reused: no content cache, no stale fallback, no negative cache of dead links.
 * Batches of up to 10 URLs per request (TinyFish Fetch limit) run in parallel.
 */
export async function fetch_clean_markdown(
  urls: string[],
  opts: { purpose?: string; links?: boolean; scheme_id?: string; state_code?: string; maxChars?: number; perUrlTimeoutMs?: number } = {},
): Promise<FetchedPage[]> {
  const list = [...new Set(urls.filter((u) => /^https?:\/\//.test(u)))].slice(0, 50);
  const out = new Map<string, FetchedPage>();
  await Promise.all(
    chunk(list, 10).map(async (batch) => {
      const t0 = Date.now();
      try {
        const body: Record<string, unknown> = { urls: batch, format: "markdown", per_url_timeout_ms: opts.perUrlTimeoutMs ?? 30_000, include_etag_and_last_modified: true, links: opts.links === true };
        if (opts.purpose) body.purpose = opts.purpose.slice(0, 500);
        const res = await tf<TfFetchResponse & { results: (TfFetchResponse["results"][number] & { links?: string[]; etag?: string; last_modified?: string })[] }>("fetch", "/", { method: "POST", body, timeoutMs: 120_000 });
        for (const r of res.results ?? []) {
          const text = typeof r.text === "string" ? r.text : r.text ? JSON.stringify(r.text) : "";
          out.set(r.url, { url: r.url, final_url: r.final_url, title: r.title, language: r.language, text, links: r.links, etag: r.etag ?? null, last_modified: r.last_modified ?? null, latency_ms: r.latency_ms ?? null });
        }
        for (const e of res.errors ?? []) out.set(e.url, { url: e.url, final_url: null, title: null, language: null, text: "", error: e.error });
        void logRun({ surface: "fetch", purpose: opts.purpose ?? "fetch", scheme_id: opts.scheme_id, state_code: opts.state_code, latency_ms: Date.now() - t0, meta: { n: batch.length, ok: res.results?.length ?? 0, errors: (res.errors ?? []).map((e) => `${hostOf(e.url)}:${e.error}`) } });
      } catch (e) {
        void logRun({ surface: "fetch", purpose: opts.purpose ?? "fetch", scheme_id: opts.scheme_id, state_code: opts.state_code, status: "error", latency_ms: Date.now() - t0, meta: { n: batch.length, err: (e as Error).message } });
        for (const u of batch) out.set(u, { url: u, final_url: null, title: null, language: null, text: "", error: (e as Error).message });
      }
    }),
  );
  const maxChars = opts.maxChars ?? 16_000;
  return list.map((u) => {
    const p = out.get(u) ?? { url: u, final_url: null, title: null, language: null, text: "", error: "not fetched" };
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
      // "strict" needs the TinyFish beta flag on the account; default mode works everywhere.
      ...(cfg.agentMode() === "strict" ? { mode: "strict" } : {}),
      cursor_style: "fish",
      // No budget cap: max_steps is never forced. Only an explicit per-goal max_steps is passed (beta-gated field).
      ...(cfg.sendMaxSteps() && g.max_steps ? { max_steps: g.max_steps } : {}),
      // functional wall-clock limit so a run fits inside one serverless request (not a cost cap)
      ...(g.max_duration_seconds || cfg.agentMaxDurationSec() ? { max_duration_seconds: g.max_duration_seconds ?? cfg.agentMaxDurationSec() } : {}),
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
        await logRun({ surface: "agent", purpose: g.purpose, scheme_id: g.scheme_id, state_code: g.state_code, run_id: runId, status: "running", meta: { host: hostOf(g.url), max_steps: g.max_steps } });
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
    await logRun({ surface: "agent", purpose: g.purpose, scheme_id: g.scheme_id, state_code: g.state_code, run_id: res.run_id, status: res.run_id ? "running" : "error", latency_ms: Date.now() - t0, meta: { host: hostOf(g.url), async: true } });
    return { run_id: res.run_id, error: res.error?.message };
  } catch (e) {
    return { run_id: null, error: (e as Error).message };
  }
}

/* ================================================================== */
/* parallel_cross_check — several Agent goals at once (multi-domain)   */
/* ================================================================== */
export async function parallel_cross_check(goals: AgentGoal[], onEvent?: (idx: number, e: AgentEvent) => void | Promise<void>, signal?: AbortSignal): Promise<AgentOutcome[]> {
  return Promise.all(goals.map((g, i) => drainAgent(run_agent_goal(g, signal), (e) => onEvent?.(i, e))));
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
