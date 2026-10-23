import "server-only";
import { cfg } from "./config";
import { db, safe } from "./db";
import { extractFromMarkdown, followUp, parseIntent, type Intent, type SectionInput, type SubQuery } from "./groq";
import { buildReport, localizeReport, reportMarkdown, type SynthSection } from "./synthesis";
import type { StructuredReport } from "./report-shape";
import { langByCode } from "./languages";
import { fetch_clean_markdown, rates, type FetchedPage } from "./ops";
import { portalState as portalStateOf, resolvePortalLive, type LivePortal } from "./portal";
import { estimateSteps, schemeById, stateByCode, type SchemeDef } from "./schemes";
import { getUser, logRun, rateLimit, sessions, upsertUser } from "./store";
import { clip, hostOf, nowIso, redact, seal, uuid } from "./util";
import { analyzeQuery, type QueryConstraints } from "./answer-style";
import { SCHEMES } from "./schemes";

export type Emit = (event: string, data: Record<string, unknown>) => void | Promise<void>;

export interface AskInput {
  text: string;
  user_id?: string | null;
  channel?: "web" | "telegram" | "email" | "csc";
  language?: string | null; // preferred reply language (UI selector)
  state_code?: string | null;
  district?: string | null;
  identifiers?: Record<string, string>;
}

export interface Section extends SectionInput {
  /** every section is resolved live — kept as a literal so stored reports are self-describing */
  live: true;
  portal_state: string;
  /** live Agent task planned for this section — started automatically by the channel (no consent gate) */
  confirm?: ConfirmPlan;
  search?: { query: string; results: number; error?: string | null; latency_ms: number };
  excerpt_sources?: { url: string; title: string | null; error?: string; latency_ms?: number | null }[];
}

/**
 * A live Agent task. `confirm_id` is just the handle of the server-side task session (sealed identifiers,
 * entry URL, report link) — it is NOT a consent gate: channels start the Agent automatically.
 * `ready` = every required identifier is already known; otherwise the channel shows a purely
 * operational input for the missing fields and starts the Agent the moment they are submitted.
 */
export interface ConfirmPlan {
  confirm_id: string;
  report_id: string;
  ready: boolean;
  scheme_id: string;
  scheme_name: string;
  task: "status" | "land" | "verify";
  /** verify agents: page = read the official page live · map = map the gated status checker live; personal = status/land */
  mode: "page" | "map" | "personal";
  /** section task the agent backs (info / price / deadline / status / land) — used to overlay results onto the report */
  sub_task: string;
  /** sealed task session — lets /confirm restore the task on a different serverless instance (memory store) */
  token: string;
  entry_url: string;
  fallback_url?: string | null;
  est_steps: number;
  est_cost_usd: number;
  requires_otp: boolean | null;
  fields: { key: string; label: string; provided: boolean }[];
  expires_at: string;
}

export interface AskResult {
  report_id: string;
  language: string;
  intent: Intent;
  intent_via: "groq" | "heuristic";
  sections: Section[];
  summary_en: string;
  summary_local: string;
  structured?: StructuredReport | null;
  /** every live Agent task of this question: guaranteed "verify" agents + personal status / land checks */
  agent_tasks: ConfirmPlan[];
  sources: string[];
  live_calls: { search: number; fetch_urls: number; fetch_ok: number };
  cost_usd: number;
  follow_up?: boolean;
  elapsed_ms: number;
}

const LAND_FIELDS = [
  { key: "district", label: "District" },
  { key: "tehsil", label: "Tehsil / Taluka" },
  { key: "village", label: "Village" },
  { key: "khasra_no", label: "Khasra / Survey / Gat number" },
];

/* ------------------------------------------------------------------ */
/* Free-path extraction                                                */
/* ------------------------------------------------------------------ */
const INFO_HINT = `{"scheme_name":string,"benefit":string|null,"eligibility":string[],"exclusions":string[],"documents_required":string[],"how_to_apply":string[],"deadline":string|null,"helpline":string|null,"official_url":string|null}`;
const PRICE_HINT = `{"commodity":string,"prices":[{"market":string,"min_price":string|null,"max_price":string|null,"modal_price":string|null,"unit":string|null,"date":string|null}]}`;
const DEADLINE_HINT = `{"deadline":string|null,"season":string|null,"latest_notice_title":string|null,"latest_notice_date":string|null,"what_changed":string|null,"official_url":string|null}`;

function excerpt(text: string, re: RegExp, max = 900) {
  const BOILER = /sign out|skip to (main )?content|screen reader|cookie|javascript is (disabled|required)|NeGD|Electronics Niketan|all rights reserved|visitor (count|no)|last updated on|font size|text size|^\W*(home|login|menu)\W*$/i;
  const paras = text.split(/\n{1,}/).map((p) => p.trim()).filter((p) => p.length > 30 && !/^\[?!\[/.test(p) && !BOILER.test(p));
  const hits = paras.filter((p) => re.test(p));
  const pick = (hits.length ? hits : paras).filter((p) => !/^##\s*SOURCE\b/.test(p) || p.length > 120).slice(0, 6).join("\n").replace(/##\s*SOURCE\s+\S+\s*/g, "");
  return clip(pick, max);
}

interface PriceRow { market: string; district: string | null; min_price: string | null; max_price: string | null; modal_price: string | null; unit: string; date: string | null }

/** Deterministic parser for AgMarkNet-derived tables (agriplus) and overview blocks (acrop) — no LLM needed. */
export function parsePriceTables(md: string, district?: string | null): { rows: PriceRow[]; typical?: string | null } {
  const rows: PriceRow[] = [];
  for (const line of md.split("\n")) {
    if (!line.includes("|")) continue;
    const c = line.split("|").map((x) => x.trim());
    while (c.length && c[0] === "") c.shift();
    while (c.length && c[c.length - 1] === "") c.pop();
    // Sl no | State | District | Market | Commodity | Variety | Min | Max | Modal | Date
    const off = /^\d+$/.test(c[0] ?? "") ? 1 : 0;
    const nums = [c[off + 5], c[off + 6], c[off + 7]];
    if (c.length >= off + 9 && nums.every((n) => /^\d{2,6}$/.test(n ?? ""))) {
      rows.push({ market: c[off + 2], district: c[off + 1], min_price: nums[0], max_price: nums[1], modal_price: nums[2], unit: "per quintal", date: c[off + 8] || null });
    }
  }
  const t = md.match(/Typical mandi price\s*\n+\s*(₹[\d,]+\s*\/\s*quintal)\s*\n+\s*(Median of \d+ reporting mandis)?/i);
  const d = district?.toLowerCase();
  rows.sort((a, b) => Number(!!d && b.district?.toLowerCase() === d) - Number(!!d && a.district?.toLowerCase() === d));
  return { rows: rows.slice(0, 8), typical: t ? `${t[1]}${t[2] ? ` (${t[2]})` : ""}` : null };
}

/** Prefer the official URL we asked for when the fetch ended on a raw-IP mirror. */
function shownUrl(p: { url: string; final_url: string | null }) {
  return p.final_url && !/^\d{1,3}(\.\d{1,3}){3}$/.test(hostOf(p.final_url)) ? p.final_url : p.url;
}

async function extractSection(scheme: SchemeDef, sub: SubQuery, pages: FetchedPage[], intent: Intent, qc?: QueryConstraints): Promise<{ data: Record<string, unknown>; status: Section["status"] }> {
  const good = pages.filter((p) => p.text && p.text.length > 80);
  if (!good.length) return { data: { excerpt: null, errors: pages.map((p) => `${hostOf(p.url)}: ${p.error ?? "empty"}`) }, status: "error" };
  const md = good.map((p) => `## SOURCE ${shownUrl(p)}\n# ${p.title ?? ""}\n${p.text}`).join("\n\n").slice(0, 15000);
  if (sub.task === "price") {
    const det = parsePriceTables(good.map((p) => p.text).join("\n"), intent.district);
    if (det.rows.length || det.typical) {
      return { data: { commodity: intent.commodity, typical_price: det.typical ?? null, prices: det.rows.map((r) => ({ market: r.market, district: r.district, min_price: r.min_price, max_price: r.max_price, modal_price: r.modal_price, unit: r.unit, date: r.date })), parsed_by: "deterministic" }, status: "ok" };
    }
    const q = `Latest mandi prices for ${intent.commodity ?? "the commodity"}${intent.district ? ` near ${intent.district}` : ""}${intent.state_code ? ` in ${stateByCode(intent.state_code).name}` : ""}`;
    const x = await extractFromMarkdown<Record<string, unknown>>({ markdown: md, schemaHint: PRICE_HINT, question: q, purpose: "extract_price" });
    if (x && Array.isArray(x.prices) && x.prices.length) return { data: x, status: "ok" };
    return { data: { commodity: intent.commodity, prices: [], excerpt: excerpt(md, new RegExp(`${intent.commodity ?? "price"}|₹|rs\\.?|quintal|modal`, "i")) }, status: "partial" };
  }
  if (sub.task === "deadline") {
    const x = await extractFromMarkdown<Record<string, unknown>>({ markdown: md, schemaHint: DEADLINE_HINT, question: `What is the current last date / latest notice for ${scheme.name}?`, purpose: "extract_deadline" });
    if (x && (x.deadline || x.latest_notice_title)) return { data: x, status: "ok" };
    return { data: { excerpt: excerpt(md, /last date|deadline|अंतिम|extended|notice|circular|\b20\d\d\b/i) }, status: "partial" };
  }
  const x = await extractFromMarkdown<Record<string, unknown>>({ markdown: md, schemaHint: INFO_HINT, question: `${qc && !qc.focus.includes("general") ? `Focus on: ${qc.focus.join(", ")}. ` : ""}Eligibility, exclusions, benefits, documents and how to apply for ${scheme.name}${(qc?.persona ?? intent.persona) ? ` (the citizen is a ${qc?.persona ?? intent.persona})` : ""}. Citizen asked: "${clip(intent.english_query, 200)}"`, purpose: "extract_info" });
  if (x && Array.isArray(x.eligibility) && x.eligibility.length) return { data: x, status: "ok" };
  return { data: { scheme_name: scheme.name, benefit: scheme.benefit, excerpt: excerpt(md, /eligib|benefit|document|apply|पात्र|लाभ|last date|helpline/i) }, status: "partial" };
}

/* ------------------------------------------------------------------ */
/* Live Agent task planning (auto-run — no consent gate)               */
/* ------------------------------------------------------------------ */
async function planAgentTask(scheme: SchemeDef, sub: SubQuery, intent: Intent, portalState: string, userId: string | null, identifiers: Record<string, string>, live: LivePortal | null, reportId: string): Promise<ConfirmPlan> {
  const task = sub.task === "land" ? "land" : "status";
  const steps = estimateSteps(task);
  const r = await rates();
  const fieldsDef = task === "land" ? LAND_FIELDS : scheme.statusIdentifiers ?? [{ key: "reg_no", label: "Registration / application number" }];
  const ids: Record<string, string> = { ...identifiers };
  if (task === "land" && intent.district && !ids.district) ids.district = intent.district;
  const st = stateByCode(portalState);
  const entry = live?.entry_url ?? (task === "land" ? st.land ?? scheme.entry : scheme.statusUrl ?? scheme.entry);
  const ttl = cfg.confirmTtlSec();
  const sess = await sessions.put(
    "confirm",
    {
      scheme_id: scheme.id,
      task,
      state_code: portalState,
      entry_url: entry,
      est_steps: steps,
      sealed: seal(ids),
      language: intent.language,
      report_id: reportId,
      created: nowIso(),
    },
    ttl,
    { user_id: userId },
  );
  const fields = fieldsDef.map((f) => ({ key: f.key, label: f.label, provided: !!ids[f.key] }));
  return {
    confirm_id: sess.id,
    report_id: reportId,
    ready: fields.every((f) => f.provided),
    scheme_id: scheme.id,
    scheme_name: scheme.name,
    task,
    mode: "personal",
    sub_task: task,
    token: seal(sess),
    entry_url: entry,
    est_steps: steps,
    est_cost_usd: Math.round(steps * r.step * 1000) / 1000,
    requires_otp: scheme.statusIdentifiers?.some((f) => /otp/i.test(f.label)) || null,
    fields,
    expires_at: sess.expires_at,
  };
}

/* ------------------------------------------------------------------ */
/* Guaranteed live "verify" Agent (the journey's Live Agent step)      */
/* ------------------------------------------------------------------ */
/** At most this many verify agents per question (they run in parallel). */
const MAX_VERIFY = 3;
const isHttp = (u: string | null | undefined): u is string => !!u && /^https?:\/\//i.test(u);

/**
 * Plans one live TinyFish Agent that ALWAYS runs for a question — it is never skipped:
 *  page : open the official page in a real browser and read the facts the citizen asked about (no form submission)
 *  map  : open the gated status checker and map its inputs / OTP / CAPTCHA (no personal data entered)
 * It needs no identifiers, so it is `ready` and every channel starts it immediately.
 */
async function planVerifyTask(o: { scheme: SchemeDef; subTask: string; mode: "page" | "map"; entry: string; fallback: string | null; intent: Intent; question: string; portalState: string; userId: string | null; reportId: string }): Promise<ConfirmPlan> {
  const steps = estimateSteps("info");
  const r = await rates();
  const ttl = Math.max(cfg.confirmTtlSec(), 900);
  const fallback = isHttp(o.fallback) && o.fallback !== o.entry ? o.fallback : null;
  const sess = await sessions.put(
    "confirm",
    {
      scheme_id: o.scheme.id,
      task: "verify",
      mode: o.mode,
      sub_task: o.subTask,
      state_code: o.portalState,
      entry_url: o.entry,
      fallback_url: fallback,
      question: clip(redact(o.question), 300),
      commodity: o.intent.commodity ?? null,
      district: o.intent.district ?? null,
      est_steps: steps,
      sealed: seal({}),
      language: o.intent.language,
      report_id: o.reportId,
      created: nowIso(),
    },
    ttl,
    { user_id: o.userId },
  );
  return {
    confirm_id: sess.id,
    report_id: o.reportId,
    ready: true,
    scheme_id: o.scheme.id,
    scheme_name: o.scheme.name,
    task: "verify",
    mode: o.mode,
    sub_task: o.subTask,
    token: seal(sess),
    entry_url: o.entry,
    fallback_url: fallback,
    est_steps: steps,
    est_cost_usd: Math.round(steps * r.step * 1000) / 1000,
    requires_otp: null,
    fields: [],
    expires_at: sess.expires_at,
  };
}

/* ------------------------------------------------------------------ */
/* Main entry                                                          */
/* ------------------------------------------------------------------ */
export async function ask(input: AskInput, emit: Emit = () => {}): Promise<AskResult> {
  const t0 = Date.now();
  const text = String(input.text ?? "").trim().slice(0, 2000);
  if (!text) throw new Error("empty query");
  const userId = input.user_id || `anon:${uuid()}`;
  const rl = await rateLimit(userId);
  if (!rl.ok) throw Object.assign(new Error(`Rate limit reached (${rl.limit}/hour). Please try again later.`), { status: 429 });

  const user = await getUser(userId);
  const hint = { language: input.language ?? user?.language ?? null, state_code: input.state_code ?? user?.state_code ?? null, district: input.district ?? user?.district ?? null };
  await emit("stage", { stage: "nlu", message: "Understanding your question…" });
  const { intent, via } = await parseIntent(text, hint);
  // the citizen's OWN constraints (yes/no, brief, in-depth, list, focus, persona) drive Search, extraction and the answer
  const qc = analyzeQuery(`${text} ${intent.english_query && intent.english_query !== text ? intent.english_query : ""}`, { persona: intent.persona });
  if (qc.persona) intent.persona = qc.persona;
  if (intent.follow_up && SCHEMES.some((s) => s.keywords.test(text))) intent.follow_up = false; // naming a scheme = a NEW question → full live run
  if (input.state_code && !intent.state_code) intent.state_code = input.state_code;
  if (input.district && !intent.district) intent.district = input.district;
  Object.assign(intent.identifiers, input.identifiers ?? {});
  const replyLang = input.language || intent.language || user?.language || "en";
  await emit("intent", { intent: { ...intent, identifiers: Object.keys(intent.identifiers) }, via, reply_language: replyLang, constraints: qc });
  void upsertUser({ id: userId, channel: input.channel ?? "web", language: replyLang, state_code: intent.state_code ?? user?.state_code ?? null, district: intent.district ?? user?.district ?? null });

  /* ---- follow-up questions answered from the previous report ---- */
  if (intent.follow_up) {
    const chat = await sessions.get<{ summary_en: string; scheme_ids?: string[]; state_code?: string | null }>(`chat_${userId}`.slice(0, 128));
    if (chat?.data.summary_en) {
      const ans = await followUp(text, chat.data.summary_en, replyLang, qc);
      if (ans) {
        const report_id = uuid();
        // the Live Agent step is never skipped — even a follow-up re-reads the official portal live
        const agent_tasks: ConfirmPlan[] = [];
        const prev = schemeById(chat.data.scheme_ids?.[0] ?? "") ?? schemeById("myscheme")!;
        await emit("stage", { stage: "agent", message: `Live TinyFish Agent: re-reading the official ${prev.name} portal for your follow-up…` });
        const plan = await safe(planVerifyTask({ scheme: prev, subTask: "info", mode: "page", entry: prev.entry, fallback: prev.infoLinks[0] ?? null, intent, question: intent.english_query || text, portalState: chat.data.state_code || intent.state_code || "IN", userId, reportId: report_id }), null);
        if (plan) {
          agent_tasks.push(plan);
          await emit("agent_task", plan as unknown as Record<string, unknown>);
        }
        await safe(db.insert("benefit_reports", { id: report_id, user_id: userId, language: replyLang, query: redact(text), intent: {}, sections: [], summary_en: ans, summary_local: ans, sources: [], live_calls: { search: 0, fetch_urls: 0, fetch_ok: 0 }, created_at: nowIso() }), []);
        await emit("report", { report_id, summary_en: ans, summary_local: ans, language: replyLang, follow_up: true, agent_tasks: agent_tasks.length });
        return { report_id, language: replyLang, intent, intent_via: via, sections: [], summary_en: ans, summary_local: ans, agent_tasks, sources: [], live_calls: { search: 0, fetch_urls: 0, fetch_ok: 0 }, cost_usd: 0, follow_up: true, elapsed_ms: Date.now() - t0 };
      }
    }
  }

  /* ---- LIVE portal resolution: a fresh TinyFish Search for every sub-query, every time ---- */
  const subs = intent.sub_queries;
  await emit("stage", { stage: "search", message: `Live TinyFish Search: locating ${subs.length} official portal page(s) right now…` });
  const resolved = await Promise.all(
    subs.map(async (sub) => {
      const scheme = schemeById(sub.scheme_id)!;
      const pState = portalStateOf(scheme, intent.state_code, sub.task);
      try {
        const r = await resolvePortalLive(scheme.id, sub.task, { state: intent.state_code, district: intent.district, commodity: intent.commodity, persona: intent.persona, constraints: qc });
        const search = { query: r.query, results: r.searched.length, error: r.searchError ?? null, latency_ms: r.latency_ms };
        await emit("search", { scheme_id: scheme.id, scheme: scheme.name, task: sub.task, state: pState, query: r.query, results: r.searched.length, top: r.searched.slice(0, 3).map((h) => h.url), links: r.portal.deep_links.map((l) => l.url), resolved_via: r.portal.resolved_via, latency_ms: r.latency_ms, error: r.searchError ?? null });
        return { sub, scheme, portalState: pState, live: r.portal as LivePortal | null, search };
      } catch (e) {
        await emit("search", { scheme_id: scheme.id, scheme: scheme.name, task: sub.task, state: pState, results: 0, error: (e as Error).message });
        return { sub, scheme, portalState: pState, live: null, search: { query: "", results: 0, error: (e as Error).message, latency_ms: 0 } };
      }
    }),
  );

  const isGated = (sub: SubQuery) => sub.personal && (sub.task === "status" || sub.task === "land");
  // the report id is fixed up-front so live Agent tasks (started automatically, in parallel) can attach their results to it
  const report_id = uuid();
  const agent_tasks: ConfirmPlan[] = [];

  /* ---- LIVE AGENT — never skipped: every question spawns ≥1 real TinyFish "verify" Agent right now ---- */
  {
    const seen = new Set<string>();
    const picks = [...resolved]
      .sort((a, b) => Number(isGated(b.sub)) - Number(isGated(a.sub)) || Number(a.scheme.id === "myscheme") - Number(b.scheme.id === "myscheme"))
      .filter((r) => (seen.has(r.scheme.id) ? false : (seen.add(r.scheme.id), true)))
      .slice(0, MAX_VERIFY);
    await emit("stage", { stage: "agent", message: `Live TinyFish Agent: spawning ${picks.length} real browser agent(s) on the official portal(s) now…` });
    const plans = await Promise.all(
      picks.map(async (r) => {
        const gated = isGated(r.sub);
        // page mode starts on the scheme's official portal (most reliable), falling back to the top live Search hit;
        // price lookups start on the live market page Search found; map mode starts on the live status checker
        const top = r.live?.deep_links?.find((l) => !/\.pdf($|\?)/i.test(l.url))?.url ?? null;
        const entry = gated ? r.live?.entry_url || r.scheme.statusUrl || r.scheme.entry : r.sub.task === "price" ? top ?? r.scheme.entry : r.scheme.entry;
        const fallback = gated ? r.scheme.entry : r.sub.task === "price" ? r.scheme.entry : top ?? r.scheme.infoLinks[0] ?? null;
        return safe(planVerifyTask({ scheme: r.scheme, subTask: r.sub.task, mode: gated ? "map" : "page", entry, fallback, intent, question: intent.english_query || text, portalState: r.portalState, userId, reportId: report_id }), null);
      }),
    );
    for (const plan of plans) {
      if (!plan) continue;
      agent_tasks.push(plan);
      await emit("agent_task", plan as unknown as Record<string, unknown>);
    }
  }

  /* ---- LIVE Fetch of every public page (batched ≤10 URLs per request, batches in parallel) ---- */
  const publicOnes = resolved.filter((r) => !isGated(r.sub));
  const urlPlan = new Map<string, string[]>();
  for (const r of publicOnes) urlPlan.set(`${r.scheme.id}:${r.sub.task}`, (r.live?.deep_links ?? []).slice(0, 3).map((l) => l.url));
  const allUrls = [...new Set([...urlPlan.values()].flat())];
  let pages: FetchedPage[] = [];
  if (allUrls.length) {
    await emit("stage", { stage: "fetch", message: `Live TinyFish Fetch: reading ${allUrls.length} official page(s) from the real portals now…`, urls: allUrls });
    pages = await fetch_clean_markdown(allUrls, { purpose: `Citizen question: ${clip(intent.english_query || text, 200)}`, state_code: intent.state_code ?? undefined });
    await emit("fetch", { pages: pages.map((p) => ({ url: p.url, title: p.title, chars: p.text.length, latency_ms: p.latency_ms ?? null, error: p.error ?? null })) });
  }
  const byUrl = new Map(pages.map((p) => [p.url, p]));

  /* ---- build sections ---- */
  const sections: Section[] = [];
  const pagesBySection = new Map<string, { url: string; text: string }[]>();
  for (const r of resolved) {
    const { sub, scheme } = r;
    const base = { scheme_id: scheme.id, scheme_name: scheme.name, task: sub.task, diy: scheme.diy, benefit: scheme.benefit, live: true as const, portal_state: r.portalState, search: r.search };
    if (isGated(sub)) {
      await emit("stage", { stage: "agent", message: `${scheme.name}: a personal ${sub.task} check — a live TinyFish Agent starts automatically on the portal.` });
      const plan = await planAgentTask(scheme, sub, intent, r.portalState, userId, intent.identifiers, r.live, report_id);
      const sec: Section = {
        ...base,
        status: "agent_live",
        data: { input_fields: null },
        sources: [plan.entry_url],
        confirm: plan,
      };
      sections.push(sec);
      agent_tasks.push(plan);
      await emit("agent_task", plan as unknown as Record<string, unknown>);
      await emit("section", sec as unknown as Record<string, unknown>);
      continue;
    }
    const urls = urlPlan.get(`${scheme.id}:${sub.task}`) ?? [];
    const ps = urls.map((u) => byUrl.get(u)).filter(Boolean) as FetchedPage[];
    pagesBySection.set(`${scheme.id}:${sub.task}`, ps.filter((p) => p.text).map((p) => ({ url: shownUrl(p), text: p.text })));
    const { data, status } = await extractSection(scheme, sub, ps, intent, qc);
    const sec: Section = { ...base, status, data, sources: ps.filter((p) => p.text).map((p) => shownUrl(p)).concat(ps.length ? [] : [scheme.entry]), excerpt_sources: ps.map((p) => ({ url: p.url, title: p.title, error: p.error, latency_ms: p.latency_ms ?? null })) };
    sections.push(sec);
    await emit("section", sec as unknown as Record<string, unknown>);
  }

  /* ---- synthesis (structured, sector-grouped, contradiction-aware) + localisation ---- */
  await emit("stage", { stage: "synthesis", message: qc.style === "binary" ? "Answering your yes/no question from the live official pages…" : qc.style === "brief" ? "Writing a short answer from the live official pages…" : qc.style === "detailed" ? "Writing an in-depth answer + structured Citizen Benefit Report from the live official pages…" : "Answering your question + writing your Citizen Benefit Report…" });
  const synthIn: SynthSection[] = sections.map((s) => ({ ...s, pages: pagesBySection.get(`${s.scheme_id}:${s.task}`) ?? [], confirm: s.confirm ? { confirm_id: s.confirm.confirm_id, est_steps: s.confirm.est_steps, est_cost_usd: s.confirm.est_cost_usd, entry_url: s.confirm.entry_url, requires_otp: s.confirm.requires_otp } : undefined }));
  let structured = await buildReport({ query: text, intent, sections: synthIn, language: replyLang, constraints: qc });
  if (replyLang !== "en") {
    await emit("stage", { stage: "translate", message: `Translating into ${langByCode(replyLang).native} (offline glossary labels + Groq translation chain)…` });
    structured = await localizeReport(structured, replyLang);
  }
  const { summary_en, summary_local } = reportMarkdown(structured, replyLang);
  await emit("structured", structured as unknown as Record<string, unknown>);
  const sources = [...new Set(sections.flatMap((s) => s.sources))].slice(0, 20);
  const live_calls = { search: resolved.length, fetch_urls: allUrls.length, fetch_ok: pages.filter((p) => p.text && !p.error).length };
  await safe(
    db.insert("benefit_reports", {
      id: report_id,
      user_id: userId,
      language: replyLang,
      query: redact(text),
      intent: { ...intent, identifiers: Object.keys(intent.identifiers) },
      sections: sections.map((s) => ({ ...s, data: JSON.parse(clip(JSON.stringify(s.data ?? null), 6000).replace(/…$/, "") || "null") ?? s.data })),
      summary_en,
      summary_local,
      structured,
      sources,
      cost_usd: 0,
      live_calls,
      elapsed_ms: Date.now() - t0,
      created_at: nowIso(),
    }).catch(async () => db.insert("benefit_reports", { id: report_id, user_id: userId, language: replyLang, query: redact(text), intent: {}, sections: [], summary_en, summary_local, sources, live_calls, created_at: nowIso() })),
    [],
  );
  await safe(sessions.put("chat", { summary_en, report_id, scheme_ids: sections.map((s) => s.scheme_id), state_code: intent.state_code ?? null }, 3600 * 6, { id: `chat_${userId}`.slice(0, 128), user_id: userId }), null);
  void logRun({ surface: "llm", purpose: "report", state_code: intent.state_code, latency_ms: Date.now() - t0, meta: { sections: sections.length, via, lang: replyLang, channel: input.channel ?? "web", live_calls } });

  const result: AskResult = { report_id, language: replyLang, intent, intent_via: via, sections, summary_en, summary_local, structured, agent_tasks, sources, live_calls, cost_usd: 0, elapsed_ms: Date.now() - t0 };
  await emit("report", { report_id, summary_en, summary_local, language: replyLang, sources, live_calls, elapsed_ms: result.elapsed_ms, structured, answer: structured.answer ?? null, agent_tasks: agent_tasks.length });
  return result;
}

export async function getReport(id: string) {
  return safe(db.one("benefit_reports", { eq: { id } }), null);
}
