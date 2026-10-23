"use client";
/**
 * useJourney — the citizen's Sahayak journey as one state machine.
 *
 *   idle → understanding → searching → fetching → (live agents, in parallel) → report → idle
 *
 *  - ask(text)            POST /api/lokmitra/ask (SSE): stage · intent · search · fetch · section · agent_task · structured · report
 *  - Agent = auto / live  every `agent_task` starts a live TinyFish Agent immediately (parallel, no consent modal / gate).
 *                         The Live Agent stage is NEVER skipped: every question gets at least one guaranteed "verify"
 *                         Agent (reads the official page / maps the gated checker live) besides any personal checks.
 *                         If a required identifier is missing the task shows a purely operational input and starts the
 *                         moment it is submitted (submitFields).
 *  - live streaming       POST /api/lokmitra/confirm (SSE): stage · agent(STARTED/STREAMING_URL/PROGRESS) · result →
 *                         steps, live cost (steps × step rate), streaming_url and video_url flow into the UI
 *  - OTP relay            when the agent reports needs_otp → relay panel; after the citizen logs in, otpSaved(relayId)
 *                         re-runs the check with the saved Browser Context Profile
 *  - every step is mirrored to the deck bus ("journey" events) → terminal, porthole and map react live
 *  - nothing is resumed after a reload: every question is a full live execution
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { citizenId, hostOf, ssePost } from "@/lib/client";
import { bus } from "@/lib/bus";
import type { StructuredReport } from "@/lib/lokmitra/report-shape";

export type StageId = "listen" | "understand" | "search" | "fetch" | "agent" | "report";
export const STAGES: StageId[] = ["listen", "understand", "search", "fetch", "agent", "report"];
export type StageState = "todo" | "active" | "done" | "skipped" | "error" | "waiting";

export interface AgentTask {
  confirm_id: string; // task handle (server-side session) — not a consent gate
  report_id: string | null;
  ready: boolean;
  needs_input: boolean; // required identifier missing → purely operational input shown
  started: boolean;
  scheme_id: string;
  scheme_name: string;
  task: "status" | "land" | "verify";
  mode: "page" | "map" | "personal";
  sub_task: string;
  token: string | null; // sealed task session (stateless restore on another serverless instance)
  entry_url: string;
  host: string;
  est_steps: number;
  est_cost_usd: number;
  requires_otp: boolean | null;
  fields: { key: string; label: string; provided: boolean }[];
}

export interface AgentRun {
  confirm_id: string;
  scheme_name: string;
  kind: "verify" | "personal";
  mode: "page" | "map" | "personal";
  host: string;
  running: boolean;
  run_id: string | null;
  streaming_url: string | null;
  steps: number;
  log: string[];
  status: string | null;
  result: Record<string, unknown> | null;
  cost_usd: number;
  step_rate: number;
  video_url: string | null;
  error: string | null;
  needs_otp: boolean;
  needs_captcha: boolean;
  retry_confirm_id: string | null;
  relay_id: string | null;
}

export interface JourneyReport {
  report_id: string;
  summary_local: string;
  summary_en: string;
  language: string;
  structured: StructuredReport | null;
  follow_up?: boolean;
  elapsed_ms?: number;
  live_calls?: { search: number; fetch_urls: number; fetch_ok: number };
}

export interface JourneyState {
  phase: "idle" | "working" | "waiting" | "done" | "error";
  question: string;
  stages: Record<StageId, StageState>;
  messages: string[]; // server stage messages (English, short)
  searches: { scheme: string; results: number; host: string; error?: string | null }[];
  pages: { url: string; host: string; ok: boolean; title: string | null; latency_ms: number | null }[];
  tasks: AgentTask[];
  agents: Record<string, AgentRun>;
  otpFor: string | null; // task id whose OTP relay panel is open
  report: JourneyReport | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

const fresh = (): JourneyState => ({
  phase: "idle",
  question: "",
  stages: Object.fromEntries(STAGES.map((s) => [s, "todo"])) as Record<StageId, StageState>,
  messages: [],
  searches: [],
  pages: [],
  tasks: [],
  agents: {},
  otpFor: null,
  report: null,
  error: null,
  startedAt: null,
  finishedAt: null,
});

export function useJourney(opts: { lang: string; stateCode?: string; district?: string; channel?: "web" | "csc" }) {
  const [s, setS] = useState<JourneyState>(fresh);
  const abortRef = useRef<AbortController | null>(null);
  const agentAbort = useRef<Record<string, AbortController>>({});
  const startRef = useRef<(c: AgentTask, ids: Record<string, string>) => void>(() => {});
  const startTask = (c: AgentTask, ids: Record<string, string>) => startRef.current(c, ids);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const patch = useCallback((f: (x: JourneyState) => JourneyState) => setS(f), []);
  const stage = (x: JourneyState, id: StageId, v: StageState): JourneyState => ({ ...x, stages: { ...x.stages, [id]: v } });
  const finishStagesBefore = (x: JourneyState, id: StageId): JourneyState => {
    const idx = STAGES.indexOf(id);
    const st = { ...x.stages };
    STAGES.slice(0, idx).forEach((k) => {
      // the live Agent stage is owned by settle() (derived from real runs) — it is never auto-finished or skipped here
      if (k === "agent") return;
      if (st[k] === "active" || st[k] === "todo") st[k] = "done";
    });
    return { ...x, stages: st };
  };

  /** Re-derive the overall phase from tasks + agents. */
  const settle = (x: JourneyState): JourneyState => {
    const waitingInput = x.tasks.some((c) => c.needs_input && !c.started);
    const running = Object.values(x.agents).some((a) => a.running);
    const otp = !!x.otpFor;
    const st = { ...x.stages };
    const runs = Object.values(x.agents);
    const anyOk = runs.some((a) => !a.running && a.status === "COMPLETED");
    if (runs.length) st.agent = running ? "active" : otp || waitingInput ? "waiting" : anyOk ? "done" : runs.some((a) => a.error || (a.status && a.status !== "COMPLETED")) ? "error" : "done";
    else if (waitingInput) st.agent = "waiting";
    else if (x.tasks.length) st.agent = "active";
    // no agent task reached the browser → that's a failure, never a silent skip
    else if (x.report || x.error) st.agent = st.agent === "todo" || st.agent === "active" ? "error" : st.agent;
    if (x.report) st.report = "done";
    const phase: JourneyState["phase"] = x.error && !x.report ? "error" : running ? "working" : waitingInput || otp ? "waiting" : x.report ? "done" : x.phase;
    return { ...x, stages: st, phase, finishedAt: phase === "done" ? x.finishedAt ?? Date.now() : x.finishedAt };
  };

  /* ---------------- ask ---------------- */
  const ask = useCallback(
    async (text: string, langOverride?: string) => {
      const q = text.trim();
      if (!q) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setS({ ...stage(stage(fresh(), "listen", "done"), "understand", "active"), phase: "working", question: q, startedAt: Date.now() });
      bus.emit("journey", { type: "stage", stage: "nlu", message: `citizen asked: “${q.slice(0, 80)}${q.length > 80 ? "…" : ""}”` });
      const o = { ...optsRef.current, lang: langOverride || optsRef.current.lang };
      try {
        await ssePost(
          "/api/lokmitra/ask",
          { text: q, user_id: citizenId(), language: o.lang, state_code: o.stateCode || undefined, district: o.district || undefined, channel: o.channel ?? "web" },
          ({ event, data }) => {
            if (event === "stage") {
              const st = String(data.stage ?? "");
              const msg = String(data.message ?? "");
              bus.emit("journey", { type: "stage", stage: st, message: msg });
              patch((x) => {
                let y = { ...x, messages: [...x.messages, msg].slice(-12) };
                if (st === "search") y = stage(finishStagesBefore(y, "search"), "search", "active");
                else if (st === "fetch") y = stage(finishStagesBefore(y, "fetch"), "fetch", "active");
                else if (st === "agent") y = stage(y, "agent", y.stages.agent === "done" ? "done" : "active");
                else if (st === "synthesis" || st === "translate") y = stage(finishStagesBefore(y, "report"), "report", "active");
                return y;
              });
            } else if (event === "search") {
              const host = hostOf(((data.links as string[]) ?? [])[0] ?? ((data.top as string[]) ?? [])[0] ?? "");
              bus.emit("journey", { type: "search", scheme: String(data.scheme ?? ""), results: Number(data.results ?? 0), host, error: (data.error as string) ?? null, state: String(data.state ?? "") });
              patch((x) => ({ ...x, searches: [...x.searches, { scheme: String(data.scheme ?? ""), results: Number(data.results ?? 0), host, error: (data.error as string) ?? null }] }));
            } else if (event === "fetch") {
              const pages = ((data.pages as { url: string; title: string | null; chars: number; latency_ms?: number | null; error: string | null }[]) ?? []).map((p) => ({ url: p.url, host: hostOf(p.url), ok: !p.error && p.chars > 0, title: p.title, latency_ms: p.latency_ms ?? null }));
              bus.emit("journey", { type: "fetch", ok: pages.filter((p) => p.ok).length, total: pages.length, hosts: [...new Set(pages.map((p) => p.host))] });
              patch((x) => stage({ ...x, pages }, "fetch", "done"));
            } else if (event === "agent_task") {
              const fields = (data.fields as AgentTask["fields"]) ?? [];
              const ready = data.ready === true && fields.every((f) => f.provided);
              const c: AgentTask = {
                confirm_id: String(data.confirm_id),
                report_id: data.report_id ? String(data.report_id) : null,
                ready,
                needs_input: !ready,
                started: false,
                scheme_id: String(data.scheme_id),
                scheme_name: String(data.scheme_name),
                task: data.task === "land" ? "land" : data.task === "verify" ? "verify" : "status",
                mode: data.mode === "page" || data.mode === "map" ? (data.mode as "page" | "map") : "personal",
                sub_task: String(data.sub_task ?? data.task ?? "info"),
                token: typeof data.token === "string" ? data.token : null,
                entry_url: String(data.entry_url),
                host: hostOf(String(data.entry_url)),
                est_steps: Number(data.est_steps ?? 0),
                est_cost_usd: Number(data.est_cost_usd ?? 0),
                requires_otp: (data.requires_otp as boolean | null) ?? null,
                fields,
              };
              bus.emit("journey", { type: "task", scheme: c.scheme_name, host: c.host, auto: ready, kind: c.task === "verify" ? "verify" : "personal" });
              patch((x) => settle(stage({ ...x, tasks: [...x.tasks.filter((y) => y.confirm_id !== c.confirm_id), c] }, "agent", ready ? "active" : "waiting")));
              // Agent = auto / live: start immediately, in parallel with the rest of the pipeline
              if (ready) startTask(c, {});
            } else if (event === "report") {
              const r: JourneyReport = {
                report_id: String(data.report_id),
                summary_local: String(data.summary_local ?? ""),
                summary_en: String(data.summary_en ?? ""),
                language: String(data.language ?? o.lang),
                structured: (data.structured as StructuredReport) ?? null,
                follow_up: !!data.follow_up,
                elapsed_ms: Number(data.elapsed_ms ?? 0),
                live_calls: data.live_calls as JourneyReport["live_calls"],
              };
              bus.emit("journey", { type: "report", report_id: r.report_id, sections: r.structured?.sectors.reduce((a, b) => a + b.items.length, 0) ?? 0, elapsed_ms: r.elapsed_ms });
              patch((x) => settle(finishStagesBefore({ ...x, report: r }, "report")));
              window.dispatchEvent(new CustomEvent("lm-report", { detail: r.report_id }));
            } else if (event === "error") {
              patch((x) => ({ ...x, error: String(data.message ?? "error"), phase: x.report ? x.phase : "error" }));
            }
          },
          ctrl.signal,
        );
      } catch (e) {
        if ((e as Error).name !== "AbortError") patch((x) => ({ ...x, error: (e as Error).message, phase: "error" }));
      } finally {
        patch((x) => (x.report ? settle(x) : x.error ? { ...x, phase: "error", stages: Object.fromEntries(STAGES.map((k) => [k, x.stages[k] === "active" ? "error" : x.stages[k]])) as JourneyState["stages"] } : x));
      }
    },
    [patch],
  );

  /* ---------------- live agent (auto-started) ---------------- */
  const runAgent = useCallback(
    async (c: AgentTask, identifiers: Record<string, string>, relayId?: string, overrideConfirmId?: string) => {
      const key = c.confirm_id;
      const ctrl = new AbortController();
      agentAbort.current[key] = ctrl;
      const base: AgentRun = { confirm_id: key, scheme_name: c.scheme_name, kind: c.task === "verify" ? "verify" : "personal", mode: c.mode, host: c.host, running: true, run_id: null, streaming_url: null, steps: 0, step_rate: 0, video_url: null, log: relayId ? ["Re-running with your saved login (Browser Context Profile)…"] : [], status: null, result: null, cost_usd: 0, error: null, needs_otp: false, needs_captcha: false, retry_confirm_id: null, relay_id: relayId ?? null };
      patch((x) => settle(stage({ ...x, tasks: x.tasks.map((y) => (y.confirm_id === key ? { ...y, started: true, needs_input: false } : y)), agents: { ...x.agents, [key]: base }, otpFor: x.otpFor === key ? null : x.otpFor }, "agent", "active")));
      bus.emit("journey", { type: "agent", phase: "start", scheme: c.scheme_name, host: c.host });
      const up = (f: (a: AgentRun) => AgentRun) => patch((x) => (x.agents[key] ? { ...x, agents: { ...x.agents, [key]: f(x.agents[key]) } } : x));
      try {
        await ssePost(
          "/api/lokmitra/confirm",
          { confirm_id: overrideConfirmId ?? key, identifiers, report_id: c.report_id ?? undefined, relay_id: relayId, token: overrideConfirmId ? undefined : c.token ?? undefined },
          ({ event, data }) => {
            if (event === "stage") up((a) => ({ ...a, step_rate: Number(data.step_rate_usd ?? a.step_rate), log: [...a.log, String(data.message)].slice(-30) }));
            else if (event === "agent") {
              const type = String(data.type ?? "");
              if (type === "STARTED") up((a) => ({ ...a, run_id: String(data.run_id ?? "") || a.run_id }));
              if (type === "STREAMING_URL" && data.streaming_url) {
                up((a) => ({ ...a, streaming_url: String(data.streaming_url) }));
                bus.emit("journey", { type: "agent", phase: "stream", scheme: c.scheme_name, streaming_url: String(data.streaming_url), run_id: (data.run_id as string) ?? null });
              }
              if (type === "PROGRESS") {
                const txt = String(data.purpose ?? data.action ?? "step");
                up((a) => ({ ...a, steps: a.steps + 1, cost_usd: (a.steps + 1) * a.step_rate, log: [...a.log, `▶ ${txt}`].slice(-30) }));
                bus.emit("journey", { type: "agent", phase: "step", scheme: c.scheme_name, text: txt });
              }
            } else if (event === "result") {
              const ok = data.status === "COMPLETED" && !data.needs_otp && !data.needs_captcha;
              up((a) => ({
                ...a,
                running: false,
                status: String(data.status ?? ""),
                run_id: (data.run_id as string) ?? a.run_id,
                result: (data.result as Record<string, unknown>) ?? {},
                steps: Number(data.steps ?? a.steps),
                cost_usd: Number(data.cost_usd ?? 0),
                video_url: (data.video_url as string) ?? null,
                error: (data.error as string) ?? null,
                needs_otp: !!data.needs_otp,
                needs_captcha: !!data.needs_captcha,
                retry_confirm_id: (data.retry_confirm_id as string) ?? null,
              }));
              bus.emit("journey", { type: "agent", phase: "done", scheme: c.scheme_name, ok, steps: Number(data.steps ?? 0), cost_usd: Number(data.cost_usd ?? 0), run_id: (data.run_id as string) ?? null, text: data.needs_otp ? "portal asked for OTP" : data.needs_captcha ? "portal showed a CAPTCHA" : undefined });
              if (data.needs_otp || data.needs_captcha) patch((x) => ({ ...x, otpFor: key }));
            } else if (event === "error") {
              const msg = String(data.error ?? data.message ?? "error");
              const missing = Array.isArray(data.missing_fields) && data.missing_fields.length > 0;
              up((a) => ({ ...a, running: false, error: msg }));
              // operational input still missing → hand the task back to its input form (nothing was spent)
              if (missing) patch((x) => settle({ ...x, tasks: x.tasks.map((y) => (y.confirm_id === key ? { ...y, started: false, needs_input: true } : y)) }));
              bus.emit("journey", { type: "agent", phase: "error", scheme: c.scheme_name, text: msg });
            }
          },
          ctrl.signal,
        );
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          up((a) => ({ ...a, error: (e as Error).message }));
          bus.emit("journey", { type: "agent", phase: "error", scheme: c.scheme_name, text: (e as Error).message });
        }
      } finally {
        up((a) => ({ ...a, running: false }));
        patch((x) => settle(x));
        delete agentAbort.current[key];
        window.dispatchEvent(new CustomEvent("lm-report", { detail: c.report_id ?? null }));
      }
    },
    [patch],
  );

  /** Operational input only: the citizen supplies the missing identifier(s) and the live Agent starts at once. */
  const submitFields = useCallback(
    (confirmId: string, identifiers: Record<string, string>) => {
      const c = s.tasks.find((x) => x.confirm_id === confirmId);
      if (!c) return;
      void runAgent(c, identifiers);
    },
    [s.tasks, runAgent],
  );
  startRef.current = (c, ids) => void runAgent(c, ids);

  /* ---------------- OTP relay ---------------- */
  const otpStart = useCallback(
    (confirmId: string) => {
      const c = s.tasks.find((x) => x.confirm_id === confirmId);
      if (c) bus.emit("journey", { type: "otp", phase: "start", scheme: c.scheme_name });
      patch((x) => settle({ ...x, otpFor: confirmId }));
    },
    [s.tasks, patch],
  );

  /** The confirm id the relay should seed from (the agent's retry id if it ran already). */
  const relaySeed = useCallback((confirmId: string) => s.agents[confirmId]?.retry_confirm_id ?? confirmId, [s.agents]);

  const otpSaved = useCallback(
    (confirmId: string, relayId: string, identifiers: Record<string, string>) => {
      const c = s.tasks.find((x) => x.confirm_id === confirmId);
      if (!c) return;
      bus.emit("journey", { type: "otp", phase: "saved", scheme: c.scheme_name });
      const retry = s.agents[confirmId]?.retry_confirm_id ?? confirmId;
      patch((x) => ({ ...x, otpFor: null }));
      void runAgent(c, identifiers, relayId, retry);
    },
    [s.tasks, s.agents, patch, runAgent],
  );

  const otpClose = useCallback(() => {
    patch((x) => {
      const c = x.tasks.find((y) => y.confirm_id === x.otpFor);
      if (c) bus.emit("journey", { type: "otp", phase: "closed", scheme: c.scheme_name });
      return settle({ ...x, otpFor: null });
    });
  }, [patch]);

  /* ---------------- control ---------------- */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    Object.values(agentAbort.current).forEach((a) => a.abort());
    patch((x) => ({ ...x, phase: x.report ? "done" : "idle", error: x.report ? x.error : null }));
  }, [patch]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    Object.values(agentAbort.current).forEach((a) => a.abort());
    setS(fresh());
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const activeStage: StageId | null = (STAGES.find((k) => s.stages[k] === "active" || s.stages[k] === "waiting") ?? null) as StageId | null;
  return { s, activeStage, ask, submitFields, otpStart, otpSaved, otpClose, relaySeed, cancel, reset };
}
