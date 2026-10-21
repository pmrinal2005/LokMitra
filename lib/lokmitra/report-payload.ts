import "server-only";
import QRCode from "qrcode";
import { cfg } from "./config";
import { reportEmailHtml, structuredEmailHtml, structuredEmailText } from "./email";
import { L } from "./glossary";
import { overlayAgentResults, reportOneLiner, type StructuredReport } from "./report-shape";
import { slipToken } from "./slip";

/**
 * Shared helper: stored benefit_reports row → everything a channel needs to deliver it
 * (structured HTML e-mail + plain-text part + subject, slip link with HMAC token, QR).
 * Used by the e-mail route (POST send + GET preview) and the Telegram /email + /report flows,
 * so every channel renders the exact same Citizen Benefit Report.
 */
export interface ReportPayload {
  report_id: string;
  language: string;
  structured: StructuredReport | null;
  subject: string;
  html: string;
  text: string;
  link: string;
  token: string;
  qr_data_url: string | null;
  one_liner: string;
}

type AgentRes = { scheme_id: string; task: string; status: string; result: Record<string, unknown> | null; cost_usd?: number };

export function structuredOf(r: Record<string, unknown>): StructuredReport | null {
  const s = r.structured as StructuredReport | undefined;
  if (!s || s.version !== 1 || !Array.isArray(s.sectors)) return null;
  const agent = (Array.isArray(r.agent_results) ? r.agent_results : []) as AgentRes[];
  return overlayAgentResults(s, agent);
}

export function slipLink(id: string, base?: string) {
  const b = (base || cfg.publicBaseUrl() || "").replace(/\/+$/, "");
  return `${b}/report/${id}?t=${encodeURIComponent(slipToken(id))}`;
}

/**
 * Client-supplied report fallback (e-mail button when the stored row is unreachable).
 * The payload is untrusted: it is size-limited, shape-checked and reduced to the fields the e-mail renders.
 * Returns null when it is not a usable report.
 */
export function sanitizeClientReport(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  try {
    if (JSON.stringify(p).length > 400_000) return null;
  } catch {
    return null;
  }
  const id = typeof p.id === "string" && /^[0-9a-f-]{36}$/i.test(p.id) ? p.id : null;
  if (!id) return null;
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  const structured = p.structured as StructuredReport | undefined;
  const hasStructured = !!structured && structured.version === 1 && Array.isArray(structured.sectors);
  const summary_en = str(p.summary_en, 20_000);
  const summary_local = str(p.summary_local, 20_000);
  if (!hasStructured && !summary_en && !summary_local) return null;
  return {
    id,
    language: str(p.language, 8) || "en",
    query: str(p.query, 2000),
    summary_en,
    summary_local,
    structured: hasStructured ? structured : null,
    sources: (Array.isArray(p.sources) ? p.sources : []).filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 20),
    agent_results: [],
    cost_usd: 0,
    from_client: true,
  };
}

export async function buildReportPayload(r: Record<string, unknown>, opts: { base?: string } = {}): Promise<ReportPayload> {
  const id = String(r.id);
  const lang = String(r.language ?? "en");
  const structured = structuredOf(r);
  // a report that only exists client-side cannot be vouched for: no slip token, no verify-link, no QR
  const unverified = r.from_client === true;
  const token = unverified ? "" : slipToken(id);
  const link = unverified ? "" : slipLink(id, opts.base);
  const qr = !unverified && /^https?:\/\//.test(link) ? await QRCode.toDataURL(link, { margin: 1, width: 200, errorCorrectionLevel: "M" }).catch(() => null) : null;
  const subject = `LokMitra · ${L("title", lang)}${structured?.state_code ? ` · ${structured.state_code}` : ""} · #${id.slice(0, 8)}`;
  if (structured) {
    return {
      report_id: id,
      language: lang,
      structured,
      subject,
      html: structuredEmailHtml({ r: structured, lang, report_id: id, link, qrDataUrl: qr, token, query: r.query ? String(r.query) : null, cost_usd: Number(r.cost_usd ?? 0) }),
      text: structuredEmailText(structured, lang, link),
      link,
      token,
      qr_data_url: qr,
      one_liner: reportOneLiner(structured, lang),
    };
  }
  // legacy rows (written before the structured report existed) → markdown e-mail
  return {
    report_id: id,
    language: lang,
    structured: null,
    subject,
    html: reportEmailHtml({ summary_local: String(r.summary_local ?? ""), summary_en: String(r.summary_en ?? ""), language: lang, sources: (r.sources as string[]) ?? [], report_id: id, link }),
    text: String(r.summary_local ?? r.summary_en ?? ""),
    link,
    token,
    qr_data_url: qr,
    one_liner: String(r.summary_en ?? "").split("\n")[0] ?? "",
  };
}
