import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { ReportView } from "@/components/ReportView";
import { cfg } from "@/lib/lokmitra/config";
import { L } from "@/lib/lokmitra/glossary";
import { getReport } from "@/lib/lokmitra/pipeline";
import { slipLink, structuredOf } from "@/lib/lokmitra/report-payload";
import { reportHost } from "@/lib/lokmitra/report-shape";
import { slipToken, verifySlip } from "@/lib/lokmitra/slip";
import { mdToHtml } from "@/lib/md";
import { PrintButton } from "./PrintButton";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Citizen Benefit Report — LokMitra", robots: { index: false } };

interface Sec { scheme_id: string; scheme_name: string; task: string; status: string; sources?: string[]; diy?: string[] }
interface AgentRes { scheme_id: string; task: string; status: string; result: Record<string, unknown> | null; at?: string; kind?: string; mode?: string }

/**
 * Printable CSC slip (P5 polish):
 *  - structured, sector-grouped report (same renderer as Sahayak, print palette)
 *  - contradictions block always visible (guideline vs portal + sentinel)
 *  - report QR (links back to this slip with ?t=<HMAC token>) + human-readable slip token
 *  - "Token verified ✓ / ✕" banner when opened via the QR, so a bank / panchayat officer can
 *    confirm the slip came from this LokMitra deployment and was not edited
 *  - per-scheme status table + QR codes to every official source portal (verify yourself)
 */
export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; lang?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = /^[0-9a-f-]{36}$/i.test(id) ? ((await getReport(id)) as Record<string, unknown> | null) : null;
  if (!r) {
    return (
      <main className="page" style={{ textAlign: "center" }}>
        <p className="mono fog">// report not found — the in-memory store resets on redeploy; configure Supabase for permanent reports</p>
        <Link className="btn" href="/sahayak" style={{ justifySelf: "center", alignSelf: "center" }}>Back to Sahayak</Link>
      </main>
    );
  }
  const lang = String(r.language ?? "en");
  const viewLang = sp.lang === "en" ? "en" : lang;
  const structured = structuredOf(r);
  const sections = (Array.isArray(r.sections) ? r.sections : []) as Sec[];
  const agent = (Array.isArray(r.agent_results) ? r.agent_results : []) as AgentRes[];
  const sources = [...new Set([...(structured?.sources ?? []), ...((r.sources as string[]) ?? []), ...sections.flatMap((s) => s.sources ?? [])])].filter((u) => /^https?:\/\//.test(u)).slice(0, 6);
  const qrs = await Promise.all(sources.map(async (u) => ({ url: u, svg: await QRCode.toString(u, { type: "svg", margin: 1, width: 110, errorCorrectionLevel: "M" }) })));
  const token = slipToken(id);
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
  const link = slipLink(id, cfg.publicBaseUrl() || (host ? `${proto}://${host}` : undefined));
  const selfQr = /^https?:\/\//.test(link) ? await QRCode.toString(link, { type: "svg", margin: 1, width: 96, errorCorrectionLevel: "M" }) : null;
  const tokenState = sp.t === undefined ? null : verifySlip(id, sp.t);
  const created = new Date(String(r.created_at ?? Date.now())).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const local = String(r.summary_local ?? r.summary_en ?? "");
  const en = String(r.summary_en ?? "");
  const cost = Number(r.cost_usd ?? 0);

  return (
    <>
      <div className="slip-actions">
        <Link className="btn sm" href="/sahayak">← Sahayak</Link>
        {lang !== "en" && (
          <Link className="btn sm" href={`/report/${id}?${new URLSearchParams({ ...(sp.t ? { t: sp.t } : {}), ...(viewLang === "en" ? {} : { lang: "en" }) }).toString()}`}>
            {viewLang === "en" ? "Local language" : "EN English"}
          </Link>
        )}
        <a className="btn sm" href={`/api/lokmitra/report/${id}/email?preview=1`} target="_blank" rel="noreferrer"><Icon name="eye" /> Email preview</a>
        <PrintButton />
      </div>
      <article className="slip" lang={viewLang}>
        {tokenState !== null && (
          <div className={`slip-verify ${tokenState ? "ok" : "bad"}`} role="status">
            {tokenState ? <><Icon name="shield" /> {L("verified", viewLang)} — {token}</> : <><Icon name="alert" /> Slip token does not match this report — treat this printout as unverified.</>}
          </div>
        )}
        <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h1>LokMitra · {L("title", viewLang)}</h1>
            <div className="meta">
              #{id.slice(0, 8)} · {created} IST · {lang}
              {structured?.state_code ? ` · ${structured.state_code}` : ""}
              {structured?.persona ? ` · ${structured.persona}` : ""}
            </div>
          </div>
          <div className="meta" style={{ textAlign: "right" }}>
            ● {L("live_fetched", viewLang)}
            <br />
            {L("cost", viewLang)} ${cost.toFixed(3)}
          </div>
        </header>
        <hr />
        <p className="meta"><b>{L("question", viewLang)}:</b> {String(r.query ?? "")}</p>

        {structured ? (
          <ReportView r={structured} lang={lang} showEnglish={viewLang === "en"} tone="print" />
        ) : (
          <>
            <section className="slip-body" dangerouslySetInnerHTML={{ __html: mdToHtml(viewLang === "en" && en ? en : local) }} />
          </>
        )}

        {sections.length > 0 && (
          <>
            <h2 style={{ fontSize: 15, marginTop: 18 }}>Scheme-wise status</h2>
            <table className="slip-tbl">
              <thead><tr><th>Scheme</th><th>Task</th><th>Status</th><th>{L("diy", viewLang)}</th></tr></thead>
              <tbody>
                {sections.map((s) => {
                  const mine = agent.filter((x) => x.scheme_id === s.scheme_id && x.task === s.task);
                  const a = mine.filter((x) => x.kind !== "verify").pop() ?? mine.filter((x) => x.kind === "verify").pop();
                  const res = a?.result ?? null;
                  return (
                    <tr key={`${s.scheme_id}:${s.task}`}>
                      <td><b>{s.scheme_name}</b></td>
                      <td>{s.task}</td>
                      <td>
                        {a ? `${a.kind === "verify" ? "live agent verified · " : ""}${a.status}${res?.registration_status ? ` · ${String(res.registration_status)}` : ""}${res?.blocked_by && res.blocked_by !== "none" ? ` · blocked: ${String(res.blocked_by)}` : ""}` : s.status.replace(/_/g, " ")}
                      </td>
                      <td>{(s.diy ?? []).slice(0, 3).join(" → ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {qrs.length > 0 && (
          <>
            <h2 style={{ fontSize: 15, marginTop: 18 }}>{L("scan_verify", viewLang)}</h2>
            <div className="qr-row">
              {qrs.map((q) => (
                <div key={q.url} className="qr">
                  <div dangerouslySetInnerHTML={{ __html: q.svg }} />
                  {reportHost(q.url)}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="token-box">
          {selfQr && <div aria-label="QR code of this report" dangerouslySetInnerHTML={{ __html: selfQr }} />}
          <div>
            <div className="meta">{L("slip_token", viewLang)}</div>
            <div className="token-code">{token}</div>
            <div className="meta" style={{ marginTop: 4 }}>
              {L("report_qr", viewLang)}: {selfQr ? "scan to open this slip and verify the token" : "set PUBLIC_BASE_URL to print a scannable report QR"}
            </div>
          </div>
        </div>
        <hr />
        <p className="meta">LokMitra never asks for money or OTPs over the phone. Always verify on the official portal or at your nearest Common Service Centre. Personal identifiers are not stored on this slip.</p>
      </article>
    </>
  );
}
