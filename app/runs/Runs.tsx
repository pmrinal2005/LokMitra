"use client";
import { useMemo, useState } from "react";
import { api, ago, hostOf } from "@/lib/client";
import { Flash, Json, Kpi, PageHead, Panel, useAction, useApi, usd } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface Log { id: string; surface: string; purpose: string; state_code?: string | null; scheme_id?: string | null; run_id?: string | null; status: string; steps?: number | null; cost_usd: number; latency_ms?: number | null; meta?: Record<string, unknown>; created_at: string }
interface Rep { id: string; language: string; query: string; live_calls?: { search?: number; fetch_urls?: number; fetch_ok?: number; agent?: number } | null; elapsed_ms?: number | null; cost_usd: number; created_at: string }
interface TfRun { run_id: string; status: string; goal: string; created_at: string; finished_at: string | null; num_of_steps: number | null; result: Record<string, unknown> | null; error: { message: string; category?: string } | null; streaming_url?: string | null; steps?: { id: string; action: string | null; status: string; timestamp: string; screenshot: string | null; duration: string | null }[] }

const SURFACES = ["", "search", "fetch", "agent", "browser", "monitor", "llm", "telegram", "email"];

export function Runs() {
  const [surface, setSurface] = useState("");
  const [tab, setTab] = useState<"lokmitra" | "tinyfish" | "reports">("lokmitra");
  const logs = useApi<{ runs: Log[]; reports: Rep[] }>(`/api/lokmitra/runs?limit=400${surface ? `&surface=${surface}` : ""}`, 20_000);
  const tf = useApi<{ data: TfRun[]; pagination: { total: number } }>(tab === "tinyfish" ? "/api/tinyfish/runs?limit=50&sort_direction=desc" : null, 20_000);
  const act = useAction();
  const [run, setRun] = useState<TfRun | null>(null);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (logs.data?.runs ?? []).filter((r) => !s || `${r.purpose} ${r.scheme_id ?? ""} ${r.state_code ?? ""} ${r.run_id ?? ""} ${JSON.stringify(r.meta ?? {})}`.toLowerCase().includes(s));
  }, [logs.data, q]);
  const sum = useMemo(() => {
    const all = logs.data?.runs ?? [];
    return {
      free: all.filter((r) => r.surface === "search" || r.surface === "fetch").length,
      paid: all.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0),
      agentic: all.filter((r) => r.surface === "agent" || r.surface === "browser" || r.surface === "monitor").length,
      errors: all.filter((r) => r.status === "error").length,
    };
  }, [logs.data]);

  const openRun = (id: string) => act.run("Loading TinyFish run", () => api<TfRun>(`/api/tinyfish/runs/${id}?screenshots=url`), (r) => void setRun(r));
  const cancel = (id: string) => confirm("Cancel this run?") && act.run("Cancelling", () => api(`/api/tinyfish/runs/${id}/cancel`, { method: "POST" }), () => (void tf.reload(), "cancel requested"));

  return (
    <div className="page">
      <PageHead title="Runs Log" sub="Anonymised audit trail of every TinyFish call LokMitra made (identifiers are never logged), the raw TinyFish run history, and the Citizen Benefit Reports generated.">
        <div className="mode-switch" role="tablist">
          {(["lokmitra", "tinyfish", "reports"] as const).map((t) => (
            <button key={t} className="mode-btn" aria-pressed={tab === t} onClick={() => setTab(t)}>{t === "lokmitra" ? "LokMitra log" : t === "tinyfish" ? "TinyFish runs" : "Reports"}</button>
          ))}
        </div>
      </PageHead>

      <div className="grid-4">
        <Kpi label="live Search + Fetch calls" value={sum.free} tone="jade" />
        <Kpi label="live Agent / Browser / Monitor" value={sum.agentic} sub="every call is live · nothing cached" tone="teal" />
        <Kpi label="logged usage (informational)" value={usd(sum.paid)} sub="no budget cap" tone="amber" />
        <Kpi label="errors" value={sum.errors} />
      </div>
      <Flash {...act} />

      {tab === "lokmitra" && (
        <Panel
          title={`runs_log · ${rows.length}`}
          right={
            <>
              <input className="input" style={{ width: 220 }} placeholder="search purpose / scheme / run id" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="select" style={{ width: 130 }} value={surface} onChange={(e) => setSurface(e.target.value)}>
                {SURFACES.map((s) => <option key={s} value={s}>{s || "all surfaces"}</option>)}
              </select>
              <button className="btn sm" onClick={logs.reload}><Icon name="refresh" /></button>
            </>
          }
        >
          {logs.error && <p className="note err"><Icon name="alert" /> {logs.error}</p>}
          {!rows.length ? (
            <div className="empty">{logs.loading ? "loading…" : "No calls logged yet."}</div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 620 }}>
              <table className="tbl">
                <thead><tr><th>When</th><th>Surface</th><th>Purpose</th><th>Scheme</th><th>State</th><th>Steps</th><th>Cost</th><th>Latency</th><th>Status</th><th>Run</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} title={JSON.stringify(r.meta ?? {})}>
                      <td className="mono">{ago(r.created_at)}</td>
                      <td><span className={`chip ${r.surface === "search" || r.surface === "fetch" ? "hit" : r.surface === "agent" || r.surface === "browser" || r.surface === "monitor" ? "miss" : ""}`}>{r.surface}</span></td>
                      <td>{r.purpose}</td>
                      <td className="mono">{r.scheme_id ?? "—"}</td>
                      <td className="mono">{r.state_code ?? "—"}</td>
                      <td className="mono">{r.steps ?? "—"}</td>
                      <td className="mono">{Number(r.cost_usd) ? usd(r.cost_usd) : "$0"}</td>
                      <td className="mono">{r.latency_ms ? `${r.latency_ms}ms` : "—"}</td>
                      <td><span className={`chip ${r.status === "error" ? "miss" : ""}`}>{r.status}</span></td>
                      <td>{r.run_id && r.surface === "agent" ? <button className="btn sm" onClick={() => openRun(r.run_id!)}>{r.run_id.slice(0, 8)}</button> : <span className="mono note">{r.run_id ? r.run_id.slice(0, 8) : ""}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "tinyfish" && (
        <Panel title={`TinyFish runs · ${tf.data?.pagination.total ?? "…"}`} sub="GET /v1/runs — includes runs started from the Mission Deck and other clients." right={<button className="btn sm" onClick={tf.reload}><Icon name="refresh" /></button>}>
          {tf.error && <p className="note err"><Icon name="alert" /> {tf.error}</p>}
          {!tf.data?.data.length ? (
            <div className="empty">{tf.loading ? "loading…" : "No runs on this account yet."}</div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 620 }}>
              <table className="tbl">
                <thead><tr><th>Created</th><th>Status</th><th>Goal</th><th>Steps</th><th /></tr></thead>
                <tbody>
                  {tf.data.data.map((r) => (
                    <tr key={r.run_id}>
                      <td className="mono">{ago(r.created_at)}</td>
                      <td><span className={`chip ${r.status === "COMPLETED" ? "hit" : r.status === "FAILED" ? "miss" : ""}`}>{r.status}</span></td>
                      <td><span className="ellipsis" style={{ maxWidth: 520 }} title={r.goal}>{r.goal}</span></td>
                      <td className="mono">{r.num_of_steps ?? "—"}</td>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          <button className="btn sm" onClick={() => openRun(r.run_id)}>Open</button>
                          {(r.status === "RUNNING" || r.status === "PENDING") && <button className="btn sm danger" onClick={() => cancel(r.run_id)}>Cancel</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "reports" && (
        <Panel title={`Citizen Benefit Reports · ${logs.data?.reports.length ?? 0}`} sub="PII-redacted queries. Open one for the printable slip with QR codes.">
          {!logs.data?.reports.length ? (
            <div className="empty">No reports yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>When</th><th>Lang</th><th>Query</th><th>Live calls</th><th>Time</th><th>Cost</th><th /></tr></thead>
                <tbody>
                  {logs.data.reports.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{ago(r.created_at)}</td>
                      <td className="mono">{r.language}</td>
                      <td><span className="ellipsis" style={{ maxWidth: 520 }}>{r.query}</span></td>
                      <td className="mono">{r.live_calls ? `${r.live_calls.search ?? 0}S · ${r.live_calls.fetch_ok ?? 0}/${r.live_calls.fetch_urls ?? 0}F${r.live_calls.agent ? ` · ${r.live_calls.agent}A` : ""}` : "—"}</td>
                      <td className="mono">{r.elapsed_ms ? `${(r.elapsed_ms / 1000).toFixed(1)}s` : "—"}</td>
                      <td className="mono">{Number(r.cost_usd) ? usd(r.cost_usd) : "$0"}</td>
                      <td><a className="btn sm" href={`/report/${r.id}`} target="_blank" rel="noreferrer">Slip ↗</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {run && (
        <Panel title={`Run ${run.run_id.slice(0, 12)}…`} sub={run.goal.slice(0, 220)} right={<button className="btn sm" onClick={() => setRun(null)}>close</button>}>
          <div className="row">
            <span className={`chip ${run.status === "COMPLETED" ? "hit" : "miss"}`}>{run.status}</span>
            <span className="chip">{run.num_of_steps ?? 0} steps</span>
            {run.finished_at && <span className="chip">finished {ago(run.finished_at)}</span>}
            {run.streaming_url && <a className="btn sm" href={run.streaming_url} target="_blank" rel="noreferrer noopener">live view ↗</a>}
          </div>
          {run.error && <p className="note err"><Icon name="alert" /> {run.error.category ? `${run.error.category}: ` : ""}{run.error.message}</p>}
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div className="stack">
              <span className="label">Steps</span>
              <div className="stack" style={{ maxHeight: 460, overflow: "auto" }}>
                {(run.steps ?? []).map((s, i) => (
                  <div key={s.id} className="section-card">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="note">{i + 1}. {s.action ?? "—"}</span>
                      <span className="mono note">{s.duration ?? ""}</span>
                    </div>
                    {s.screenshot && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="shot-frame" loading="lazy" src={/^https?:/.test(s.screenshot) ? s.screenshot : `/api/tinyfish/runs/${run.run_id}/steps/${s.id}/screenshot`} alt={`step ${i + 1} screenshot`} />
                    )}
                  </div>
                ))}
                {!run.steps?.length && <span className="note">no steps</span>}
              </div>
            </div>
            <div className="stack">
              <span className="label">Structured result</span>
              <Json value={run.result} max={460} />
              <span className="note">sources: {hostOf(String((run.result as { official_url?: string } | null)?.official_url ?? "")) || "see steps"}</span>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
