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
  status: string; // ok | partial | needs_confirmation | needs_otp | error | skipped
  verdict: Verdict;
  reasons: string[];
  reasons_local?: string[];
  facts: KeyFact[];
  fact_check: FactResult[];
  cache: "hit" | "miss";
  sources: string[];
  diy: string[];
  diy_local?: string[];
  confirm?: { confirm_id: string; est_steps: number; est_cost_usd: number; entry_url: string; requires_otp: boolean | null } | null;
  agent?: { status: string; blocked_by?: string | null; registration_status?: string | null; cost_usd?: number } | null;
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

export interface StructuredReport {
  version: 1;
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
  stats: { sections: number; cache_hits: number; cache_misses: number; facts_confirmed: number; facts_contradicted: number };
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
  out.push(`**${L("greeting", lang)}**`);
  const head = pick(r.headline, r.headline_local);
  if (head) out.push(head);
  for (const s of sortSectors(r.sectors)) {
    out.push(`\n### ${s.icon} ${sectorLabel(s.id, lang)}`);
    for (const it of s.items) {
      const badge = it.verdict !== "na" ? ` — ${verdictLabel(it.verdict, lang)}` : "";
      out.push(`**${it.scheme_name}**${badge} · ${statusLabel(it.status, lang)}`);
      for (const f of it.facts.slice(0, 5)) out.push(`- ${keyLabel(f.key, lang)}: ${pick(f.value, f.value_local)}`);
      const reasons = loc && it.reasons_local?.length ? it.reasons_local : it.reasons;
      if (reasons.length) out.push(`- ${L("why", lang)}: ${reasons.slice(0, 2).join(" ")}`);
      const fc = it.fact_check.filter((f) => f.status !== "not_stated");
      if (fc.length) out.push(`- ${L("fact_check", lang)}: ${fc.map((f) => `${f.label} ${f.status === "confirmed" ? "✓" : "⚠"} ${factStatusLabel(f.status, lang)}`).join(" · ")}`);
      if (it.status === "needs_confirmation" && it.confirm) out.push(`- 🔐 ${L("s_needs_confirmation", lang)} (~${it.confirm.est_steps} steps ≈ $${it.confirm.est_cost_usd})`);
      const diy = loc && it.diy_local?.length ? it.diy_local : it.diy;
      if (diy.length && (it.status !== "ok" || it.verdict === "check")) out.push(`- ${L("diy", lang)}: ${diy[0]}`);
    }
  }
  if (r.contradictions.length) {
    out.push(`\n### ⚠ ${L("contradictions", lang)}`);
    r.contradictions.slice(0, 5).forEach((c) => out.push(`- ${pick(c.text, c.text_local)}`));
  }
  if (r.sentinel.length) {
    out.push(`\n### 🔔 ${L("sentinel", lang)}`);
    r.sentinel.slice(0, 4).forEach((s) => out.push(`- ${s.scheme_name} (${s.kind}${s.state_code !== "IN" ? ` · ${s.state_code}` : ""}): ${pick(s.summary ?? "—", s.summary_local)}`));
  }
  if (r.also_eligible.length) {
    out.push(`\n### ✨ ${L("also_eligible", lang)}`);
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
  return `${L("title", lang)}: ${n} · ${likely.length ? `${L("v_likely", lang)}: ${likely.join(", ")}` : ""}${r.contradictions.length ? ` · ⚠ ${r.contradictions.length}` : ""}`;
}

export { host as reportHost };

/** Overlay citizen-consented Agent results (added after the report was written) onto the structured report. */
export function overlayAgentResults(r: StructuredReport, agentResults: { scheme_id: string; task: string; status: string; result: Record<string, unknown> | null; cost_usd?: number }[] = []): StructuredReport {
  if (!agentResults.length) return r;
  const copy: StructuredReport = JSON.parse(JSON.stringify(r));
  for (const s of copy.sectors) {
    for (const it of s.items) {
      const a = agentResults.filter((x) => x.scheme_id === it.scheme_id && x.task === it.task).pop();
      if (!a) continue;
      const res = a.result ?? {};
      const blocked = (res.blocked_by as string) ?? null;
      it.agent = { status: a.status, blocked_by: blocked, registration_status: (res.registration_status as string) ?? null, cost_usd: Number(a.cost_usd ?? 0) };
      it.status = blocked && blocked !== "none" ? (blocked === "otp" ? "needs_otp" : "partial") : a.status === "COMPLETED" ? "ok" : "error";
      if (res.registration_status && !it.facts.some((f) => f.key === "status")) it.facts.unshift({ key: "status", value: String(res.registration_status) });
    }
  }
  return copy;
}
