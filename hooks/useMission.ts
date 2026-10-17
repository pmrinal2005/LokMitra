"use client";
import { useCallback, useRef, useState } from "react";
import type { LogLine } from "@/lib/deck-types";
import { bus } from "@/lib/bus";
import { classifyState, hostOf } from "@/lib/classify";

export type MissionMode = "agent" | "search" | "fetch" | "monitor";

export interface MissionState {
  running: boolean;
  runId: string | null;
  streamingUrl: string | null;
  host: string;
  step: number;
  lastResult: unknown;
  status: "idle" | "running" | "COMPLETED" | "FAILED" | "CANCELLED" | "ERROR";
}

const now = () => new Date().toISOString();
let seq = 0;
const mk = (glyph: LogLine["glyph"], tone: LogLine["tone"], text: string, json?: unknown): LogLine => ({
  id: `l${Date.now().toString(36)}-${(seq++).toString(36)}`,
  glyph,
  tone,
  text,
  at: now(),
  json,
});

const MAX_LINES = 400;

/**
 * Drives the live terminal + porthole:
 *  - agent  → POST /api/tinyfish/agent/run-sse  (real SSE: STARTED / STREAMING_URL / PROGRESS / TF_API_RESULT / HEARTBEAT / COMPLETE)
 *  - search → GET  /api/tinyfish/search          (free)
 *  - fetch  → POST /api/tinyfish/fetch           (free)
 *  - monitor→ POST /api/tinyfish/monitors        (Page monitor for URLs, Topic monitor for queries)
 *             POST /api/tinyfish/monitors/:id/runs (run-now)
 */
export function useMission() {
  const [lines, setLines] = useState<LogLine[]>(() => [mk("·", "meta", "// command deck online — awaiting next citizen query...")]);
  const [state, setState] = useState<MissionState>({ running: false, runId: null, streamingUrl: null, host: "", step: 0, lastResult: null, status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);

  const push = useCallback((l: LogLine | LogLine[]) => {
    setLines((prev) => {
      const next = prev.concat(l);
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  }, []);

  const clear = useCallback(() => setLines([mk("·", "meta", "// log cleared — awaiting next citizen query...")]), []);

  /* ---------------- AGENT (paid, SSE) ---------------- */
  const runAgent = useCallback(
    async (url: string, goal: string) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const host = hostOf(url);
      const target = classifyState(`${url} ${goal}`);
      const localFishId = `local-${Date.now()}`;
      let fishId = localFishId;
      let step = 0;
      setState({ running: true, runId: null, streamingUrl: null, host, step: 0, lastResult: null, status: "running" });
      push([mk("◆", "meta", `GOAL » ${goal}`), mk("·", "meta", `target ${host} · dispatching TinyFish agent via /v1/automation/run-sse`)]);
      bus.emit("fish", { type: "swim", id: fishId, target, persistent: true, color: "#2EF2C3" });
      bus.emit("ping", { kind: "start" });

      try {
        const res = await fetch("/api/tinyfish/agent/run-sse", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ url, goal, agent_config: { cursor_style: "fish" } }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => null);
          const msg = j?.error?.message || `HTTP ${res.status}`;
          push(mk("✕", "fail", `agent refused: ${msg}`, j));
          setState((s) => ({ ...s, running: false, status: "ERROR" }));
          bus.emit("fish", { type: "end", id: fishId, ok: false });
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let done = false;
        while (!done) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buf += dec.decode(chunk.value, { stream: true });
          let idx: number;
          while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
            const raw = buf.slice(0, idx);
            buf = buf.slice(idx + (buf[idx] === "\r" ? 4 : 2));
            const data = raw
              .split(/\r?\n/)
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).replace(/^ /, ""))
              .join("\n");
            if (!data) continue;
            let ev: Record<string, unknown>;
            try {
              ev = JSON.parse(data);
            } catch {
              continue;
            }
            const type = String(ev.type ?? "");
            switch (type) {
              case "STARTED": {
                const rid = String(ev.run_id ?? "");
                runIdRef.current = rid;
                // re-key the fish to the real run id so polling doesn't spawn a duplicate
                bus.emit("fish", { type: "end", id: fishId, ok: true });
                fishId = rid || fishId;
                bus.emit("fish", { type: "swim", id: fishId, target, persistent: true, color: "#2EF2C3" });
                setState((s) => ({ ...s, runId: rid }));
                push(mk("▶", "action", `run started · run_id=${rid}`, ev));
                break;
              }
              case "STREAMING_URL": {
                const su = String(ev.streaming_url ?? "");
                setState((s) => ({ ...s, streamingUrl: su }));
                push(mk("·", "meta", `live browser stream attached → porthole`, ev));
                break;
              }
              case "PROGRESS": {
                step += 1;
                setState((s) => ({ ...s, step }));
                const api = ev.tinyfish_api ? ` [${ev.tinyfish_api}]` : "";
                const purpose = String(ev.purpose ?? "browser action");
                const isRetry = /retry|again|fail|error|captcha|blocked/i.test(purpose);
                push(mk(isRetry ? "⚠" : "▶", isRetry ? "retry" : "action", `step ${step}${api} · ${purpose}`, ev));
                bus.emit("fish", { type: "hop", id: fishId });
                break;
              }
              case "TF_API_RESULT": {
                const n = Array.isArray(ev.result) ? ev.result.length : 0;
                push(mk("✓", "free", `${ev.tinyfish_api} returned ${n} item(s) · free`, ev));
                bus.emit("spark", { count: 1 });
                break;
              }
              case "HEARTBEAT":
                break;
              case "COMPLETE": {
                done = true;
                const status = String(ev.status ?? "COMPLETED") as MissionState["status"];
                const okRun = status === "COMPLETED";
                const resultText = ev.result ? JSON.stringify(ev.result) : "";
                const suspicious = /captcha|access denied|blocked|forbidden/i.test(resultText);
                if (okRun && !suspicious) push(mk("✓", "success", `COMPLETE · ${step} steps · result ready (click to inspect)`, ev.result ?? ev));
                else if (okRun && suspicious) push(mk("⚠", "retry", `COMPLETE but result mentions a block/captcha — verify output`, ev.result ?? ev));
                else push(mk("✕", "fail", `${status} · ${ev.error ?? ev.help_message ?? "run did not complete"}`, ev));
                setState((s) => ({ ...s, running: false, status, lastResult: ev.result ?? null }));
                bus.emit("fish", { type: "end", id: fishId, ok: okRun });
                bus.emit("bloop", { ok: okRun });
                break;
              }
              default:
                push(mk("·", "meta", `${type || "event"}`, ev));
            }
          }
        }
        if (!done) {
          push(mk("⚠", "retry", "stream closed before COMPLETE — the run continues server-side; it will reconcile from /v1/runs"));
          setState((s) => ({ ...s, running: false, status: "idle" }));
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          push(mk("·", "meta", "stream detached by operator"));
        } else {
          push(mk("✕", "fail", `stream error: ${(e as Error).message}`));
          bus.emit("fish", { type: "end", id: fishId, ok: false });
        }
        setState((s) => ({ ...s, running: false, status: s.status === "running" ? "ERROR" : s.status }));
      } finally {
        abortRef.current = null;
      }
    },
    [push],
  );

  const cancel = useCallback(async () => {
    const rid = runIdRef.current;
    if (rid) {
      push(mk("·", "meta", `cancelling run ${rid} via /v1/runs/{id}/cancel …`));
      try {
        const r = await fetch(`/api/tinyfish/runs/${rid}/cancel`, { method: "POST" });
        const j = await r.json();
        push(mk(r.ok ? "✓" : "✕", r.ok ? "success" : "fail", r.ok ? `run ${j.status?.toLowerCase?.() ?? "cancelled"}` : `cancel failed: ${j?.error?.message}`, j));
      } catch (e) {
        push(mk("✕", "fail", `cancel failed: ${(e as Error).message}`));
      }
    }
    abortRef.current?.abort();
    setState((s) => ({ ...s, running: false, status: "CANCELLED" }));
  }, [push]);

  /* ---------------- SEARCH (free) ---------------- */
  const runSearch = useCallback(
    async (query: string) => {
      setState((s) => ({ ...s, running: true, status: "running" }));
      const id = `search-${Date.now()}`;
      bus.emit("fish", { type: "swim", id, target: classifyState(query), color: "#4FD9FF" });
      push(mk("▶", "action", `search » “${query}” (location=IN) · free`));
      try {
        const qs = new URLSearchParams({ query, location: "IN", language: "en", purpose: "LokMitra citizen query: find official Indian government information" });
        const r = await fetch(`/api/tinyfish/search?${qs}`);
        const j = await r.json();
        if (!r.ok) throw Object.assign(new Error(j?.error?.message || `HTTP ${r.status}`), { j });
        const items = (j.results ?? []) as { title: string; url: string; site_name: string }[];
        push(mk("✓", "free", `${items.length} results · ${j.total_results ?? items.length} indexed · served FREE`, j));
        items.slice(0, 5).forEach((it, i) => push(mk("·", "meta", `  ${i + 1}. ${it.title} — ${hostOf(it.url)}`, it)));
        bus.emit("spark", { count: 1 });
        bus.emit("bloop", { ok: true });
        setState((s) => ({ ...s, running: false, status: "COMPLETED", lastResult: j }));
      } catch (e) {
        push(mk("✕", "fail", `search failed: ${(e as Error).message}`, (e as { j?: unknown }).j));
        setState((s) => ({ ...s, running: false, status: "ERROR" }));
      }
    },
    [push],
  );

  /* ---------------- FETCH (free) ---------------- */
  const runFetch = useCallback(
    async (url: string) => {
      setState((s) => ({ ...s, running: true, status: "running", host: hostOf(url) }));
      const id = `fetch-${Date.now()}`;
      bus.emit("fish", { type: "swim", id, target: classifyState(url), color: "#4FD9FF" });
      push(mk("▶", "action", `fetch » ${url} (markdown) · free`));
      try {
        const r = await fetch(`/api/tinyfish/fetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: [url], format: "markdown", page_metadata: true }),
        });
        const j = await r.json();
        if (!r.ok) throw Object.assign(new Error(j?.error?.message || `HTTP ${r.status}`), { j });
        const res0 = j.results?.[0];
        if (res0) {
          const text = typeof res0.text === "string" ? res0.text : JSON.stringify(res0.text ?? "");
          push(mk("✓", "free", `“${res0.title ?? hostOf(url)}” · ${text.length.toLocaleString()} chars${res0.language ? ` · lang=${res0.language}` : ""}${res0.latency_ms ? ` · ${Math.round(res0.latency_ms)}ms` : ""} · FREE`, { ...res0, text: text.slice(0, 1800) + (text.length > 1800 ? "…" : "") }));
          bus.emit("spark", { count: 1 });
          bus.emit("bloop", { ok: true });
        }
        for (const er of j.errors ?? []) push(mk("✕", "fail", `fetch error ${er.status ?? ""} ${er.url}: ${er.error}`, er));
        setState((s) => ({ ...s, running: false, status: res0 ? "COMPLETED" : "FAILED", lastResult: j }));
      } catch (e) {
        push(mk("✕", "fail", `fetch failed: ${(e as Error).message}`, (e as { j?: unknown }).j));
        setState((s) => ({ ...s, running: false, status: "ERROR" }));
      }
    },
    [push],
  );

  /* ---------------- MONITOR (scheduled watch) ---------------- */
  const runMonitor = useCallback(
    async (target: string, cron: string) => {
      const isUrl = /^https?:\/\//i.test(target);
      setState((s) => ({ ...s, running: true, status: "running", host: isUrl ? hostOf(target) : s.host }));
      const id = `monitor-${Date.now()}`;
      bus.emit("fish", { type: "swim", id, target: classifyState(target), color: "#FFB44F" });
      const body = isUrl
        ? { type: "fetch", config: { url: target, format: "markdown" }, schedule_cron: cron, name: `LokMitra · ${hostOf(target)}`.slice(0, 100), purpose: "Alert when scheme rules, deadlines, eligibility or prices change for Indian citizens" }
        : { type: "search", config: { query: target, result_limit: 10 }, schedule_cron: cron, name: `LokMitra · ${target}`.slice(0, 100), purpose: "Alert when new official government notices appear for this citizen topic" };
      push(mk("▶", "action", `monitor » ${isUrl ? "page" : "topic"} watch on ${isUrl ? hostOf(target) : `“${target}”`} · cron “${cron}” (UTC)`));
      try {
        const r = await fetch("/api/tinyfish/monitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json();
        if (!r.ok) throw Object.assign(new Error(j?.error?.message || `HTTP ${r.status}`), { j });
        const mon = (j.monitor ?? j) as { id?: string; status?: string };
        push(mk("✓", "success", `monitor created · id=${mon.id ?? "?"} · status=${mon.status ?? "active"} · baseline captured`, j));
        bus.emit("bloop", { ok: true });
        setState((s) => ({ ...s, running: false, status: "COMPLETED", lastResult: j }));
      } catch (e) {
        push(mk("✕", "fail", `monitor failed: ${(e as Error).message}`, (e as { j?: unknown }).j));
        setState((s) => ({ ...s, running: false, status: "ERROR" }));
      }
    },
    [push],
  );

  const runMonitorNow = useCallback(
    async (monitorId: string) => {
      setState((s) => ({ ...s, running: true, status: "running" }));
      push(mk("▶", "action", `monitor » run-now ${monitorId} via /v1/monitors/{id}/runs`));
      try {
        let r = await fetch(`/api/tinyfish/monitors/${encodeURIComponent(monitorId)}/runs`, { method: "POST" });
        let j = await r.json();
        if (r.status === 409 && j?.error?.code === "RETRY_REQUIRED") {
          push(mk("⚠", "retry", "RETRY_REQUIRED — retrying once"));
          r = await fetch(`/api/tinyfish/monitors/${encodeURIComponent(monitorId)}/runs`, { method: "POST" });
          j = await r.json();
        }
        if (!r.ok) throw Object.assign(new Error(j?.error?.message || `HTTP ${r.status}`), { j });
        push(mk("✓", "success", `monitor run complete · inspect diff/result`, j));
        bus.emit("bloop", { ok: true });
        setState((s) => ({ ...s, running: false, status: "COMPLETED", lastResult: j }));
      } catch (e) {
        push(mk("✕", "fail", `monitor run failed: ${(e as Error).message}`, (e as { j?: unknown }).j));
        setState((s) => ({ ...s, running: false, status: "ERROR" }));
      }
    },
    [push],
  );

  /** Show a historical run's real step log from GET /v1/runs/{id}. */
  const inspectRun = useCallback(
    async (runId: string) => {
      push(mk("·", "meta", `loading run ${runId} from /v1/runs/{id} …`));
      try {
        const r = await fetch(`/api/tinyfish/runs/${runId}?screenshots=url`);
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
        push(mk("◆", "meta", `GOAL » ${j.goal}`, { run_id: j.run_id, status: j.status, created_at: j.created_at }));
        (j.steps ?? []).forEach((s: { action: string | null; status: string; duration: string | null }, i: number) =>
          push(mk(s.status === "FAILED" ? "⚠" : "▶", s.status === "FAILED" ? "retry" : "action", `step ${i + 1} · ${s.action ?? "browser action"}${s.duration ? ` (${s.duration})` : ""}`, s)),
        );
        if (j.status === "COMPLETED") push(mk("✓", "success", `COMPLETED · ${j.num_of_steps ?? j.steps?.length ?? 0} steps`, j.result));
        else if (j.status === "FAILED") push(mk("✕", "fail", `FAILED · ${j.error?.message ?? ""}`, j.error));
        else push(mk("·", "meta", `status ${j.status}`, j));
        // Upstream screenshot URLs need a dashboard session, so we route them through our API-key proxy.
        const lastShotStep = [...(j.steps ?? [])].reverse().find((s: { screenshot: string | null }) => s.screenshot) as { id: string } | undefined;
        const lastShot = lastShotStep ? { screenshot: `/api/tinyfish/runs/${encodeURIComponent(j.run_id)}/steps/${encodeURIComponent(lastShotStep.id)}/screenshot` } : undefined;
        setState((s) => ({
          ...s,
          runId: j.run_id,
          streamingUrl: j.status === "RUNNING" ? j.streaming_url ?? null : null,
          host: s.host,
          step: j.num_of_steps ?? j.steps?.length ?? 0,
          lastResult: { ...j, _lastScreenshot: lastShot?.screenshot ?? null },
        }));
      } catch (e) {
        push(mk("✕", "fail", `could not load run: ${(e as Error).message}`));
      }
    },
    [push],
  );

  return { lines, state, runAgent, runSearch, runFetch, runMonitor, runMonitorNow, cancel, clear, inspectRun };
}
