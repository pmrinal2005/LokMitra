/**
 * Structured Citizen Benefit Report — shape + renderers (shared client/server, pure).
 * Built by synthesis.ts, rendered by: Sahayak UI cards, printable CSC slip, Resend e-mail,
 * Telegram message and the plain markdown summary (summary_en / summary_local).
 */
import type { AlsoEligible, ReportSector, Verdict } from "./eligibility";
import { SECTOR_ICON, SECTOR_ORDER } from "./eligibility";
import type { FactResult } from "./facts";
import { L, type GlossKey } from "./glossary";

export interface KeyFact {
  key: "benefit" | "deadline" | "helpline" | "price" | "status" | "documents" | "eligibility";
  value: string;
  value_local?: string;
}

export interface ReportItem {
  scheme_id: string;
  scheme_name: string;
  task: string;
  sector: ReportSector;
  status: string; // ok | partial | agent_live | needs_otp | error | skipped
  verdict: Verdict;
  reasons: string[];
  reasons_local?: string[];
  facts: KeyFact[];
  fact_check: FactResult[];
  live?: boolean;
  sources: string[];
  diy: string[];
  diy_local?: string[];
  confirm?: { confirm_id: string; est_steps: number; est_cost_usd: number; entry_url: string; requires_otp: boolean | null } | null;
  agent?: { status: string; blocked_by?: string | null; registration_status?: string | null; cost_usd?: number; kind?: "verify" | "personal"; mode?: string | null; verified?: { label: string; value: string }[]; run_id?: string | null } | null;
}

export interface ReportSectorBlock {
  id: ReportSector;
  icon: string;
  items: ReportItem[];
}

export interface Contradiction {
  kind: "guideline_vs_portal" | "sentinel" | "eligibility";
  scheme_id: string;
  scheme_name: string;
  label: string;
  guideline: string;
  portal: string | null;
  source: string | null;
  text: string;
  text_local?: string;
}

export interface SentinelFact {
  monitor_id: string;
  scheme_id: string;
  scheme_name: string;
  state_code: string;
  kind: string;
  target: string;
  last_run_at: string | null;
  summary: string | null;
  summary_local?: string;
  changed: boolean;
  facts: FactResult[];
}

export interface NextStep {
  text: string;
  text_local?: string;
  scheme_id?: string | null;
  url?: string | null;
  priority: number; // 1 = most urgent
}

/** Direct answer to the citizen's exact question, shaped by their own constraints (yes/no, brief, in-depth…). */
export interface ReportAnswer {
  style: "binary" | "brief" | "normal" | "detailed" | "list";
  focus: string[];
  persona: string | null;
  text: string;
  text_local?: string;
  via: "groq" | "rules";
  model?: string | null;
}

export interface StructuredReport {
  version: 1;
  answer?: ReportAnswer | null;
  language: string;
  persona: string | null;
  state_code: string | null;
  district: string | null;
  headline: string;
  headline_local?: string;
  sectors: ReportSectorBlock[];
  also_eligible: (AlsoEligible & { reasons_local?: string[] })[];
  contradictions: Contradiction[];
  sentinel: SentinelFact[];
  next_steps: NextStep[];
  sources: string[];
  stats: { sections: number; live_sections: number; facts_confirmed: number; facts_contradicted: number };
  translation: { via: "groq" | "glossary" | "none"; model?: string | null; glossary_lang: string };
}

const VERDICT_KEY: Record<Verdict, GlossKey> = { likely: "v_likely", check: "v_check", unlikely: "v_unlikely", na: "v_na" };
export const verdictLabel = (v: Verdict, lang: string) => L(VERDICT_KEY[v] ?? "v_na", lang);
export const statusLabel = (s: string, lang: string) => L((`s_${s}` as GlossKey), lang) || s;
export const sectorLabel = (s: ReportSector, lang: string) => L(s as GlossKey, lang);
export const factStatusLabel = (s: FactResult["status"], lang: string) => L(s as GlossKey, lang);
export const keyLabel = (k: KeyFact["key"], lang: string) => L(k as GlossKey, lang);

export function sortSectors(blocks: ReportSectorBlock[]) {
  return [...blocks].sort((a, b) => SECTOR_ORDER.indexOf(a.id) - SECTOR_ORDER.indexOf(b.id));
}
export { SECTOR_ICON };

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** Markdown rendering used for summary_en / summary_local, Telegram and plain-text e-mail. */
export function reportToMarkdown(r: StructuredReport, lang: string, opts: { local?: boolean; maxSources?: number } = {}): string {
  const loc = opts.local !== false && lang !== "en";
  const pick = (en: string, local?: string) => (loc && local ? local : en);
  const out: string[] = [];
  if (r.answer?.text) {
    out.push(pick(r.answer.text, r.answer.text_local));
    // binary / brief questions get ONLY the answer (+ the official source); the full report stays on the slip / cards
    if (r.answer.style === "binary" || r.answer.style === "brief") {
      if (r.sources.length) out.push(`\n${L("sources", lang)}: ${r.sources.slice(0, 2).join(" · ")}`);
      return out.join("\n");
    }
    out.push("");
  } else {
    out.push(`**${L("greeting", lang)}**`);
    const head = pick(r.headline, r.headline_local);
    if (head) out.push(head);
  }
  for (const s of sortSectors(r.sectors)) {
    out.push(`\n### ${sectorLabel(s.id, lang)}`);
    for (const it of s.items) {
      const badge = it.verdict !== "na" ? ` — ${verdictLabel(it.verdict, lang)}` : "";
      out.push(`**${it.scheme_name}**${badge} · ${statusLabel(it.status, lang)}`);
      for (const f of it.facts.slice(0, 5)) out.push(`- ${keyLabel(f.key, lang)}: ${pick(f.value, f.value_local)}`);
      const reasons = loc && it.reasons_local?.length ? it.reasons_local : it.reasons;
      if (reasons.length) out.push(`- ${L("why", lang)}: ${reasons.slice(0, 2).join(" ")}`);
      const fc = it.fact_check.filter((f) => f.status !== "not_stated");
      if (fc.length) out.push(`- ${L("fact_check", lang)}: ${fc.map((f) => `${f.label} ${f.status === "confirmed" ? "(confirmed)" : "(mismatch)"} ${factStatusLabel(f.status, lang)}`).join(" · ")}`);
      if (it.status === "agent_live" && it.confirm) out.push(`- ${L("s_agent_live", lang)} (~${it.confirm.est_steps} steps ≈ $${it.confirm.est_cost_usd})`);
      const diy = loc && it.diy_local?.length ? it.diy_local : it.diy;
      if (diy.length && (it.status !== "ok" || it.verdict === "check")) out.push(`- ${L("diy", lang)}: ${diy[0]}`);
    }
  }
  if (r.contradictions.length) {
    out.push(`\n### ${L("contradictions", lang)}`);
    r.contradictions.slice(0, 5).forEach((c) => out.push(`- ${pick(c.text, c.text_local)}`));
  }
  if (r.sentinel.length) {
    out.push(`\n### ${L("sentinel", lang)}`);
    r.sentinel.slice(0, 4).forEach((s) => out.push(`- ${s.scheme_name} (${s.kind}${s.state_code !== "IN" ? ` · ${s.state_code}` : ""}): ${pick(s.summary ?? "—", s.summary_local)}`));
  }
  if (r.also_eligible.length) {
    out.push(`\n### ${L("also_eligible", lang)}`);
    r.also_eligible.forEach((a) => out.push(`- **${a.name}** — ${verdictLabel(a.verdict, lang)}: ${a.benefit}`));
  }
  if (r.next_steps.length) {
    out.push(`\n### ${L("next_steps", lang)}`);
    r.next_steps.slice(0, 6).forEach((n, i) => out.push(`${i + 1}. ${pick(n.text, n.text_local)}`));
  }
  if (r.sources.length) {
    out.push(`\n${L("sources", lang)}:`);
    r.sources.slice(0, opts.maxSources ?? 6).forEach((u) => out.push(`- ${u}`));
  }
  return out.join("\n");
}

/** One-line plain summary for notifications. */
export function reportOneLiner(r: StructuredReport, lang: string) {
  const n = r.sectors.reduce((a, s) => a + s.items.length, 0);
  const likely = r.sectors.flatMap((s) => s.items).filter((i) => i.verdict === "likely").map((i) => i.scheme_name);
  return `${L("title", lang)}: ${n} · ${likely.length ? `${L("v_likely", lang)}: ${likely.join(", ")}` : ""}${r.contradictions.length ? ` · contradictions: ${r.contradictions.length}` : ""}`;
}

export { host as reportHost };

export interface OverlayAgentResult { scheme_id: string; task: string; status: string; result: Record<string, unknown> | null; cost_usd?: number; kind?: string; mode?: string; run_id?: string | null }

/** False for empty / placeholder values an Agent writes when a field is not on the page ("NA", "not mentioned"…). */
export function meaningful(v: unknown): v is string {
  if (typeof v !== "string" && typeof v !== "number") return false;
  const t = String(v).trim();
  return !!t && !/^(n\/?a|na|nil|none|null|undefined|-+|—|not (available|applicable|found|shown|displayed|mentioned|specified|stated|visible)\b.*|no (deadline|notice|helpline|information|info|data)\b.*)$/i.test(t);
}

/** Facts a live "verify" Agent actually saw on the official portal — sanitised {label, value} list. */
export function verifiedFactsOf(res: Record<string, unknown> | null | undefined, max = 8): { label: string; value: string }[] {
  const arr = Array.isArray(res?.verified_facts) ? (res!.verified_facts as { label?: unknown; value?: unknown }[]) : [];
  return arr
    .filter((f) => f && typeof f.label === "string" && meaningful(f.value))
    .slice(0, max)
    .map((f) => ({ label: String(f.label).slice(0, 80), value: String(f.value).slice(0, 240) }));
}

/**
 * Overlay live Agent results (added after the report was written) onto the structured report.
 * Personal status / land checks win for the item status; the guaranteed live "verify" Agent enriches the item with
 * the facts it actually read on the official portal (never pretending to be a personal status check).
 */
export function overlayAgentResults(r: StructuredReport, agentResults: OverlayAgentResult[] = []): StructuredReport {
  if (!agentResults.length) return r;
  const copy: StructuredReport = JSON.parse(JSON.stringify(r));
  for (const s of copy.sectors) {
    for (const it of s.items) {
      const mine = agentResults.filter((x) => x.scheme_id === it.scheme_id && x.task === it.task);
      const a = mine.filter((x) => x.kind !== "verify").pop();
      const v = mine.filter((x) => x.kind === "verify").pop();
      if (a) {
        const res = a.result ?? {};
        const blocked = (res.blocked_by as string) ?? null;
        it.agent = { status: a.status, blocked_by: blocked, registration_status: (res.registration_status as string) ?? null, cost_usd: Number(a.cost_usd ?? 0), kind: "personal", run_id: a.run_id ?? null };
        it.status = blocked && blocked !== "none" ? (blocked === "otp" ? "needs_otp" : "partial") : a.status === "COMPLETED" ? "ok" : "error";
        if (res.registration_status && !it.facts.some((f) => f.key === "status")) it.facts.unshift({ key: "status", value: String(res.registration_status) });
      } else if (v) {
        const res = v.result ?? {};
        const verified = verifiedFactsOf(res);
        const blocked = (res.blocked_by as string) ?? null;
        it.agent = { status: v.status, blocked_by: blocked, registration_status: null, cost_usd: Number(v.cost_usd ?? 0), kind: "verify", mode: v.mode ?? null, verified, run_id: v.run_id ?? null };
        const add = (key: KeyFact["key"], val: unknown) => {
          if (meaningful(val) && !it.facts.some((f) => f.key === key)) it.facts.push({ key, value: String(val).trim().slice(0, 240) });
        };
        add("benefit", res.benefit);
        add("deadline", res.deadline);
        add("helpline", res.helpline);
        // a live Agent that actually read the official page upgrades a partial / failed Fetch section
        if (v.status === "COMPLETED" && (!blocked || blocked === "none") && verified.length && (it.status === "partial" || it.status === "error")) it.status = "ok";
        if (res.official_url && typeof res.official_url === "string" && /^https?:\/\//.test(res.official_url) && !it.sources.includes(res.official_url)) it.sources.push(res.official_url);
      }
    }
  }
  return copy;
}
