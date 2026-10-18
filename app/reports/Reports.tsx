"use client";
import { useState } from "react";
import { api, ago } from "@/lib/client";
import { Flash, Kpi, PageHead, Panel, useAction, useApi, usd } from "@/components/ui";
import { ReportView } from "@/components/ReportView";
import type { StructuredReport } from "@/lib/lokmitra/report-shape";

interface Rep { id: string; language: string; query: string; live_calls?: { search?: number; fetch_urls?: number; fetch_ok?: number; agent?: number } | null; elapsed_ms?: number | null; cost_usd: number; created_at: string }
interface Full extends Rep { structured?: StructuredReport | null; summary_en?: string; summary_local?: string; sources?: string[] }
interface EmailJson { subject: string; link: string; token: string; structured: boolean; resend_configured: boolean }

/**
 * Citizen Benefit Reports — every report produced by Sahayak / CSC / Telegram, each one the
 * result of its own fully-live pipeline run (nothing reused). Opens the structured, sector-grouped
 * report, the exact Resend HTML e-mail (live preview iframe), the CSC slip with QR + HMAC token,
 * and lets an operator send the e-mail via Resend.
 */
export function Reports() {
  const list = useApi<{ reports: Rep[] }>("/api/lokmitra/runs?limit=1", 30_000);
  const act = useAction();
  const [sel, setSel] = useState<Full | null>(null);
  const [mail, setMail] = useState<EmailJson | null>(null);
  const [tab, setTab] = useState<"report" | "email">("report");
  const [en, setEn] = useState(false);
  const [to, setTo] = useState("");
  const reports = list.data?.reports ?? [];

  const open = (id: string) =>
    act.run("Loading report", async () => {
      const [r, m] = await Promise.all([api<Full>(`/api/lokmitra/report/${id}`), api<EmailJson>(`/api/lokmitra/report/${id}/email?format=json`).catch(() => null)]);
      return { r, m };
    }, ({ r, m }) => {
      setSel(r);
      setMail(m);
      setTab("report");
    });
  const send = () => sel && act.run(`Sending via Resend to ${to}`, () => api<{ id: string }>(`/api/lokmitra/report/${sel.id}/email`, { body: { to } }), (r) => `sent · Resend id ${r.id}`);

  const totalLive = reports.reduce((a, r) => a + (r.live_calls?.search ?? 0) + (r.live_calls?.fetch_urls ?? 0), 0);
  const langs = new Set(reports.map((r) => r.language)).size;

  return (
    <div className="page">
      <PageHead title="Citizen Benefit Reports" sub={<>Every report below came from its <b>own complete live run</b> (fresh Search → Fetch → Agent). Open one to see the structured sector report, the exact Resend e-mail, and the printable CSC slip with QR + verification token.</>}>
        <span className="chip live">● each report = 1 live run</span>
        {mail && <span className={`chip ${mail.resend_configured ? "hit" : "miss"}`}>{mail.resend_configured ? "Resend ✓" : "Resend not configured · preview only"}</span>}
      </PageHead>

      <div className="grid-4">
        <Kpi label="reports" value={reports.length} tone="teal" />
        <Kpi label="live Search + Fetch calls" value={totalLive} sub="across these reports" tone="jade" />
        <Kpi label="languages" value={langs} />
        <Kpi label="usage (informational)" value={usd(reports.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0), 3)} sub="no budget cap" tone="amber" />
      </div>
      <Flash {...act} />

      <div className="grid-2" style={{ alignItems: "start" }}>
        <Panel title={`Reports · ${reports.length}`} right={<button className="btn sm" onClick={list.reload}>↻</button>}>
          {list.error && <p className="note err">⚠ {list.error}</p>}
          {!reports.length ? (
            <div className="empty">{list.loading ? "loading…" : <>No reports yet — ask something in <a href="/sahayak">Sahayak</a>.</>}</div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 640 }}>
              <table className="tbl">
                <thead><tr><th>When</th><th>Lang</th><th>Query</th><th>Live</th><th /></tr></thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} style={sel?.id === r.id ? { background: "rgba(46,242,195,.06)" } : undefined}>
                      <td className="mono">{ago(r.created_at)}</td>
                      <td className="mono">{r.language}</td>
                      <td><span className="ellipsis" style={{ maxWidth: 260 }} title={r.query}>{r.query}</span></td>
                      <td className="mono">{r.live_calls ? `${r.live_calls.search ?? 0}S·${r.live_calls.fetch_ok ?? 0}/${r.live_calls.fetch_urls ?? 0}F` : "—"}{r.elapsed_ms ? ` · ${(r.elapsed_ms / 1000).toFixed(1)}s` : ""}</td>
                      <td><button className="btn sm" onClick={() => open(r.id)}>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title={sel ? `Report #${sel.id.slice(0, 8)}` : "Report viewer"}
          sub={sel ? sel.query : "Pick a report on the left."}
          right={
            sel ? (
              <div className="mode-switch" role="tablist">
                <button className="mode-btn" aria-pressed={tab === "report"} onClick={() => setTab("report")}>Structured</button>
                <button className="mode-btn" aria-pressed={tab === "email"} onClick={() => setTab("email")}>E-mail preview</button>
              </div>
            ) : undefined
          }
        >
          {!sel ? (
            <div className="empty">The structured Citizen Benefit Report, e-mail and CSC slip appear here.</div>
          ) : (
            <div className="stack">
              <div className="row">
                <a className="btn sm" href={mail?.link || `/report/${sel.id}`} target="_blank" rel="noreferrer">🖨 CSC slip + QR</a>
                {mail?.token && <span className="chip" title="HMAC slip token printed on the slip and encoded in its QR">token <b className="mono">{mail.token}</b></span>}
                {sel.language !== "en" && tab === "report" && <button className="btn sm" onClick={() => setEn((v) => !v)}>{en ? "Local language" : "EN English"}</button>}
              </div>
              {tab === "report" ? (
                sel.structured ? (
                  <ReportView r={sel.structured} lang={sel.language} showEnglish={en} />
                ) : (
                  <pre className="mono note json-pre" style={{ maxHeight: 520, whiteSpace: "pre-wrap" }}>{en ? sel.summary_en : sel.summary_local ?? sel.summary_en}</pre>
                )
              ) : (
                <>
                  {mail && <div className="note">Subject: <b>{mail.subject}</b></div>}
                  <iframe title="E-mail preview" src={`/api/lokmitra/report/${sel.id}/email?preview=1`} sandbox="" style={{ width: "100%", height: 620, border: "1px solid var(--hair-strong)", borderRadius: 14, background: "#f4f6f8" }} />
                  <div className="row">
                    <input className="input" style={{ flex: 1 }} type="email" placeholder="citizen / CSC operator e-mail" value={to} onChange={(e) => setTo(e.target.value)} />
                    <button className="btn primary sm" disabled={!!act.busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)} onClick={send}>📧 Send via Resend</button>
                  </div>
                  {mail && !mail.resend_configured && <div className="note">RESEND_API_KEY is not set — the preview above is exactly what would be sent; sending returns “not configured”.</div>}
                </>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
