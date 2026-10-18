"use client";
import { useMemo, useState } from "react";
import { WalletGauge } from "./WalletGauge";
import { LiveRing } from "./LiveRing";
import { useDeckData } from "@/hooks/useDeckData";
import { useApi } from "./ui";
import { ago, fmtUsd } from "@/lib/client";

interface RunRow { id: string; surface: string; purpose: string; state_code: string | null; scheme_id: string | null; run_id: string | null; status: string; steps: number | null; cost_usd: number | null; latency_ms: number | null; created_at: string }

const SURFACES = ["all", "search", "fetch", "agent", "browser", "monitor", "llm", "telegram", "email"] as const;

/**
 * Settings → "Usage & Infrastructure" (operator only).
 * The Wallet Telemetry and Live Execution panels are relocated here verbatim from the
 * Mission Deck (same markup, ids, glyphs and components) plus the LokMitra run log table.
 */
export function UsageInfrastructure() {
  const { data } = useDeckData(false);
  const [surface, setSurface] = useState<(typeof SURFACES)[number]>("all");
  const runs = useApi<{ runs: RunRow[] }>(`/api/lokmitra/runs?limit=200${surface !== "all" ? `&surface=${surface}` : ""}`, 15_000);
  const totals = useMemo(() => {
    const rows = runs.data?.runs ?? [];
    return { n: rows.length, cost: rows.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0), errors: rows.filter((r) => r.status === "error").length };
  }, [runs.data]);

  return (
    <div className="usage-infra">
      <div className="usage-grid">
        {/* ---------------- WALLET ---------------- */}
        <section id="wallet" className="panel area-wallet breathe" style={{ ["--i" as string]: 2, ["--bob" as string]: "5.2s" }} aria-labelledby="wallet-title">
          <header className="panel-head">
            <h2 className="panel-title" id="wallet-title">
              <span className="glyph" style={{ background: "var(--aqua)", boxShadow: "0 0 10px var(--aqua)" }} /> Wallet Telemetry
            </h2>
            <span className="panel-sub">GET /v1/wallet</span>
          </header>
          <WalletGauge data={data} />
        </section>

        {/* ---------------- LIVE EXECUTION RING ---------------- */}
        <section className="panel area-ring breathe" style={{ ["--i" as string]: 3, ["--bob" as string]: "5.8s" }} aria-labelledby="ring-title">
          <header className="panel-head">
            <h2 className="panel-title" id="ring-title">
              <span className="glyph" style={{ background: "var(--jade)", boxShadow: "0 0 10px var(--jade)" }} /> Live Execution
            </h2>
            <span className="panel-sub">every call live · 0% cached</span>
          </header>
          <LiveRing data={data} />
        </section>
      </div>

      <section className="panel" id="run-log" aria-labelledby="runlog-title">
        <header className="panel-head">
          <div>
            <h2 className="panel-title" id="runlog-title">
              <span className="glyph" style={{ background: "var(--ember)", boxShadow: "0 0 10px var(--ember)" }} /> Run log
            </h2>
            <div className="panel-sub">runs_log · anonymised audit of every TinyFish / LLM / channel call · {totals.n} rows · {fmtUsd(totals.cost)} · {totals.errors} errors</div>
          </div>
          <div className="mode-switch" role="tablist" aria-label="Filter by surface">
            {SURFACES.map((s) => (
              <button key={s} role="tab" aria-selected={surface === s} aria-pressed={surface === s} className="mode-btn" onClick={() => setSurface(s)}>
                {s}
              </button>
            ))}
          </div>
        </header>
        {runs.error && <p className="note err">⚠ {runs.error}</p>}
        <div className="table-wrap" style={{ maxHeight: 420 }}>
          <table className="tbl">
            <thead>
              <tr><th>When</th><th>Surface</th><th>Purpose</th><th>State</th><th>Scheme</th><th>Status</th><th>Steps</th><th>Cost</th><th>Latency</th><th>Run</th></tr>
            </thead>
            <tbody>
              {(runs.data?.runs ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="mono">{ago(r.created_at)}</td>
                  <td><span className={`chip ${r.surface === "agent" || r.surface === "browser" || r.surface === "monitor" ? "miss" : "live"}`}>{r.surface}</span></td>
                  <td>{r.purpose}</td>
                  <td className="mono">{r.state_code ?? "—"}</td>
                  <td className="mono">{r.scheme_id ?? "—"}</td>
                  <td className={r.status === "error" ? "note err" : ""}>{r.status}</td>
                  <td className="mono">{r.steps ?? "—"}</td>
                  <td className="mono">{r.cost_usd ? fmtUsd(Number(r.cost_usd), 4) : "$0"}</td>
                  <td className="mono">{r.latency_ms ? `${(r.latency_ms / 1000).toFixed(1)}s` : "—"}</td>
                  <td className="mono" title={r.run_id ?? ""}>{r.run_id ? `${r.run_id.slice(0, 8)}…` : "—"}</td>
                </tr>
              ))}
              {!runs.loading && !(runs.data?.runs ?? []).length && (
                <tr><td colSpan={10} className="empty">No runs logged yet on this instance — ask a question in Sahayak.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
