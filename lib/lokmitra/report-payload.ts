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
 * Used by the e-mail route (POST send + GET preview), the Telegram /email + /report flows
 * and the Bot Simulator, so every channel renders the exact same Citizen Benefit Report.
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

export async function buildReportPayload(r: Record<string, unknown>, opts: { base?: string } = {}): Promise<ReportPayload> {
  const id = String(r.id);
  const lang = String(r.language ?? "en");
  const structured = structuredOf(r);
  const token = slipToken(id);
  const link = slipLink(id, opts.base);
  const qr = /^https?:\/\//.test(link) ? await QRCode.toDataURL(link, { margin: 1, width: 200, errorCorrectionLevel: "M" }).catch(() => null) : null;
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
