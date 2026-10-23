import "server-only";
import { tf, type TfRun } from "../tinyfish";
import { cfg } from "./config";
import { db, safe, type Row } from "./db";
import { drainAgent, rates, run_agent_goal, type AgentEvent, type AgentGoal, type AgentOutcome } from "./ops";
import { resolvePortalLive } from "./portal";
import { relayGet, type RelayData } from "./relay";
import { DISCOVERY_SCHEMA, LAND_SCHEMA, schemeById, stateByCode, STATUS_SCHEMA, VERIFY_SCHEMA, type TaskKind } from "./schemes";
import { logRun, sessions, type SessionRow } from "./store";
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
 *  - runConfirmed(): auto-started live status / land check (structured output_schema, no consent gate),
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

/**
 * Guaranteed live "verify" Agent goal — the Sahayak journey's Live Agent step.
 *  page: open the official page in a real browser and read the facts the citizen asked about (no form submission)
 *  map : open the gated status checker and map its inputs / OTP / CAPTCHA (no personal data entered)
 */
function verifyGoal(o: { schemeName: string; entry: string; mode: "page" | "map"; subTask: string; question: string; commodity?: string | null; district?: string | null; stateName: string }) {
  const host = hostOf(o.entry);
  if (o.mode === "map") {
    return [
      `Open the official ${o.schemeName} portal at ${o.entry} in the browser and map its beneficiary / application STATUS checker as it is live right now.`,
      `The citizen asked: "${o.question}". Their personal identifiers are not available yet, so DO NOT type any personal data and DO NOT submit any form.`,
      "1. Find the status / know-your-status page (follow menu links if needed). Record its URL in status_page_url.",
      "2. List every visible input field label in input_fields (e.g. Registration number, Aadhaar, Mobile, CAPTCHA, Get OTP).",
      "3. Set requires_otp / requires_captcha from what you see.",
      "4. Also read 2-6 useful public facts visible on the portal (helpline, benefit amount, latest notice, eligibility) into verified_facts as {label, value}.",
      "5. If the site does not load set blocked_by=\"site_down\"; otherwise blocked_by=\"none\".",
      NO_SUBMIT,
      "Be quick: use at most 8 browser actions, then stop. Return JSON matching the output schema; use null / [] for anything not shown.",
    ].join("\n");
  }
  const focus =
    o.subTask === "price"
      ? `the latest mandi prices${o.commodity ? ` for ${o.commodity}` : ""}${o.district ? ` near ${o.district}` : ""} (market, modal price, unit, date) into prices`
      : o.subTask === "deadline"
        ? "the current last date / deadline and the latest notice or circular (title + date) into deadline and latest_notice"
        : "the benefit, eligibility, documents required, how to apply / deadline and the helpline";
  return [
    `Open the official page ${o.entry} (${host}) in the browser and read it live, right now, for a citizen of ${o.stateName}.`,
    `The citizen asked: "${o.question}".`,
    `1. Read the page (scroll if needed; if the page is only a landing page, follow at most 2 obvious links on ${host} to the ${o.schemeName} details).`,
    `2. Extract ${focus}.`,
    "3. Put 3-10 short, concrete facts you actually saw on the page into verified_facts as {label, value} (amounts, dates, numbers, names) — never invent anything.",
    "4. Record the page title and the exact URL you read in page_title / official_url. If the site does not load set blocked_by=\"site_down\", otherwise blocked_by=\"none\".",
    NO_SUBMIT,
    "Be quick: use at most 8 browser actions (prefer reading over clicking), then stop. Return JSON matching the output schema; use null / [] for anything not shown.",
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
/* Live status / land check (auto-run, no consent gate)                */
/* ================================================================== */
interface ConfirmData extends Record<string, unknown> {
  scheme_id: string;
  task: "status" | "land" | "verify";
  mode?: "page" | "map" | "personal";
  sub_task?: string;
  fallback_url?: string | null;
  question?: string;
  commodity?: string | null;
  district?: string | null;
  state_code: string;
  entry_url: string;
  est_steps: number;
  sealed: string;
  language?: string;
  report_id?: string;
  used?: boolean;
}

export async function* runConfirmed(
  opts: { confirm_id: string; identifiers?: Record<string, string>; relay_id?: string | null; report_id?: string | null; token?: string | null },
  signal?: AbortSignal,
): AsyncGenerator<FlowEvent, AgentOutcome | null> {
  let c = await sessions.get<ConfirmData>(opts.confirm_id);
  // serverless: /ask and /confirm can land on different instances (memory store) → restore from the sealed task token
  if (!c && opts.token) {
    const t = unseal<SessionRow<ConfirmData>>(opts.token);
    if (t && t.id === opts.confirm_id && t.kind === "confirm" && String(t.expires_at) > nowIso()) {
      c = t;
      const ttl = Math.max(30, Math.floor((Date.parse(String(t.expires_at)) - Date.now()) / 1000));
      await sessions.put("confirm", t.data, ttl, { id: t.id, user_id: t.user_id }).catch(() => null);
    }
  }
  if (!c || c.kind !== "confirm") {
    yield { type: "LM_ERROR", error: "This confirmation has expired. Please ask again." };
    return null;
  }
  if (c.data.used) {
    yield { type: "LM_ERROR", error: "This confirmation was already used." };
    return null;
  }
  const scheme = schemeById(c.data.scheme_id)!;
  if (c.data.task === "verify") {
    return yield* runVerify(opts.confirm_id, c, opts.report_id ?? null, signal);
  }
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

  // Required identifiers are purely operational input: without them the portal cannot be queried, so the
  // task waits (nothing is spent) until the citizen supplies them — it is never a consent prompt.
  const required = task === "land" ? ["district", "tehsil", "village", "khasra_no"] : (scheme.statusIdentifiers ?? [{ key: "reg_no" }]).map((f) => f.key);
  const missing = required.filter((k) => !ids[k]);
  if (missing.length && !opts.relay_id) {
    yield { type: "LM_ERROR", error: `Details needed before the live check can start: ${missing.join(", ")}`, missing_fields: missing, retryable: true };
    return null;
  }

  await sessions.patch<ConfirmData>(opts.confirm_id, { used: true });
  const r = await rates();
  yield { type: "LM_STAGE", message: `Live run started automatically · step rate $${r.step.toFixed(3)} (cost streams live) · typical ${c.data.est_steps} steps`, step_rate_usd: r.step };

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
  if (reportId) await attachAgentResult(reportId, { scheme_id: scheme.id, task, run_id: out.run_id, status: out.status, result, cost_usd: out.cost_usd, at: nowIso() });

  // video recording of the run — the presigned URL can lag the COMPLETE event by a few seconds, so poll briefly
  let video_url: string | null = null;
  if (out.run_id) {
    for (let i = 0; i < 4 && !video_url; i++) {
      if (i) await new Promise((r) => setTimeout(r, 2500));
      try {
        const run = await tf<TfRun>("agent", `/v1/runs/${out.run_id}`, { query: { screenshots: "none", html: "none" }, timeoutMs: 10_000 });
        video_url = run.video_url ?? null;
      } catch {
        /* keep trying */
      }
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
    video_url,
    step_rate_usd: r.step,
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

/* ================================================================== */
/* Guaranteed live "verify" Agent (the journey's Live Agent step)      */
/* ================================================================== */
async function* runVerify(confirmId: string, c: SessionRow<ConfirmData>, reportIdIn: string | null, signal?: AbortSignal): AsyncGenerator<FlowEvent, AgentOutcome | null> {
  const scheme = schemeById(c.data.scheme_id)!;
  const mode = c.data.mode === "map" ? "map" : "page";
  await sessions.patch<ConfirmData>(confirmId, { used: true });
  const r = await rates();
  yield { type: "LM_STAGE", message: `Live TinyFish Agent spawned · ${mode === "map" ? "mapping the status checker" : "reading the official page"} · step rate $${r.step.toFixed(3)} · typical ${c.data.est_steps} steps`, step_rate_usd: r.step };
  const stateName = stateByCode(c.data.state_code || "IN").name;
  const urls = [c.data.entry_url, c.data.fallback_url, scheme.entry].filter((u, i, a): u is string => !!u && /^https?:\/\//.test(u) && a.indexOf(u) === i).slice(0, 2);
  let out: AgentOutcome | null = null;
  let entry = urls[0] ?? scheme.entry;
  for (let attempt = 0; attempt < urls.length; attempt++) {
    entry = urls[attempt];
    if (attempt > 0) yield { type: "LM_STAGE", message: `First portal page did not load — the agent is retrying on ${hostOf(entry)}…` };
    yield { type: "LM_STAGE", message: `TinyFish agent is opening ${hostOf(entry)} in a real browser now…`, host: hostOf(entry) };
    const goal: AgentGoal = {
      url: entry,
      goal: verifyGoal({ schemeName: scheme.name, entry, mode, subTask: String(c.data.sub_task ?? "info"), question: String(c.data.question ?? scheme.name), commodity: c.data.commodity, district: c.data.district, stateName }),
      output_schema: VERIFY_SCHEMA as unknown as Record<string, unknown>,
      purpose: mode === "map" ? "verify_map" : "verify_page",
      scheme_id: scheme.id,
      state_code: c.data.state_code,
      browser_profile: "stealth",
      // functional wall-clock guard so the run (and a possible fallback) fits one Vercel request — not a cost cap
      max_duration_seconds: attempt === 0 ? Math.min(cfg.agentMaxDurationSec() || 150, 150) : 90,
    };
    const gen = run_agent_goal(goal, signal);
    while (true) {
      const n = await gen.next();
      if (n.done) {
        out = n.value;
        break;
      }
      yield n.value;
    }
    const res0 = unwrap(out!.result);
    const down = !res0 || res0.blocked_by === "site_down" || res0.blocked_by === "not_found";
    if ((out!.status === "COMPLETED" && !down) || signal?.aborted || out!.status === "CANCELLED") break;
  }
  if (!out) {
    yield { type: "LM_ERROR", error: "The live agent could not start." };
    return null;
  }
  const raw = unwrap(out.result);
  const result = raw ? { ...raw, mode, sub_task: c.data.sub_task ?? "info", entry_url: entry } : null;
  const reportId = reportIdIn || c.data.report_id;
  if (reportId) await attachAgentResult(reportId, { scheme_id: scheme.id, task: String(c.data.sub_task ?? "info"), kind: "verify", mode, run_id: out.run_id, status: out.status, result, cost_usd: out.cost_usd, at: nowIso() });

  let video_url: string | null = null;
  if (out.run_id) {
    for (let i = 0; i < 3 && !video_url; i++) {
      if (i) await new Promise((res) => setTimeout(res, 2000));
      try {
        const run = await tf<TfRun>("agent", `/v1/runs/${out.run_id}`, { query: { screenshots: "none", html: "none" }, timeoutMs: 10_000 });
        video_url = run.video_url ?? null;
      } catch {
        /* keep trying */
      }
    }
  }
  yield {
    type: "LM_RESULT",
    retry_confirm_id: null,
    scheme_id: scheme.id,
    scheme_name: scheme.name,
    task: "verify",
    mode,
    sub_task: c.data.sub_task ?? "info",
    run_id: out.run_id,
    status: out.status,
    result,
    cost_usd: out.cost_usd,
    steps: out.steps,
    streaming_url: out.streaming_url,
    video_url,
    step_rate_usd: r.step,
    needs_otp: false,
    needs_captcha: false,
    profile_hint: out.profile_hint ?? null,
    error: out.status === "COMPLETED" ? null : out.error ?? `agent ${out.status}`,
    diy: scheme.diy,
    sources: [entry],
  };
  void logRun({ surface: "agent", purpose: `verify_${mode}_result`, scheme_id: scheme.id, state_code: c.data.state_code, run_id: out.run_id, cost_usd: 0, meta: { summary: clip(JSON.stringify(result ?? {}), 200) } });
  return out;
}

/** TinyFish returns either the schema object or { result: {...} } (sometimes a JSON string) — normalise. */
function unwrap(v: unknown): Record<string, unknown> | null {
  let x: unknown = v;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      return { raw_message: clip(String(v), 600), verified_facts: [] };
    }
  }
  if (!x || typeof x !== "object") return null;
  const o = Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, val]) => [k, typeof val === "string" && /^\s*(null|n\/a|undefined)\s*$/i.test(val) ? null : val]));
  if (o.result && typeof o.result === "object" && !Array.isArray(o.result)) return o.result as Record<string, unknown>;
  if (typeof o.result === "string") return unwrap(o.result);
  return o;
}

/**
 * Append an Agent result to the stored report. Agents now start automatically while the report is still being
 * written, and several run in parallel — so wait briefly for the row and re-verify after writing to survive
 * concurrent read-modify-write races.
 */
async function attachAgentResult(reportId: string, entry: Record<string, unknown>) {
  for (let i = 0; i < 6; i++) {
    const rep = await safe(db.one<Row>("benefit_reports", { eq: { id: reportId } }), null);
    if (!rep) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    for (let k = 0; k < 4; k++) {
      const cur = k === 0 ? rep : await safe(db.one<Row>("benefit_reports", { eq: { id: reportId } }), null);
      if (!cur) return;
      const ar = Array.isArray(cur.agent_results) ? (cur.agent_results as Record<string, unknown>[]) : [];
      if (ar.some((x) => x.run_id && x.run_id === entry.run_id)) return;
      await safe(db.update("benefit_reports", { id: reportId }, { agent_results: [...ar, entry], cost_usd: Number(cur.cost_usd ?? 0) + Number(entry.cost_usd ?? 0), updated_at: nowIso() }), []);
      await new Promise((r) => setTimeout(r, 300 * (k + 1)));
      const chk = await safe(db.one<Row>("benefit_reports", { eq: { id: reportId } }), null);
      const now = Array.isArray(chk?.agent_results) ? (chk!.agent_results as Record<string, unknown>[]) : [];
      if (now.some((x) => x.run_id === entry.run_id)) return;
    }
    return;
  }
}

/** Run several live checks at once (PM-KISAN + Ayushman + NSP…) — multi-domain cross-verification. */
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
