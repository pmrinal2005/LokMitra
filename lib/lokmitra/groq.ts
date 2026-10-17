import "server-only";
import { z } from "zod";
import { cfg } from "./config";
import { guessLanguage, langByCode, LANG_CODES } from "./languages";
import { COMMODITIES, DISTRICT_HINTS, SCHEMES, STATE_NAME_HINTS, type TaskKind } from "./schemes";
import { logRun } from "./store";
import { clip } from "./util";

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

function isQwen(model: string) {
  return /qwen/i.test(model);
}
function isGptOss(model: string) {
  return /gpt-oss/i.test(model);
}

/** Strip <think>…</think> blocks some reasoning models emit inline. */
function stripThink(s: string) {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export async function chat(o: ChatOpts): Promise<string> {
  const key = cfg.groqKey();
  if (!key) throw new GroqError(503, "GROQ_API_KEY not configured");
  const body: Record<string, unknown> = {
    model: o.model,
    temperature: o.temperature ?? 0.2,
    max_completion_tokens: o.maxTokens ?? 1200,
    messages: [
      { role: "system", content: o.system },
      { role: "user", content: o.user },
    ],
  };
  if (o.json) body.response_format = { type: "json_object" };
  if (isQwen(o.model)) body.reasoning_effort = "none"; // qwen3 on Groq: disable thinking for speed
  if (isGptOss(o.model)) body.reasoning_effort = "low";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 25_000);
  const t0 = Date.now();
  try {
    const res = await fetch(`${cfg.groqBase()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      void logRun({ surface: "llm", purpose: o.purpose, status: "error", latency_ms: Date.now() - t0, meta: { model: o.model, http: res.status } });
      throw new GroqError(res.status, `groq ${res.status}: ${text.slice(0, 240)}`);
    }
    const j = JSON.parse(text) as { choices?: { message?: { content?: string } }[]; usage?: Record<string, number> };
    const out = stripThink(j.choices?.[0]?.message?.content ?? "");
    void logRun({ surface: "llm", purpose: o.purpose, latency_ms: Date.now() - t0, meta: { model: o.model, usage: j.usage ?? null } });
    return out;
  } catch (e) {
    if (e instanceof GroqError) throw e;
    throw new GroqError(502, `groq unreachable: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

/** chat() with model fall-through (heavy → mid → light) — used by every call site. */
async function chatChain(models: string[], o: Omit<ChatOpts, "model">): Promise<string> {
  let last: unknown;
  for (const m of [...new Set(models.filter(Boolean))]) {
    try {
      return await chat({ ...o, model: m });
    } catch (e) {
      last = e;
      if (e instanceof GroqError && e.status === 503) break; // no key: no point trying others
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
  for (const s of SCHEMES) {
    if (!s.keywords.test(t)) continue;
    let task: TaskKind = "info";
    if (s.id === "mandi") task = "price";
    else if (s.id === "bhulekh") task = "land";
    else if (deadlineWords.test(t) && !statusWords.test(t)) task = "deadline";
    else if (statusWords.test(t) && s.statusUrl) task = "status";
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
  const persona = /kisan|farmer|किसान|शेतकरी|खेती/i.test(t)
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
              : null;
  return {
    language,
    state_code,
    district,
    persona,
    commodity,
    identifiers,
    sub_queries: dedupeSubs(subs).slice(0, 8),
    english_query: t,
    follow_up: /kaise|how (do|to)|कैसे|ab kya/i.test(t) && subs.length <= 1,
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
    const out = await chatChain([cfg.groqModelTranslate(), cfg.groqModelMid(), cfg.groqModelHeavy()], {
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

/* ================================================================== */
/* Synthesis — merge per-scheme results into a Citizen Benefit Report  */
/* ================================================================== */
export interface SectionInput {
  scheme_id: string;
  scheme_name: string;
  task: string;
  status: "ok" | "partial" | "needs_confirmation" | "needs_otp" | "error" | "skipped";
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
  const lines: string[] = ["Namaste 🙏 Here is what LokMitra found for you:"];
  for (const s of sections) {
    lines.push(`\n### ${s.scheme_name}`);
    if (s.benefit) lines.push(`- Benefit: ${s.benefit}`);
    const d = s.data as Record<string, unknown> | null;
    if (s.status === "needs_confirmation") lines.push("- This check needs your registration details and a paid agent run — reply **CONFIRM** to proceed.");
    else if (s.status === "needs_otp") lines.push("- The portal sent an OTP to your registered mobile. Please share it to continue.");
    else if (s.status === "error") lines.push("- We could not reach the official portal right now.");
    if (d && typeof d === "object") {
      for (const k of ["registration_status", "ekyc_status", "deadline", "benefit", "helpline"]) if (d[k]) lines.push(`- ${k.replace(/_/g, " ")}: ${String(d[k])}`);
      const elig = d.eligibility as string[] | undefined;
      if (Array.isArray(elig) && elig.length) lines.push(`- Eligibility: ${elig.slice(0, 4).join("; ")}`);
      const prices = d.prices as { market: string; modal_price?: string | null; unit?: string | null }[] | undefined;
      if (Array.isArray(prices)) prices.slice(0, 5).forEach((p) => lines.push(`- ${p.market}: ₹${p.modal_price ?? "?"} ${p.unit ?? ""}`));
      const ex = d.excerpt as string | undefined;
      if (ex) lines.push(`- From the official page: ${clip(ex, 260)}`);
    }
    s.diy.slice(0, 3).forEach((x) => lines.push(`- Do it yourself: ${x}`));
    if (s.sources.length) lines.push(`- Source: ${s.sources[0]}`);
  }
  return lines.join("\n");
}

/** Answer a follow-up ("ab eKYC kaise karein?") grounded in the previous report. */
export async function followUp(question: string, context: string, language: string): Promise<string | null> {
  if (!cfg.groqKey()) return null;
  try {
    return await chatChain([cfg.groqModelMid(), cfg.groqModelHeavy()], {
      purpose: "follow_up",
      system: `You are LokMitra, a patient government-scheme helper. Answer the follow-up using the previous report as context plus well-known official procedures. Be concrete (portal path, documents, CSC, helpline). If unsure, say so. Reply in ${langByCode(language).name}, simple words, max 150 words.`,
      user: `Previous report:\n${context.slice(0, 5000)}\n\nFollow-up: ${question}`,
      temperature: 0.2,
      maxTokens: 700,
    });
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
  const key = cfg.groqKey();
  if (!key) return null;
  const fd = new FormData();
  fd.append("file", audio, filename);
  fd.append("model", cfg.groqModelStt());
  fd.append("response_format", "json");
  if (languageHint && /^[a-z]{2}$/.test(languageHint)) fd.append("language", languageHint);
  const t0 = Date.now();
  try {
    const res = await fetch(`${cfg.groqBase()}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
    const j = (await res.json().catch(() => null)) as { text?: string } | null;
    void logRun({ surface: "llm", purpose: "stt", status: res.ok ? "ok" : "error", latency_ms: Date.now() - t0, meta: { model: cfg.groqModelStt() } });
    return res.ok ? (j?.text ?? "").trim() || null : null;
  } catch {
    return null;
  }
}
