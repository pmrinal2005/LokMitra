import "server-only";
import { tf, type TfRun } from "../tinyfish";
import { cfg } from "./config";
import { db, safe, type Row } from "./db";
import { drainAgent, rates, run_agent_goal, type AgentEvent, type AgentGoal, type AgentOutcome } from "./ops";
import { resolvePortalLive } from "./portal";
import { relayGet, type RelayData } from "./relay";
import { DISCOVERY_SCHEMA, LAND_SCHEMA, schemeById, stateByCode, STATUS_SCHEMA, type TaskKind } from "./schemes";
import { logRun, sessions } from "./store";
import { clip, hostOf, nowIso, unseal } from "./util";

export interface DiscoveryResult {
  status_page_url?: string | null;
  input_fields?: { label: string; kind: string }[];
  navigation_steps?: string[];
  requires_otp?: boolean;
  requires_captcha?: boolean;
  public_info_urls?: string[];
  notes?: string | null;
}

/**
 * Phase 3 — LIVE Agent workflows (no caching, no budget cap).
 *  - discover(): a live Agent run that maps a gated portal's status checker RIGHT NOW
 *    (input fields, OTP/CAPTCHA, navigation). The result is returned to the caller and
 *    NOT stored — the next request maps the portal again, live.
 *  - runConfirmed(): citizen-consented status / land check (structured output_schema),
 *    optionally using the citizen's own OTP-relay Browser Context Profile (use_profile +
 *    profile_id) so the single-use OTP login can be completed inside the same session.
 * Both are async generators so routes can tee the live TinyFish SSE events to the browser.
 */

export type FlowEvent = AgentEvent | { type: "LM_STAGE"; message: string; [k: string]: unknown } | { type: "LM_RESULT"; [k: string]: unknown } | { type: "LM_ERROR"; error: string; [k: string]: unknown };

const NO_SUBMIT = "Never submit any application, grievance, payment or other irreversible action. Do not change any account settings.";

function statusGoal(schemeName: string, entry: string, ids: Record<string, string>, hints: string, usingProfile: boolean) {
  const idText = Object.entries(ids)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k.replace(/_/g, " ")} = ${v}`)
    .join("; ");
  return [
    `You are checking a citizen's ${schemeName} beneficiary status on the official portal ${hostOf(entry)}.`,
    usingProfile ? "The browser already holds the citizen's logged-in session — do not log in again unless the page asks." : "",
    `1. Open the beneficiary / application status page (start: ${entry}).`,
    idText ? `2. Enter: ${idText}.` : "2. Locate the identifier input fields.",
    "3. If a CAPTCHA is shown, solve it if it is a simple text/math CAPTCHA; otherwise stop and set blocked_by=\"captcha\".",
    "4. If an OTP is required and no logged-in session exists, stop immediately and set blocked_by=\"otp\" (do NOT guess).",
    "5. Extract the full status: registration active/inactive, eKYC, land seeding, Aadhaar–bank linkage, every installment with date, amount, UTR and status, and any pending actions shown.",
    hints,
    NO_SUBMIT,
    "Return JSON matching the output schema. Use null when a field is not shown. Put the exact on-screen message in raw_message.",
  ]
    .filter(Boolean)
    .join("\n");
}

function landGoal(stateName: string, entry: string, ids: Record<string, string>, hints: string) {
  return [
    `Look up a land record (record of rights) on the official ${stateName} land-records portal ${hostOf(entry)}.`,
    `1. Open ${entry} and choose the record-of-rights / Khatauni / 7-12 / Jamabandi search.`,
    `2. Walk the cascading dropdowns: District = ${ids.district ?? "?"} → Tehsil/Taluka = ${ids.tehsil ?? "?"} → Village = ${ids.village ?? "?"}. Wait for each dropdown to load before selecting the next.`,
    `3. Search by Khasra / Survey / Gat number = ${ids.khasra_no ?? "?"}.`,
    "4. If a CAPTCHA blocks the search and cannot be solved, stop with blocked_by=\"captcha\".",
    "5. Extract owner names, khasra/survey number, area, land type and any encumbrance/remarks. Record the cascade you used in cascade_path.",
    hints,
    NO_SUBMIT,
    "Return JSON matching the output schema; null for missing fields.",
  ]
    .filter(Boolean)
    .join("\n");
}

function discoveryGoal(schemeName: string, entry: string, task: TaskKind) {
  return [
    `Map the official ${schemeName} portal at ${entry} as it is live right now, so the citizen knows exactly what the status check needs.`,
    task === "land" ? "Find the record-of-rights search and list the cascading dropdowns in order." : "Find the beneficiary / application STATUS checker page.",
    "Do NOT enter any personal data and do NOT submit any form. Only navigate and observe.",
    "Report: status_page_url, every input field (label + kind: text/select/captcha/otp/button/radio), the shortest navigation_steps from the home page, whether an OTP and/or CAPTCHA is required, and up to 8 public information URLs (eligibility, FAQs, guidelines, notices).",
    "Stop as soon as you have this information. Return JSON matching the output schema.",
  ].join("\n");
}

async function runSteps(runId: string | null): Promise<string[]> {
  if (!runId) return [];
  try {
    const run = await tf<TfRun>("agent", `/v1/runs/${runId}`, { query: { screenshots: "none", html: "none" }, timeoutMs: 15_000 });
    return (run.steps ?? []).map((s) => s.action ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

/* ================================================================== */
/* One-time discovery                                                  */
/* ================================================================== */
export async function* discover(opts: { scheme_id: string; state_code: string; task: TaskKind }, signal?: AbortSignal): AsyncGenerator<FlowEvent, AgentOutcome | null> {
  const scheme = schemeById(opts.scheme_id);
  if (!scheme) {
    yield { type: "LM_ERROR", error: "unknown scheme" };
    return null;
  }
  const task: TaskKind = opts.task === "land" ? "land" : "status";
  const state = opts.state_code || "IN";
  yield { type: "LM_STAGE", message: `Live TinyFish Search: locating the current official ${scheme.name} ${task} portal…` };
  const live = await resolvePortalLive(scheme.id, task, { state });
  const entry = live.portal.entry_url;
  yield { type: "LM_STAGE", message: `Live Search → ${live.searched.length} result(s); starting Agent on ${hostOf(entry)}`, search_results: live.searched.slice(0, 5), entry_url: entry };
  const goal: AgentGoal = { url: entry, goal: discoveryGoal(scheme.name, entry, task), output_schema: DISCOVERY_SCHEMA as unknown as Record<string, unknown>, purpose: "discovery", scheme_id: scheme.id, state_code: state, browser_profile: "stealth" };
  const gen = run_agent_goal(goal, signal);
  let out: AgentOutcome;
  while (true) {
    const n = await gen.next();
    if (n.done) {
      out = n.value;
      break;
    }
    yield n.value;
  }
  if (out.status === "COMPLETED" && out.result) {
    const res = (out.result as Record<string, unknown>) ?? {};
    const d = (res.result && typeof res.result === "object" ? res.result : res) as DiscoveryResult;
    const steps = await runSteps(out.run_id);
    yield { type: "LM_RESULT", live: true, cost_usd: out.cost_usd, steps: out.steps, run_id: out.run_id, entry_url: entry, discovery: d, agent_actions: steps.slice(0, 20), message: `Mapped live in ${out.steps} step(s) ($${out.cost_usd.toFixed(3)}). Not stored — the next request maps the portal again, live.` };
  } else {
    yield { type: "LM_ERROR", error: out.error ?? `agent ${out.status}`, run_id: out.run_id, profile_hint: out.profile_hint ?? null };
  }
  return out;
}

/* ================================================================== */
/* Citizen-confirmed status / land check                               */
/* ================================================================== */
interface ConfirmData extends Record<string, unknown> {
  scheme_id: string;
  task: "status" | "land";
  state_code: string;
  entry_url: string;
  est_steps: number;
  sealed: string;
  language?: string;
  report_id?: string;
  used?: boolean;
}

export async function* runConfirmed(
  opts: { confirm_id: string; identifiers?: Record<string, string>; relay_id?: string | null; report_id?: string | null },
  signal?: AbortSignal,
): AsyncGenerator<FlowEvent, AgentOutcome | null> {
  const c = await sessions.get<ConfirmData>(opts.confirm_id);
  if (!c || c.kind !== "confirm") {
    yield { type: "LM_ERROR", error: "This confirmation has expired. Please ask again." };
    return null;
  }
  if (c.data.used) {
    yield { type: "LM_ERROR", error: "This confirmation was already used." };
    return null;
  }
  const scheme = schemeById(c.data.scheme_id)!;
  const ids: Record<string, string> = { ...(unseal<Record<string, string>>(c.data.sealed) ?? {}), ...Object.fromEntries(Object.entries(opts.identifiers ?? {}).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k, String(v).trim().slice(0, 80)])) };
  const task = c.data.task;
  const hints = "";

  let profile_id: string | undefined;
  if (opts.relay_id) {
    try {
      const r = await relayGet(opts.relay_id);
      const d = r.session.data as RelayData;
      if (d.saved && d.scheme_id === scheme.id) {
        profile_id = d.profile_id;
        yield { type: "LM_STAGE", message: `Reusing your logged-in Browser Context Profile (${d.cookie_count ?? 0} cookies) — no second paid login.`, profile_id };
      }
    } catch {
      yield { type: "LM_STAGE", message: "OTP relay session expired — running without saved login." };
    }
  }

  await sessions.patch<ConfirmData>(opts.confirm_id, { used: true });
  const r = await rates();
  yield { type: "LM_STAGE", message: `Live run (no step limit) · typical ${c.data.est_steps} steps ≈ $${(c.data.est_steps * r.step).toFixed(3)} — shown for transparency only` };

  // portal located LIVE right now (never a stored path)
  let entry = c.data.entry_url;
  if (!opts.relay_id) {
    yield { type: "LM_STAGE", message: `Live TinyFish Search: locating the current ${scheme.name} ${task} page…` };
    const live = await resolvePortalLive(scheme.id, task, { state: c.data.state_code });
    entry = live.portal.entry_url || entry;
  }
  const goalText = task === "land" ? landGoal(stateByCode(c.data.state_code).name, entry, ids, hints) : statusGoal(scheme.name, entry, ids, hints, !!profile_id);
  const goal: AgentGoal = {
    url: entry,
    goal: goalText,
    output_schema: (task === "land" ? LAND_SCHEMA : STATUS_SCHEMA) as unknown as Record<string, unknown>,
    purpose: task,
    scheme_id: scheme.id,
    state_code: c.data.state_code,
    browser_profile: "stealth",
    profile_id,
  };
  yield { type: "LM_STAGE", message: `TinyFish agent is navigating ${hostOf(entry)} now…`, host: hostOf(entry) };
  const gen = run_agent_goal(goal, signal);
  let out: AgentOutcome;
  while (true) {
    const n = await gen.next();
    if (n.done) {
      out = n.value;
      break;
    }
    yield n.value;
  }

  const result = (out.result && typeof out.result === "object" ? ((out.result as Row).result as Row) ?? out.result : null) as Record<string, unknown> | null;
  const blocked = (result?.blocked_by as string) ?? null;
  const reportId = opts.report_id || c.data.report_id;
  if (reportId) {
    const rep = await safe(db.one<Row>("benefit_reports", { eq: { id: reportId } }), null);
    if (rep) {
      const ar = Array.isArray(rep.agent_results) ? (rep.agent_results as unknown[]) : [];
      await safe(db.update("benefit_reports", { id: reportId }, { agent_results: [...ar, { scheme_id: scheme.id, task, run_id: out.run_id, status: out.status, result, cost_usd: out.cost_usd, at: nowIso() }], cost_usd: Number(rep.cost_usd ?? 0) + out.cost_usd, updated_at: nowIso() }), []);
    }
  }

  const needsOtp = blocked === "otp" && !profile_id;
  // OTP-gated: issue a fresh confirmation so the citizen can relay the OTP and re-run with the saved profile
  let retry_confirm_id: string | null = null;
  if (needsOtp || blocked === "captcha") {
    const again = await sessions.put("confirm", { ...c.data, entry_url: entry, used: false, sealed: c.data.sealed }, cfg.confirmTtlSec(), { user_id: c.user_id });
    retry_confirm_id = again.id;
  }
  yield {
    retry_confirm_id,
    type: "LM_RESULT",
    scheme_id: scheme.id,
    scheme_name: scheme.name,
    task,
    run_id: out.run_id,
    status: out.status,
    result,
    cost_usd: out.cost_usd,
    steps: out.steps,
    streaming_url: out.streaming_url,
    needs_otp: needsOtp,
    needs_captcha: blocked === "captcha",
    profile_hint: out.profile_hint ?? null,
    error: out.error ?? null,
    diy: scheme.diy,
    sources: [entry],
  };
  void logRun({ surface: "agent", purpose: `${task}_result`, scheme_id: scheme.id, state_code: c.data.state_code, run_id: out.run_id, cost_usd: 0, meta: { blocked, profile: !!profile_id, summary: clip(JSON.stringify(result ?? {}), 200) } });
  return out;
}

/** Run several confirmed checks at once (PM-KISAN + Ayushman + NSP…) — multi-domain cross-verification. */
export async function crossCheck(
  confirmIds: string[],
  onEvent: (idx: number, e: FlowEvent) => void | Promise<void>,
  signal?: AbortSignal,
  opts: { identifiers?: Record<string, Record<string, string>>; report_id?: string | null } = {},
) {
  const ids = confirmIds;
  const outs = await Promise.all(
    ids.map(async (cid, i) => {
      const gen = runConfirmed({ confirm_id: cid, identifiers: opts.identifiers?.[cid], report_id: opts.report_id ?? null }, signal);
      while (true) {
        const n = await gen.next();
        if (n.done) return n.value;
        await onEvent(i, n.value);
      }
    }),
  );
  return outs;
}

export { drainAgent };
