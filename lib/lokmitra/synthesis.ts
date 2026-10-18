import "server-only";
import { cfg } from "./config";
import { db, safe, type Row } from "./db";
import { alsoEligible, eligibility, profileFromText, reportSector, SECTOR_ICON, type ReportSector } from "./eligibility";
import { factCheck, factCheckPages, type FactResult } from "./facts";
import { glossaryLang } from "./glossary";
import { chatJson, translateBatch, type Intent, type SectionInput } from "./groq";
import { listSentinels } from "./sentinel";
import { schemeById } from "./schemes";
import { clip, hostOf } from "./util";
import { reportToMarkdown, type Contradiction, type KeyFact, type NextStep, type ReportItem, type SentinelFact, type StructuredReport } from "./report-shape";

/**
 * P4 — Synthesis: merges every per-scheme result into ONE structured, sector-grouped,
 * contradiction-aware Citizen Benefit Report:
 *   sectors (agri / health / edu / land / labour / MSME / welfare) → items with persona
 *   eligibility verdict + reasons, key facts, deterministic guideline fact-check,
 *   also-eligible discovery, guideline-vs-portal + sentinel contradictions, Monitor
 *   sentinel facts and prioritised next steps.
 * Everything here is deterministic and free; Groq (optional) only writes a one-line
 * headline and the translation chain localises free text (labels come from the offline glossary).
 */

export interface SynthSection extends SectionInput {
  cache: "hit" | "miss";
  portal_state: string;
  confirm?: { confirm_id: string; est_steps: number; est_cost_usd: number; entry_url: string; requires_otp: boolean | null };
  pages?: { url: string; text: string }[];
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v));
const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(str).filter(Boolean) : []);

function keyFacts(s: SynthSection): KeyFact[] {
  const d = (s.data ?? {}) as Record<string, unknown>;
  const out: KeyFact[] = [];
  if (s.task === "price") {
    if (d.typical_price) out.push({ key: "price", value: str(d.typical_price) });
    const prices = Array.isArray(d.prices) ? (d.prices as Record<string, unknown>[]) : [];
    prices.slice(0, 3).forEach((p) => out.push({ key: "price", value: `${str(p.market)}${p.district ? ` (${str(p.district)})` : ""}: ₹${str(p.modal_price) || "?"} ${str(p.unit) || "/quintal"}${p.min_price ? ` · min ₹${str(p.min_price)} max ₹${str(p.max_price)}` : ""}${p.date ? ` · ${str(p.date)}` : ""}` }));
    return out;
  }
  const benefit = str(d.benefit) || s.benefit || "";
  if (benefit) out.push({ key: "benefit", value: clip(benefit, 220) });
  const elig = arr(d.eligibility);
  if (elig.length) out.push({ key: "eligibility", value: clip(elig.slice(0, 3).join("; "), 260) });
  const docs = arr(d.documents_required);
  if (docs.length) out.push({ key: "documents", value: clip(docs.slice(0, 5).join(", "), 200) });
  const deadline = str(d.deadline) || str(d.latest_notice_title);
  if (deadline) out.push({ key: "deadline", value: clip(`${deadline}${d.latest_notice_date ? ` (${str(d.latest_notice_date)})` : ""}`, 200) });
  if (d.what_changed) out.push({ key: "status", value: clip(str(d.what_changed), 220) });
  if (d.helpline) out.push({ key: "helpline", value: clip(str(d.helpline), 80) });
  if (!elig.length && d.excerpt && s.status !== "error") out.push({ key: "eligibility", value: clip(str(d.excerpt).replace(/\s+/g, " "), 260) });
  return out;
}

function helplineFromFacts(fc: FactResult[]) {
  return fc.find((f) => f.fact_id.endsWith("helpline") && f.status === "confirmed")?.found ?? null;
}

async function sentinelFacts(schemeIds: string[], state: string | null): Promise<SentinelFact[]> {
  const rows = (await listSentinels()).filter((s) => schemeIds.includes(s.scheme_id) && (s.state_code === "IN" || s.state_code === state));
  if (!rows.length) return [];
  const out: SentinelFact[] = [];
  for (const s of rows.slice(0, 6)) {
    const ev = await safe(db.select<Row>("monitor_events", { eq: { monitor_id: s.monitor_id }, order: { col: "created_at" }, limit: 5 }), []);
    const withText = ev.find((e) => typeof (e.payload as Row | undefined)?.excerpt === "string" && String((e.payload as Row).excerpt).length > 60);
    const changed = ev.find((e) => e.changed);
    const excerpt = withText ? String((withText.payload as Row).excerpt) : "";
    out.push({
      monitor_id: s.monitor_id,
      scheme_id: s.scheme_id,
      scheme_name: schemeById(s.scheme_id)?.name ?? s.scheme_id,
      state_code: s.state_code,
      kind: s.kind,
      target: s.target,
      last_run_at: s.last_run_at ?? null,
      summary: changed ? str(changed.summary) : ev[0] ? str(ev[0].summary) || "watching — no change detected yet" : "watching — first scheduled run pending",
      changed: !!changed,
      facts: excerpt && s.kind !== "circular" ? factCheck(s.scheme_id, excerpt, s.target.startsWith("http") ? s.target : null).filter((f) => f.status !== "not_stated") : [],
    });
  }
  return out;
}

function nextStepsFor(items: ReportItem[], contradictions: Contradiction[]): NextStep[] {
  const steps: NextStep[] = [];
  const add = (text: string, priority: number, scheme_id?: string, url?: string | null) => {
    if (!steps.some((s) => s.text === text)) steps.push({ text, priority, scheme_id: scheme_id ?? null, url: url ?? null });
  };
  for (const it of items) {
    const a = it.agent;
    if (a?.blocked_by === "otp") add(`${it.scheme_name}: log in with the OTP sent to your registered mobile (LokMitra OTP relay) to finish the status check.`, 1, it.scheme_id, it.confirm?.entry_url);
    if (it.status === "needs_confirmation" && it.confirm) add(`${it.scheme_name}: confirm the personal check (~${it.confirm.est_steps} agent steps ≈ $${it.confirm.est_cost_usd}) or check it yourself on ${hostOf(it.confirm.entry_url)}.`, 2, it.scheme_id, it.confirm.entry_url);
    if (it.scheme_id === "pm-kisan" && it.verdict === "likely") add("PM-KISAN: make sure eKYC is complete (pmkisan.gov.in → eKYC with Aadhaar OTP, or biometric at a CSC) and your bank account is Aadhaar-seeded.", 2, it.scheme_id, "https://pmkisan.gov.in/");
    if (it.scheme_id === "pmfby" && it.verdict === "likely") add("PMFBY: enrol through your bank / CSC before the season cut-off; report crop loss within 72 hours on helpline 14447.", 3, it.scheme_id, "https://pmfby.gov.in/");
    if (it.scheme_id === "ayushman" && it.verdict !== "unlikely") add("Ayushman: check your name on beneficiary.nha.gov.in with mobile OTP and download the Ayushman card (or ask the Arogya Mitra at an empanelled hospital).", 3, it.scheme_id, "https://beneficiary.nha.gov.in/");
    if (it.scheme_id === "eshram" && it.verdict === "likely") add("e-Shram: register free at eshram.gov.in with your Aadhaar-linked mobile, or visit a CSC with Aadhaar and bank passbook.", 3, it.scheme_id, "https://eshram.gov.in/");
    if (it.scheme_id === "nsp") add("Scholarship: complete One-Time Registration (OTR) on scholarships.gov.in and apply before the deadline.", 3, it.scheme_id, "https://scholarships.gov.in/");
    if (it.status === "error") add(`${it.scheme_name}: the official portal did not respond — ${it.diy[0] ?? "try again later or visit your nearest CSC"}.`, 4, it.scheme_id, it.sources[0] ?? null);
  }
  for (const c of contradictions.slice(0, 2)) add(`Verify "${c.label}" for ${c.scheme_name} on the official portal or helpline before acting — LokMitra saw ${c.portal ? `"${c.portal}"` : "a different value"} instead of the guideline value (${c.guideline}).`, 2, c.scheme_id, c.source);
  if (!steps.length) add("Keep this slip; scan the QR codes to verify on the official portals. LokMitra never asks for money.", 5);
  return steps.sort((a, b) => a.priority - b.priority).slice(0, 6);
}

export async function buildReport(input: { query: string; intent: Intent; sections: SynthSection[]; language: string; agentResults?: Row[] }): Promise<StructuredReport> {
  const { intent, sections } = input;
  const profile = profileFromText(`${input.query} ${intent.english_query}`, intent.persona);
  const items: ReportItem[] = [];
  const contradictions: Contradiction[] = [];

  for (const s of sections) {
    const pages = (s.pages ?? []).filter((p) => p.text && p.text.length > 60);
    const fc = pages.length ? factCheckPages(s.scheme_id, pages) : [];
    const e = eligibility(s.scheme_id, profile);
    const facts = keyFacts(s);
    const help = helplineFromFacts(fc);
    if (help && !facts.some((f) => f.key === "helpline")) facts.push({ key: "helpline", value: help });
    const ar = (input.agentResults ?? []).filter((a) => a.scheme_id === s.scheme_id && a.task === s.task).pop();
    const res = (ar?.result ?? null) as Row | null;
    const item: ReportItem = {
      scheme_id: s.scheme_id,
      scheme_name: s.scheme_name,
      task: s.task,
      sector: reportSector(s.scheme_id),
      status: ar ? (res?.blocked_by && res.blocked_by !== "none" ? (res.blocked_by === "otp" ? "needs_otp" : "partial") : ar.status === "COMPLETED" ? "ok" : "error") : s.status,
      verdict: e.verdict,
      reasons: e.reasons,
      facts,
      fact_check: fc,
      cache: s.cache,
      sources: s.sources.slice(0, 4),
      diy: s.diy,
      confirm: s.confirm ? { confirm_id: s.confirm.confirm_id, est_steps: s.confirm.est_steps, est_cost_usd: s.confirm.est_cost_usd, entry_url: s.confirm.entry_url, requires_otp: s.confirm.requires_otp } : null,
      agent: ar ? { status: str(ar.status), blocked_by: (res?.blocked_by as string) ?? null, registration_status: (res?.registration_status as string) ?? null, cost_usd: Number(ar.cost_usd ?? 0) } : null,
    };
    if (res?.registration_status) item.facts.unshift({ key: "status", value: str(res.registration_status) });
    items.push(item);
    for (const f of fc.filter((x) => x.status === "contradiction")) {
      contradictions.push({ kind: "guideline_vs_portal", scheme_id: s.scheme_id, scheme_name: s.scheme_name, label: f.label, guideline: f.canonical, portal: f.found ?? null, source: f.source ?? null, text: `${s.scheme_name} — ${f.label}: the guideline says ${f.canonical}, but ${f.source ? hostOf(f.source) : "the live page"} shows "${f.found}". ${f.snippet ? `(“${clip(f.snippet, 140)}”)` : ""}`.trim() });
    }
    if (e.verdict === "unlikely" && (s.task === "status" || s.status === "needs_confirmation")) {
      contradictions.push({ kind: "eligibility", scheme_id: s.scheme_id, scheme_name: s.scheme_name, label: "Eligibility", guideline: e.reasons[0] ?? "", portal: null, source: null, text: `${s.scheme_name}: you asked for your status, but by the published criteria you may not be eligible — ${e.reasons[0] ?? ""}` });
    }
  }

  const schemeIds = [...new Set(items.map((i) => i.scheme_id))];
  const sentinel = await safe(sentinelFacts(schemeIds, intent.state_code), []);
  for (const sf of sentinel) {
    for (const f of sf.facts.filter((x) => x.status === "contradiction")) {
      contradictions.push({ kind: "sentinel", scheme_id: sf.scheme_id, scheme_name: sf.scheme_name, label: f.label, guideline: f.canonical, portal: f.found ?? null, source: sf.target, text: `Sentinel (${sf.kind}) on ${hostOf(sf.target) || sf.target}: ${f.label} shows "${f.found}" vs guideline ${f.canonical}.` });
    }
    if (sf.changed && sf.summary && /contradiction/i.test(sf.summary)) contradictions.push({ kind: "sentinel", scheme_id: sf.scheme_id, scheme_name: sf.scheme_name, label: "Monitor diff", guideline: "", portal: null, source: sf.target, text: `Sentinel: ${clip(sf.summary, 260)}` });
  }

  const blocks = new Map<ReportSector, ReportItem[]>();
  for (const it of items) blocks.set(it.sector, [...(blocks.get(it.sector) ?? []), it]);
  const also = alsoEligible(schemeIds, profile, 4);
  const sources = [...new Set(items.flatMap((i) => i.sources).filter((u) => /^https?:\/\//.test(u)))].slice(0, 12);
  const all = items.flatMap((i) => i.fact_check);
  const likely = items.filter((i) => i.verdict === "likely").map((i) => i.scheme_name);
  let headline = `${items.length} request(s) checked across ${blocks.size} sector(s)${likely.length ? ` — likely eligible: ${likely.join(", ")}` : ""}${also.length ? `; ${also.length} more scheme(s) you may qualify for` : ""}${contradictions.length ? `; ${contradictions.length} point(s) to double-check` : ""}.`;

  // Optional Groq headline (grounded in the structured facts only)
  if (cfg.groqKey()) {
    const h = await chatJson<{ headline?: string }>({
      purpose: "synthesis_headline",
      system: "You write ONE plain-English sentence (max 35 words) summarising a citizen's government-scheme report for a low-literacy rural reader. Use ONLY the facts given; never invent numbers. Return JSON {\"headline\": string}.",
      user: JSON.stringify({ persona: intent.persona, state: intent.state_code, items: items.map((i) => ({ scheme: i.scheme_name, verdict: i.verdict, status: i.status, facts: i.facts.slice(0, 3).map((f) => f.value) })), also_eligible: also.map((a) => a.name), contradictions: contradictions.length }),
    });
    if (h?.headline) headline = clip(h.headline, 300);
  }

  const report: StructuredReport = {
    version: 1,
    language: input.language,
    persona: intent.persona,
    state_code: intent.state_code,
    district: intent.district,
    headline,
    sectors: [...blocks.entries()].map(([id, its]) => ({ id, icon: SECTOR_ICON[id], items: its })),
    also_eligible: also,
    contradictions: contradictions.slice(0, 8),
    sentinel,
    next_steps: nextStepsFor(items, contradictions),
    sources,
    stats: { sections: items.length, cache_hits: items.filter((i) => i.cache === "hit").length, cache_misses: items.filter((i) => i.cache === "miss").length, facts_confirmed: all.filter((f) => f.status === "confirmed").length, facts_contradicted: all.filter((f) => f.status === "contradiction").length },
    translation: { via: input.language === "en" ? "none" : "glossary", model: null, glossary_lang: glossaryLang(input.language) },
  };
  return report;
}

/**
 * Translation chain for the structured report: ONE batched Groq call (qwen/qwen3 by default,
 * falling through to gpt-oss) for all free-text strings; headings/labels/verdicts always come
 * from the offline glossary, so the report is localised even with no Groq key.
 */
export async function localizeReport(r: StructuredReport, lang: string): Promise<StructuredReport> {
  if (lang === "en") return r;
  const items = r.sectors.flatMap((s) => s.items);
  const slots: { set: (v: string) => void; text: string }[] = [];
  const push = (text: string | undefined | null, set: (v: string) => void) => {
    if (text && text.trim()) slots.push({ text, set });
  };
  push(r.headline, (v) => (r.headline_local = v));
  for (const it of items) {
    it.reasons_local = [];
    it.diy_local = [];
    it.reasons.forEach((x, i) => push(x, (v) => (it.reasons_local![i] = v)));
    it.diy.slice(0, 2).forEach((x, i) => push(x, (v) => (it.diy_local![i] = v)));
    it.facts.forEach((f) => f.key !== "price" && f.key !== "helpline" && push(f.value, (v) => (f.value_local = v)));
  }
  r.contradictions.forEach((c) => push(c.text, (v) => (c.text_local = v)));
  r.sentinel.forEach((s) => push(s.summary, (v) => (s.summary_local = v)));
  r.next_steps.forEach((n) => push(n.text, (v) => (n.text_local = v)));
  r.also_eligible.forEach((a) => {
    a.reasons_local = [];
    a.reasons.forEach((x, i) => push(x, (v) => (a.reasons_local![i] = v)));
  });
  if (!slots.length) return r;
  const tr = await translateBatch(slots.map((s) => s.text), lang, { purpose: "translate_report" });
  if (tr.via === "groq") {
    tr.texts.forEach((t, i) => t && slots[i].set(t));
    r.translation = { via: "groq", model: tr.model ?? null, glossary_lang: glossaryLang(lang) };
  } else {
    r.translation = { via: "glossary", model: null, glossary_lang: glossaryLang(lang) };
  }
  return r;
}

export function reportMarkdown(r: StructuredReport, lang: string) {
  return { summary_en: reportToMarkdown(r, "en", { local: false }), summary_local: lang === "en" ? reportToMarkdown(r, "en", { local: false }) : reportToMarkdown(r, lang, { local: true }) };
}
