import "server-only";
import { z } from "zod";
import Groq, { toFile } from "groq-sdk";
import { cfg } from "./config";
import { guessLanguage, langByCode, LANG_CODES } from "./languages";
import { COMMODITIES, DISTRICT_HINTS, SCHEMES, STATE_NAME_HINTS, type TaskKind } from "./schemes";
import { logRun } from "./store";
import { clip } from "./util";
import { capWords, personaFromText, stripSchemeNames, type QueryConstraints } from "./answer-style";

/* ================================================================== */
/* Low-level OpenAI-compatible chat client                             */
/* ================================================================== */
export class GroqError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

interface ChatOpts {
  model: string;
  system: string;
  user: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  purpose: string;
}

/* ------------------------------------------------------------------ */
/* Model ids. Groq's real id for the spec's "qwen3-8b-27b" is             */
/* "qwen/qwen3.8-27b"; "qwen/qwen3-32b" is deprecated (404). Both are     */
/* mapped so an old env var never produces model_not_found again.         */
/* ------------------------------------------------------------------ */
const MODEL_ALIAS: Record<string, string> = {
  "qwen/qwen3-8b-27b": "qwen/qwen3.8-27b",
  "qwen3-8b-27b": "qwen/qwen3.8-27b",
  "qwen/qwen3-8b": "qwen/qwen3.8-27b",
  "qwen/qwen3-32b": "qwen/qwen3.8-27b",
  "gpt-oss-120b": "openai/gpt-oss-120b",
  "gpt-oss-20b": "openai/gpt-oss-20b",
};
export function resolveModel(m: string) {
  const k = (m || "").trim();
  return MODEL_ALIAS[k] ?? MODEL_ALIAS[k.toLowerCase()] ?? k;
}

/** reasoning_effort per Groq docs: gpt-oss & qwen3.8 accept low|medium|high. Others: omit (sending it = HTTP 400). */
function reasoningFor(model: string): "medium" | undefined {
  return /gpt-oss|qwen3\.8|muse-spark/i.test(model) ? "medium" : undefined;
}

/** Strip <think>…</think> blocks some reasoning models emit inline. */
function stripThink(s: string) {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
}

/** groq-sdk wants the host root (it appends /openai/v1/...). Passing ".../openai/v1" doubled the path → 404. */
function sdkBase() {
  return cfg.groqBase().replace(/\/openai\/v1$/i, "");
}
let _client: Groq | null = null;
let _clientKey = "";
function client(): Groq {
  const key = cfg.groqKey();
  if (!_client || _clientKey !== key) {
    _client = new Groq({ apiKey: key, baseURL: sdkBase(), maxRetries: 1, timeout: 60_000 });
    _clientKey = key;
  }
  return _client;
}

/**
 * Live list of active model ids — fetched from Groq's /models endpoint on EVERY call (no cache),
 * so retired ids are skipped instead of 404-ing. Returns null when the list is unreachable;
 * callers then simply try the configured chain in order.
 */
export async function activeModels(): Promise<Set<string> | null> {
  if (!cfg.groqKey()) return null;
  try {
    const r = await client().models.list();
    const ids = new Set((r.data ?? []).map((m) => m.id));
    return ids.size ? ids : null;
  } catch {
    return null;
  }
}

/** Last-resort chain (heavy → mid → light) used whenever a chain would otherwise be empty. */
export function defaultChain(): string[] {
  return [...new Set([cfg.groqModelHeavy(), cfg.groqModelMid(), cfg.groqModelLight()].map(resolveModel).filter(Boolean))];
}

/**
 * Build the ordered model chain for one call. It NEVER collapses to an empty list:
 *   1. requested models (de-duplicated, aliases resolved, order preserved: heavy → mid → light)
 *   2. when the live /models list is known, keep the ones that are live
 *   3. if none of them are live, fall through the full configured chain heavy → mid → light
 *      (each is still attempted sequentially — a stale /models answer must never block a call)
 */
export function buildModelChain(models: string[], live: Set<string> | null): string[] {
  let list = [...new Set(models.filter(Boolean).map(resolveModel))];
  if (!list.length) list = defaultChain();
  if (live) {
    const ok = list.filter((m) => live.has(m));
    if (ok.length) return ok;
    const fallback = defaultChain().filter((m) => live.has(m));
    if (fallback.length) return fallback;
  }
  return list.length ? list : ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
}

function errStatus(e: unknown): number {
  const st = (e as { status?: number })?.status;
  if (typeof st === "number") return st;
  if ((e as Error)?.name === "AbortError" || /abort|timeout/i.test(String((e as Error)?.message))) return 504;
  return 502;
}

/**
 * One Groq chat completion, written exactly like the reference groq-sdk snippet:
 *   { messages, model, temperature, max_completion_tokens, top_p: 1, stream: true, reasoning_effort: "medium", stop: null }
 * - text calls stream and concatenate chunk.choices[0].delta.content
 * - JSON calls use response_format json_object (Groq does not allow JSON mode + streaming → stream:false);
 *   on 400 json_validate_failed they retry once as plain streamed text and the JSON is parsed out.
 * - HTTP 200 with empty content (reasoning ate the budget, finish_reason "length") is now an error so the
 *   chain falls through to the next model instead of silently returning "".
 */
export async function chat(o: ChatOpts): Promise<string> {
  const key = cfg.groqKey();
  if (!key) throw new GroqError(503, "GROQ_API_KEY not configured");
  const model = resolveModel(o.model);
  const effort = reasoningFor(model);
  const base = {
    model,
    messages: [
      { role: "system" as const, content: o.system },
      { role: "user" as const, content: o.user },
    ],
    temperature: o.temperature ?? 1,
    max_completion_tokens: Math.max(2048, o.maxTokens ?? 2048),
    top_p: 1,
    stop: null,
    ...(effort ? { reasoning_effort: effort } : {}),
  };
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(45_000, o.timeoutMs ?? 45_000));
  const fail = (status: number, msg: string, http?: number) => {
    void logRun({ surface: "llm", purpose: o.purpose, status: "error", latency_ms: Date.now() - t0, meta: { model, http: http ?? status, error: msg.slice(0, 200) } });
    return new GroqError(status, `groq ${status} (${model}): ${msg.slice(0, 240)}`);
  };

  const streamText = async (): Promise<{ text: string; finish: string | null; usage: unknown }> => {
    const stream = await client().chat.completions.create({ ...base, stream: true }, { signal: ctrl.signal });
    let text = "";
    let finish: string | null = null;
    let usage: unknown = null;
    for await (const chunk of stream) {
      text += chunk.choices[0]?.delta?.content || "";
      finish = chunk.choices[0]?.finish_reason ?? finish;
      const xu = (chunk as unknown as { x_groq?: { usage?: unknown } }).x_groq?.usage;
      if (xu) usage = xu;
    }
    return { text, finish, usage };
  };

  try {
    let text = "";
    let finish: string | null = null;
    let usage: unknown = null;
    if (o.json) {
      try {
        const r = await client().chat.completions.create({ ...base, stream: false, response_format: { type: "json_object" } }, { signal: ctrl.signal });
        text = r.choices[0]?.message?.content ?? "";
        finish = r.choices[0]?.finish_reason ?? null;
        usage = r.usage ?? null;
      } catch (e) {
        const st = errStatus(e);
        const msg = String((e as Error).message ?? e);
        if (st === 400 && /json_validate_failed|json|response_format/i.test(msg)) {
          ({ text, finish, usage } = await streamText()); // retry once without JSON mode
        } else throw e;
      }
    } else {
      ({ text, finish, usage } = await streamText());
    }
    const out = stripThink(text);
    if (!out) throw fail(502, `empty completion (finish_reason=${finish ?? "?"})`, 200);
    void logRun({ surface: "llm", purpose: o.purpose, latency_ms: Date.now() - t0, meta: { model, finish, usage } });
    return out;
  } catch (e) {
    if (e instanceof GroqError) throw e;
    throw fail(errStatus(e), String((e as Error).message ?? e));
  } finally {
    clearTimeout(timer);
  }
}

/** chat() with sequential model fall-through (heavy → mid → light) — used by every call site. */
async function chatChain(models: string[], o: Omit<ChatOpts, "model">): Promise<string> {
  let last: unknown;
  const list = buildModelChain(models, await activeModels());
  for (const m of list) {
    try {
      return await chat({ ...o, model: m });
    } catch (e) {
      last = e;
      if (e instanceof GroqError && (e.status === 503 || e.status === 401 || e.status === 403)) break; // no / bad key
    }
  }
  throw last ?? new GroqError(500, "no model available");
}

function parseJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

/* ================================================================== */
/* Intent NLU                                                          */
/* ================================================================== */
const SCHEME_IDS = SCHEMES.map((s) => s.id) as [string, ...string[]];

export const SubQuerySchema = z.object({
  scheme_id: z.enum(SCHEME_IDS),
  task: z.enum(["info", "status", "land", "price", "deadline"]),
  personal: z.boolean().default(false),
  note: z.string().max(240).optional().nullable(),
});

export const IntentSchema = z.object({
  language: z.string().default("en"),
  state_code: z.string().nullable().default(null),
  district: z.string().nullable().default(null),
  persona: z.string().nullable().default(null),
  commodity: z.string().nullable().default(null),
  identifiers: z.record(z.string()).default({}),
  sub_queries: z.array(SubQuerySchema).max(8).default([]),
  english_query: z.string().default(""),
  follow_up: z.boolean().default(false),
});
export type Intent = z.infer<typeof IntentSchema>;
export type SubQuery = z.infer<typeof SubQuerySchema>;

const NLU_SYSTEM = `You are LokMitra's intent router for Indian government-scheme help.
Return ONLY a JSON object with keys:
language (one of: ${LANG_CODES.join(",")}), state_code (2-letter Indian state code like MH, UP, BR, TN or null; "IN" for central),
district (string|null), persona (farmer|worker|student|woman|elderly|msme|general|null), commodity (english crop name|null),
identifiers (object of user-supplied ids, keys among reg_no, application_no, application_id, mobile_or_aadhaar, uan, udyam_no, account_no, khasra_no, village, tehsil — ONLY if literally present),
sub_queries (array of {scheme_id, task, personal, note}), english_query (faithful English translation of the user's message), follow_up (boolean: is this a follow-up to a previous answer like "how do I do eKYC").
scheme_id must be one of: ${SCHEME_IDS.join(", ")}.
task: info (eligibility/benefits/how to apply), status (MY application/payment status — personal), land (land record lookup), price (mandi prices), deadline (last date / new circulars).
personal=true only when the user wants THEIR OWN record (status, land record) which needs their identifiers.
persona describes the ASKER from their own self-description ("I am a student") — NEVER infer it from a scheme name (PM-KISAN in the question does not make the asker a farmer).
follow_up=true ONLY for messages that name no scheme and depend on the previous answer; any message naming a scheme is a NEW question.
Split multi-domain questions into multiple sub_queries. If unsure which scheme, use "myscheme" with task "info".`;

export async function parseIntent(text: string, hint: { language?: string | null; state_code?: string | null; district?: string | null } = {}): Promise<{ intent: Intent; via: "groq" | "heuristic" }> {
  if (cfg.groqKey()) {
    try {
      const raw = await chatChain([cfg.groqModelHeavy(), cfg.groqModelMid(), cfg.groqModelLight()], {
        purpose: "nlu",
        system: NLU_SYSTEM,
        user: `User profile hint: ${JSON.stringify(hint)}\nUser message: """${text.slice(0, 2000)}"""`,
        json: true,
        temperature: 0,
        maxTokens: 900,
      });
      const parsed = IntentSchema.safeParse(normaliseIntent(parseJson(raw) ?? {}));
      if (parsed.success && parsed.data.sub_queries.length) {
        const merged = mergeHints(parsed.data, text, hint);
        return { intent: merged, via: "groq" };
      }
    } catch (e) {
      console.warn("[lokmitra:nlu] groq failed, using heuristic:", (e as Error).message);
    }
  }
  return { intent: heuristicIntent(text, hint), via: "heuristic" };
}

function normaliseIntent(o: Record<string, unknown>) {
  const subs = Array.isArray(o.sub_queries) ? (o.sub_queries as Record<string, unknown>[]) : [];
  return {
    ...o,
    language: LANG_CODES.includes(String(o.language)) ? o.language : "en",
    state_code: typeof o.state_code === "string" && o.state_code ? String(o.state_code).toUpperCase().slice(0, 3) : null,
    identifiers: o.identifiers && typeof o.identifiers === "object" ? Object.fromEntries(Object.entries(o.identifiers as Record<string, unknown>).filter(([, v]) => typeof v === "string" && v)) : {},
    sub_queries: subs
      .filter((s) => SCHEME_IDS.includes(String(s.scheme_id)))
      .map((s) => ({ ...s, task: ["info", "status", "land", "price", "deadline"].includes(String(s.task)) ? s.task : "info", personal: s.personal === true }))
      .slice(0, 8),
  };
}

function mergeHints(i: Intent, text: string, hint: { language?: string | null; state_code?: string | null; district?: string | null }): Intent {
  const h = heuristicIntent(text, hint);
  return {
    ...i,
    language: i.language || h.language,
    state_code: i.state_code || h.state_code,
    district: i.district || h.district,
    commodity: i.commodity || h.commodity,
    identifiers: { ...h.identifiers, ...i.identifiers },
    sub_queries: dedupeSubs(i.sub_queries),
  };
}

function dedupeSubs(s: SubQuery[]) {
  const seen = new Set<string>();
  return s.filter((q) => {
    const k = `${q.scheme_id}:${q.task}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Deterministic keyword NLU — used when Groq is missing/down. */
export function heuristicIntent(text: string, hint: { language?: string | null; state_code?: string | null; district?: string | null } = {}): Intent {
  const t = text || "";
  const language = guessLanguage(t, hint.language || "en");
  let state_code: string | null = hint.state_code || null;
  let district: string | null = hint.district || null;
  for (const d of DISTRICT_HINTS)
    if (d.re.test(t)) {
      state_code = d.state;
      district = d.district;
      break;
    }
  if (!state_code) for (const s of STATE_NAME_HINTS) if (s.re.test(t)) (state_code = s.state);
  const commodity = COMMODITIES.find((c) => c.re.test(t))?.en ?? null;
  const statusWords = /status|स्थिति|sthiti|approved|kist aayi|paisa aaya|my application|mera|meri|मेरा|मेरी|check my|installment|किस्त|kist/i;
  const deadlineWords = /last date|deadline|antim tithi|अंतिम तिथि|kab tak|circular|naya kya|नया क्या|new update|update/i;
  const subs: SubQuery[] = [];
  // Task words are scoped to the clause that mentions the scheme, so "…PM-KISAN status, … Ayushman mein naya kya"
  // does not turn every scheme into a "deadline" lookup.
  const clauses = t.split(/[,;.?!\n।]+|\s+(?:aur|and|तथा|और|व)\s+/i).map((c) => c.trim()).filter(Boolean);
  const scopeFor = (s: (typeof SCHEMES)[number]) => {
    const own = clauses.filter((c) => s.keywords.test(c));
    return own.length ? own.join(" , ") : t;
  };
  for (const s of SCHEMES) {
    if (!s.keywords.test(t)) continue;
    const scope = scopeFor(s);
    let task: TaskKind = "info";
    if (s.id === "mandi") task = "price";
    else if (s.id === "bhulekh") task = "land";
    else if (deadlineWords.test(scope) && !statusWords.test(scope)) task = "deadline";
    else if (statusWords.test(scope) && s.statusUrl) task = "status";
    subs.push({ scheme_id: s.id, task, personal: task === "status" || task === "land", note: null });
  }
  if (commodity && !subs.some((s) => s.scheme_id === "mandi")) subs.push({ scheme_id: "mandi", task: "price", personal: false, note: null });
  if (!subs.length) subs.push({ scheme_id: "myscheme", task: "info", personal: false, note: null });
  const identifiers: Record<string, string> = {};
  const reg = t.match(/\b([A-Z]{2}\d{9,12})\b/i);
  if (reg) identifiers.reg_no = reg[1].toUpperCase();
  const mob = t.match(/\b([6-9]\d{9})\b/);
  if (mob) identifiers.mobile_or_aadhaar = mob[1];
  const kh = t.match(/(?:khasra|survey|गट|खसरा)\s*(?:no\.?|number|नंबर)?\s*[:#-]?\s*(\d+[\/\d-]*)/i);
  if (kh) identifiers.khasra_no = kh[1];
  const persona = personaFromText(t) ?? (/kisan|farmer|किसान|शेतकरी|खेती/i.test(stripSchemeNames(t))
    ? "farmer"
    : /student|scholar|छात्र|beta|beti/i.test(t)
      ? "student"
      : /majdoor|worker|shramik|मजदूर|labour/i.test(t)
        ? "worker"
        : /widow|mahila|woman|महिला|विधवा/i.test(t)
          ? "woman"
          : /pension|बुजुर्ग|old age/i.test(t)
            ? "elderly"
            : /dukaan|business|msme|udyam/i.test(t)
              ? "msme"
              : null);
  return {
    language,
    state_code,
    district,
    persona,
    commodity,
    identifiers,
    sub_queries: dedupeSubs(subs).slice(0, 8),
    english_query: t,
    // a follow-up only when the message names no scheme of its own (otherwise it is a NEW question → full live pipeline)
    follow_up: /kaise|how (do|to)|कैसे|ab kya|aur batao|tell me more|what about that/i.test(t) && !SCHEMES.some((s) => s.keywords.test(t)) && !commodity,
  };
}

/* ================================================================== */
/* Translation / localisation                                          */
/* ================================================================== */
export async function translate(text: string, target: string, opts: { source?: string; purpose?: string } = {}): Promise<{ text: string; via: "groq" | "none" }> {
  if (!text.trim()) return { text, via: "none" };
  const lang = langByCode(target);
  if (target === (opts.source ?? "en") || !cfg.groqKey()) return { text, via: "none" };
  try {
    const out = await chatChain(translateModels(), {
      purpose: opts.purpose ?? "translate",
      system: `You are a careful translator for Indian citizens with low literacy. Translate the user's text into ${lang.name} (${lang.native}) using simple, everyday, respectful spoken ${lang.name}. Keep scheme names (PM-KISAN, Ayushman, eKYC), numbers, ₹ amounts, URLs, phone numbers and markdown formatting unchanged. Output ONLY the translation.`,
      user: text.slice(0, 8000),
      temperature: 0.1,
      maxTokens: 2400,
      timeoutMs: 30_000,
    });
    return { text: out || text, via: "groq" };
  } catch (e) {
    console.warn("[lokmitra:translate]", (e as Error).message);
    return { text, via: "none" };
  }
}

/**
 * Translation chain models, in order: GROQ_MODEL_TRANSLATE (default qwen/qwen3.8-27b — Groq's id for the spec's qwen3-8b-27b),
 * then the light model, then gpt-oss-20b / 120b (retired ids are skipped via the live /models list, fetched fresh on every call). The first one that answers wins,
 * so a renamed/retired model id never breaks localisation.
 */
export function translateModels() {
  const t = [...new Set([cfg.groqModelTranslate(), cfg.groqModelLight(), cfg.groqModelMid(), cfg.groqModelHeavy()].map(resolveModel).filter(Boolean))];
  return t.length ? t : [...defaultChain()].reverse();
}

/** Batched translation of many short strings in ONE Groq call (JSON in / JSON out, order preserved). */
export async function translateBatch(texts: string[], target: string, opts: { purpose?: string } = {}): Promise<{ texts: string[]; via: "groq" | "none"; model?: string }> {
  const clean = texts.map((t) => String(t ?? ""));
  if (target === "en" || !cfg.groqKey() || !clean.some((t) => t.trim())) return { texts: clean, via: "none" };
  const lang = langByCode(target);
  const out = [...clean];
  // keep each request small enough for fast models: ~6k chars per chunk
  const chunks: number[][] = [];
  let cur: number[] = [];
  let size = 0;
  clean.forEach((t, i) => {
    if (size + t.length > 6000 && cur.length) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(i);
    size += t.length;
  });
  if (cur.length) chunks.push(cur);
  let usedModel: string | undefined;
  let any = false;
  for (const idxs of chunks) {
    const payload = Object.fromEntries(idxs.map((i, k) => [String(k), clean[i]]));
    let last: unknown;
    const chain = buildModelChain(translateModels(), await activeModels());
    for (const m of chain) {
      try {
        const raw = await chat({
          model: m,
          purpose: opts.purpose ?? "translate_batch",
          system: `Translate every JSON value into simple, respectful, everyday spoken ${lang.name} (${lang.native}) for a low-literacy Indian citizen. Keep scheme names (PM-KISAN, Ayushman, eKYC, e-Shram, PMFBY, NSP), numbers, ₹ amounts, dates, URLs, phone numbers and emoji unchanged. Return ONLY a JSON object with the SAME keys.`,
          user: JSON.stringify(payload),
          json: true,
          temperature: 0.1,
          maxTokens: 4000,
          timeoutMs: 35_000,
        });
        const j = parseJson<Record<string, unknown>>(raw);
        if (!j) throw new GroqError(502, "translation returned non-JSON");
        idxs.forEach((i, k) => {
          const v = j[String(k)];
          if (typeof v === "string" && v.trim()) out[i] = v.trim();
        });
        usedModel = m;
        any = true;
        break;
      } catch (e) {
        last = e;
        if (e instanceof GroqError && (e.status === 503 || e.status === 401 || e.status === 403)) break;
      }
    }
    if (!any && last) console.warn("[lokmitra:translateBatch]", (last as Error).message);
  }
  return { texts: out, via: any ? "groq" : "none", model: usedModel };
}

/** Small JSON helper (heavy → mid → light) that never throws; returns null when Groq is missing/down. */
export async function chatJson<T>(o: { system: string; user: string; purpose: string; maxTokens?: number }): Promise<T | null> {
  if (!cfg.groqKey()) return null;
  try {
    const raw = await chatChain([cfg.groqModelHeavy(), cfg.groqModelMid(), cfg.groqModelLight()], { ...o, json: true, temperature: 0.1, maxTokens: o.maxTokens ?? 400, timeoutMs: 20_000 });
    return parseJson<T>(raw);
  } catch {
    return null;
  }
}

/* ================================================================== */
/* Synthesis — merge per-scheme results into a Citizen Benefit Report  */
/* ================================================================== */
export interface SectionInput {
  scheme_id: string;
  scheme_name: string;
  task: string;
  status: "ok" | "partial" | "agent_live" | "needs_otp" | "error" | "skipped";
  data: unknown;
  sources: string[];
  diy: string[];
  benefit?: string;
}

export async function synthesize(input: { query: string; intent: Intent; sections: SectionInput[] }): Promise<{ summary_en: string; via: "groq" | "template" }> {
  if (cfg.groqKey()) {
    try {
      const compact = input.sections.map((s) => ({
        scheme: s.scheme_name,
        task: s.task,
        status: s.status,
        benefit: s.benefit,
        data: clip(JSON.stringify(s.data ?? null), 3500),
        sources: s.sources.slice(0, 4),
        diy: s.diy,
      }));
      const out = await chatChain([cfg.groqModelHeavy(), cfg.groqModelMid()], {
        purpose: "synthesis",
        system: `You write a short "Citizen Benefit Report" for a rural Indian citizen (low digital literacy) in plain English (it will be translated later).
Rules: use ONLY the facts provided — never invent amounts, dates, statuses or URLs. If data is missing say so and give the do-it-yourself steps.
Format (markdown): one line greeting; then one "### <Scheme>" section per scheme with 2-5 bullet points (what we found · eligibility match/contradiction · next action). Mention when a guideline/portal contradiction is visible.
End with "### Next steps" (max 4 numbered actions, e.g. complete eKYC, visit CSC for bank seeding) and "Sources:" listing official URLs. Keep under 350 words.`,
        user: JSON.stringify({ question: input.query, english: input.intent.english_query, state: input.intent.state_code, district: input.intent.district, persona: input.intent.persona, results: compact }),
        temperature: 0.2,
        maxTokens: 1500,
        timeoutMs: 40_000,
      });
      if (out) return { summary_en: out, via: "groq" };
    } catch (e) {
      console.warn("[lokmitra:synthesis]", (e as Error).message);
    }
  }
  return { summary_en: templateReport(input.sections), via: "template" };
}

export function templateReport(sections: SectionInput[]): string {
  const lines: string[] = ["Namaste Here is what LokMitra found for you:"];
  for (const s of sections) {
    lines.push(`\n### ${s.scheme_name}`);
    if (s.benefit) lines.push(`- Benefit: ${s.benefit}`);
    const d = s.data as Record<string, unknown> | null;
    if (s.status === "agent_live") lines.push("- A live TinyFish agent is checking this on the official portal right now — the result is added to your report as soon as it finishes.");
    else if (s.status === "needs_otp") lines.push("- The portal sent an OTP to your registered mobile. Please share it to continue.");
    else if (s.status === "error") lines.push("- We could not reach the official portal right now.");
    if (d && typeof d === "object") {
      for (const k of ["registration_status", "ekyc_status", "deadline", "benefit", "helpline"]) if (d[k]) lines.push(`- ${k.replace(/_/g, " ")}: ${String(d[k])}`);
      const elig = d.eligibility as string[] | undefined;
      if (Array.isArray(elig) && elig.length) lines.push(`- Eligibility: ${elig.slice(0, 4).join("; ")}`);
      const prices = d.prices as { market: string; modal_price?: string | null; unit?: string | null }[] | undefined;
      if (d.typical_price) lines.push(`- Typical price: ${String(d.typical_price)}`);
      if (Array.isArray(prices)) prices.slice(0, 5).forEach((p) => lines.push(`- ${p.market}: ₹${p.modal_price ?? "?"} ${p.unit ?? ""}`));
      const ex = d.excerpt as string | undefined;
      if (ex) lines.push(`- From the official page: ${clip(ex, 260)}`);
    }
    s.diy.slice(0, 3).forEach((x) => lines.push(`- Do it yourself: ${x}`));
    if (s.sources.length) lines.push(`- Source: ${s.sources[0]}`);
  }
  return lines.join("\n");
}

/* ================================================================== */
/* Direct answer — obeys the citizen's own constraints (yes/no, brief, */
/* in-depth, list, word limits, focus) and is grounded in the LIVE      */
/* TinyFish Search + Fetch evidence gathered for THIS question.         */
/* ================================================================== */
export interface AnswerInput {
  question: string;
  english_query: string;
  language: string;
  constraints: QueryConstraints;
  items: { scheme: string; task: string; verdict: string; reasons: string[]; facts: string[]; status: string; sources: string[] }[];
  evidence: { url: string; text: string }[];
}

const STYLE_RULE: Record<QueryConstraints["style"], string> = {
  binary: 'The user demanded a yes/no answer. Reply with exactly "Yes." or "No." (or "Depends." only if truly undecidable), optionally followed by ONE short clause (max 12 words) saying why. Nothing else.',
  brief: "Reply in 1-2 short sentences. No headings, no lists.",
  normal: "Reply in 2-4 short sentences answering exactly what was asked. No greeting, no filler.",
  list: "Reply as a short numbered list (max 6 items, each under 15 words) covering exactly what was asked.",
  detailed: "The user asked for depth: give a compact structured answer with short markdown headings only for the parts they asked about (e.g. Verdict, Benefit, Eligibility, Exclusions, Documents, How to apply, Helpline). Bullets under 18 words each.",
};

export async function answerQuestion(a: AnswerInput): Promise<{ answer_en: string; answer_local: string; model?: string } | null> {
  if (!cfg.groqKey()) return null;
  const c = a.constraints;
  const lang = langByCode(a.language);
  const evidence = a.evidence.map((e) => `## ${e.url}\n${clip(e.text.replace(/\n{2,}/g, "\n"), c.style === "detailed" ? 2600 : 1600)}`).join("\n\n").slice(0, c.style === "detailed" ? 9000 : 6000);
  const system = `You are LokMitra, an Indian government-scheme assistant. Answer the citizen's EXACT question, obeying their explicit instructions above all else.
Style: ${STYLE_RULE[c.style]}
Hard limit: ${c.max_words} words per answer. Short, concise, crisp — never long.
Focus only on: ${c.focus.join(", ")}.${c.persona ? ` The asker is a ${c.persona}; judge eligibility for THAT person (e.g. a student is not a landholding farmer unless they say so).` : ""}
Ground every fact in the LIVE EVIDENCE (official pages fetched just now) or the CHECKED FACTS; never invent amounts, dates, URLs. If evidence is silent, say so briefly.
Return ONLY JSON {"answer_en": string, "answer_local": string} — answer_local is the same answer in ${lang.name} (${lang.native}); if the language is English, repeat answer_en.`;
  const user = JSON.stringify({ question: a.question, english: a.english_query, explicit_instructions: c.instructions, checked_facts: a.items, live_evidence: evidence });
  try {
    const raw = await chatChain([cfg.groqModelHeavy(), cfg.groqModelMid(), cfg.groqModelLight()], { purpose: `answer_${c.style}`, system, user, json: true, temperature: 0.2, maxTokens: c.style === "detailed" ? 1400 : 700, timeoutMs: 35_000 });
    const j = parseJson<{ answer_en?: string; answer_local?: string }>(raw);
    const en = String(j?.answer_en ?? "").trim();
    if (!en) return null;
    const local = String(j?.answer_local ?? "").trim() || en;
    const cap = c.max_words + (c.style === "binary" ? 12 : 10);
    return { answer_en: capWords(en, cap), answer_local: a.language === "en" ? capWords(en, cap) : capWords(local, cap * 2) };
  } catch (e) {
    console.warn("[lokmitra:answer]", (e as Error).message);
    return null;
  }
}

/** Answer a follow-up ("ab eKYC kaise karein?") grounded in the previous report. */
export async function followUp(question: string, context: string, language: string, constraints?: QueryConstraints): Promise<string | null> {
  if (!cfg.groqKey()) return null;
  const c = constraints;
  try {
    const out = await chatChain([cfg.groqModelMid(), cfg.groqModelHeavy()], {
      purpose: "follow_up",
      system: `You are LokMitra, a patient government-scheme helper. Answer the follow-up using the previous report as context plus well-known official procedures. Be concrete (portal path, documents, CSC, helpline). If unsure, say so. Obey the user's explicit instructions${c?.instructions.length ? ` (${c.instructions.join("; ")})` : ""}${c?.style === "binary" ? '; reply "Yes." or "No." plus at most one short clause' : ""}. Reply in ${langByCode(language).name}, simple words, short and crisp, max ${c?.max_words ?? 80} words.`,
      user: `Previous report:\n${context.slice(0, 5000)}\n\nFollow-up: ${question}`,
      temperature: 0.2,
      maxTokens: 700,
    });
    return c ? capWords(out, c.max_words + 10) : out;
  } catch {
    return null;
  }
}

/* ================================================================== */
/* Structured extraction from fetched markdown (free path)             */
/* ================================================================== */
export async function extractFromMarkdown<T>(opts: { markdown: string; schemaHint: string; question: string; purpose: string }): Promise<T | null> {
  if (!cfg.groqKey()) return null;
  try {
    const raw = await chatChain([cfg.groqModelMid(), cfg.groqModelHeavy(), cfg.groqModelLight()], {
      purpose: opts.purpose,
      system: `Extract facts from official Indian government web page text. Return ONLY JSON matching: ${opts.schemaHint}. Use null/[] when the page does not say. Never invent.`,
      user: `Question: ${opts.question}\n\nPAGE TEXT:\n${opts.markdown.slice(0, 14000)}`,
      json: true,
      temperature: 0,
      maxTokens: 1400,
      timeoutMs: 30_000,
    });
    return parseJson<T>(raw);
  } catch {
    return null;
  }
}

/* ================================================================== */
/* Speech-to-text (Telegram voice notes) — Groq Whisper                */
/* Web uses the browser's native Web Speech API instead.               */
/* ================================================================== */
export async function transcribe(audio: Blob, filename: string, languageHint?: string | null): Promise<string | null> {
  if (!cfg.groqKey()) return null;
  const t0 = Date.now();
  try {
    const file = await toFile(Buffer.from(await audio.arrayBuffer()), filename || "voice.ogg", { type: audio.type || "audio/ogg" });
    const r = await client().audio.transcriptions.create({
      file,
      model: cfg.groqModelStt(),
      response_format: "json",
      ...(languageHint && /^[a-z]{2}$/.test(languageHint) ? { language: languageHint } : {}),
    });
    void logRun({ surface: "llm", purpose: "stt", latency_ms: Date.now() - t0, meta: { model: cfg.groqModelStt() } });
    return (r.text ?? "").trim() || null;
  } catch (e) {
    void logRun({ surface: "llm", purpose: "stt", status: "error", latency_ms: Date.now() - t0, meta: { model: cfg.groqModelStt(), http: errStatus(e) } });
    return null;
  }
}
