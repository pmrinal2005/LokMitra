import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { getReport } from "@/lib/lokmitra/pipeline";
import { mdToHtml } from "@/lib/md";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Citizen Benefit Report — LokMitra", robots: { index: false } };

interface Sec { scheme_id: string; scheme_name: string; task: string; status: string; sources?: string[]; diy?: string[]; cache?: string }
interface AgentRes { scheme_id: string; task: string; status: string; result: Record<string, unknown> | null; at?: string }

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** Printable CSC slip: localized summary, per-scheme status, DIY steps and QR codes to every official source. */
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = /^[0-9a-f-]{36}$/i.test(id) ? ((await getReport(id)) as Record<string, unknown> | null) : null;
  if (!r) {
    return (
      <main className="page" style={{ textAlign: "center" }}>
        <p className="mono fog">// report not found — the in-memory store resets on redeploy; configure Supabase for permanent reports</p>
        <Link className="btn" href="/sahayak" style={{ justifySelf: "center", alignSelf: "center" }}>Back to Sahayak</Link>
      </main>
    );
  }
  const sections = (Array.isArray(r.sections) ? r.sections : []) as Sec[];
  const agent = (Array.isArray(r.agent_results) ? r.agent_results : []) as AgentRes[];
  const sources = [...new Set([...((r.sources as string[]) ?? []), ...sections.flatMap((s) => s.sources ?? [])])].filter((u) => /^https?:\/\//.test(u)).slice(0, 8);
  const qrs = await Promise.all(sources.map(async (u) => ({ url: u, svg: await QRCode.toString(u, { type: "svg", margin: 1, width: 110, errorCorrectionLevel: "M" }) })));
  const created = new Date(String(r.created_at ?? Date.now())).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const local = String(r.summary_local ?? r.summary_en ?? "");
  const en = String(r.summary_en ?? "");

  return (
    <>
      <div className="slip-actions">
        <Link className="btn sm" href="/sahayak">← Sahayak</Link>
        <PrintButton />
      </div>
      <article className="slip" lang={String(r.language ?? "en")}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h1>LokMitra · Citizen Benefit Report</h1>
            <div className="meta">Report {id.slice(0, 8)} · {created} IST · language {String(r.language ?? "en")}</div>
          </div>
          <div className="meta" style={{ textAlign: "right" }}>
            {Number(r.cache_hits ?? 0)}/{Number(r.cache_hits ?? 0) + Number(r.cache_misses ?? 0)} answers from cache
            <br />
            cost ${Number(r.cost_usd ?? 0).toFixed(3)}
          </div>
        </header>
        <hr />
        <p className="meta"><b>Question:</b> {String(r.query ?? "")}</p>
        <section className="slip-body" dangerouslySetInnerHTML={{ __html: mdToHtml(local) }} />
        {String(r.language ?? "en") !== "en" && en && en !== local && (
          <details open={false}>
            <summary className="meta">English version</summary>
            <section dangerouslySetInnerHTML={{ __html: mdToHtml(en) }} />
          </details>
        )}

        {sections.length > 0 && (
          <>
            <h2 style={{ fontSize: 15, marginTop: 18 }}>Scheme-wise status</h2>
            <table className="slip-tbl">
              <thead><tr><th>Scheme</th><th>Task</th><th>Status</th><th>Do it yourself</th></tr></thead>
              <tbody>
                {sections.map((s) => {
                  const a = agent.filter((x) => x.scheme_id === s.scheme_id && x.task === s.task).pop();
                  const res = a?.result ?? null;
                  return (
                    <tr key={`${s.scheme_id}:${s.task}`}>
                      <td><b>{s.scheme_name}</b></td>
                      <td>{s.task}</td>
                      <td>
                        {a ? `${a.status}${res?.registration_status ? ` · ${String(res.registration_status)}` : ""}${res?.blocked_by && res.blocked_by !== "none" ? ` · blocked: ${String(res.blocked_by)}` : ""}` : s.status.replace(/_/g, " ")}
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
            <h2 style={{ fontSize: 15, marginTop: 18 }}>Official portals — scan to verify yourself</h2>
            <div className="qr-row">
              {qrs.map((q) => (
                <div key={q.url} className="qr">
                  <div dangerouslySetInnerHTML={{ __html: q.svg }} />
                  {host(q.url)}
                </div>
              ))}
            </div>
          </>
        )}
        <hr />
        <p className="meta">LokMitra never asks for money or OTPs over the phone. Always verify on the official portal or at your nearest Common Service Centre. Personal identifiers are not stored on this slip.</p>
      </article>
    </>
  );
}
