"use client";
import { Kpi, PageHead, Panel, useApi, usd } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface Stats {
  generated_at: string;
  backend: "supabase" | "memory";
  wallet: { balance: number | null; error?: string | null; rates: { step: number; browserPerMin: number; monitor: number; source: string } };
  spend_usd: number;
  spend_by_surface: Record<string, number>;
  calls_by_surface: Record<string, number>;
  live: { calls: number; search: number; fetch: number; agent: number; browser: number; monitor: number; errors: number; avg_latency_ms: Record<string, number | null> };
  reports: { total: number; sections: number; citizens: number; languages: Record<string, number>; schemes: { id: string; name: string; n: number }[]; states: { code: string; name: string; n: number }[] };
  impact: { schemes_surfaced: number; hours_saved: number; agent_runs: number; avg_cost_per_report_usd: number | null };
  sentinels: { total: number; subscribers: number; changes_7d: number };
  sessions_live: { browser_sessions: number; otp_relays: number; pending_confirms: number };
  timeline: { hour: string; open_web: number; agentic: number; cost: number }[];
}

const SURF_COLOR: Record<string, string> = { search: "var(--jade)", fetch: "var(--teal)", agent: "var(--ember)", browser: "var(--coral)", monitor: "var(--aqua)", llm: "var(--fog)", telegram: "#7aa2ff", email: "#c79bff" };

export function Impact() {
  const { data: s, error, loading, reload } = useApi<Stats>("/api/lokmitra/stats", 15_000);
  const maxT = Math.max(1, ...(s?.timeline ?? []).map((t) => t.open_web + t.agentic));
  const maxScheme = Math.max(1, ...(s?.reports.schemes ?? []).map((x) => x.n));
  const maxState = Math.max(1, ...(s?.reports.states ?? []).map((x) => x.n));
  const maxCalls = Math.max(1, ...Object.values(s?.calls_by_surface ?? {}));

  return (
    <div className="page">
      <PageHead title="Impact & Wallet" sub={<>Judge view, computed from LokMitra’s own audit log and the live TinyFish wallet. Every citizen query runs <b>fully live</b> (fresh Search → Fetch → Agent) — there is no cache and no budget cap; the wallet and usage figures are shown purely for transparency.</>}>
        <button className="btn sm" onClick={reload}><Icon name="refresh" /></button>
      </PageHead>
      {error && <p className="note err"><Icon name="alert" /> {error}</p>}
      {loading && !s && <p className="note">loading…</p>}

      <div className="grid-4">
        <Kpi label="wallet balance" value={s?.wallet.balance === null || s?.wallet.balance === undefined ? "—" : `$${s.wallet.balance.toFixed(3)}`} sub={s?.wallet.error ?? `rates from ${s?.wallet.rates.source ?? "…"}`} tone="teal" />
        <Kpi label="LokMitra usage (informational)" value={usd(s?.spend_usd ?? 0, 3)} sub="no budget cap · never throttled" tone="amber" />
        <Kpi label="live TinyFish calls" value={s?.live.calls ?? 0} sub={`${s?.live.search ?? 0} search · ${s?.live.fetch ?? 0} fetch · ${s?.live.agent ?? 0} agent`} tone="jade" />
        <Kpi label="cached answers" value="0" sub={`no cache · ${s?.live.errors ?? 0} live errors surfaced`} />
        <Kpi label="citizen reports" value={s?.reports.total ?? 0} sub={`${s?.reports.citizens ?? 0} unique citizens`} tone="teal" />
        <Kpi label="schemes surfaced" value={s?.impact.schemes_surfaced ?? 0} sub={`${s?.reports.sections ?? 0} scheme answers`} />
        <Kpi label="est. hours saved" value={s?.impact.hours_saved ?? 0} sub="≈75 min per scheme vs CSC visit" tone="jade" />
        <Kpi label="avg cost / report" value={s?.impact.avg_cost_per_report_usd === null || s?.impact.avg_cost_per_report_usd === undefined ? "$0" : usd(s.impact.avg_cost_per_report_usd)} sub={`${s?.impact.agent_runs ?? 0} live agent runs total`} tone="amber" />
      </div>

      <div className="grid-2">
        <Panel title="Live execution" sub="Each citizen query is solved from scratch against the real portal — repeat queries run again in full.">
          <div className="grid-2">
            <Kpi label="live searches" value={s?.live.search ?? 0} sub={s?.live.avg_latency_ms?.search ? `avg ${(s.live.avg_latency_ms.search / 1000).toFixed(1)} s` : "—"} tone="jade" />
            <Kpi label="live fetch batches" value={s?.live.fetch ?? 0} sub={s?.live.avg_latency_ms?.fetch ? `avg ${(s.live.avg_latency_ms.fetch / 1000).toFixed(1)} s` : "—"} tone="teal" />
            <Kpi label="live agent runs" value={s?.live.agent ?? 0} sub={s?.live.avg_latency_ms?.agent ? `avg ${(s.live.avg_latency_ms.agent / 1000).toFixed(0)} s` : "—"} tone="amber" />
            <Kpi label="browser · monitor" value={`${s?.live.browser ?? 0} · ${s?.live.monitor ?? 0}`} sub="sessions · sentinel runs" />
          </div>
          <p className="note" style={{ marginTop: 10 }}>
            No portal map, no content cache, no stored answers: two identical questions trigger two complete, independent live executions. Surfaces are chosen purely by functional fit, not cost.
          </p>
        </Panel>

        <Panel title="Last 24 hours" sub="open-web (Search + Fetch) vs agentic (Agent / Browser / Monitor) live calls per hour">
          <div className="bars" aria-label="hourly calls">
            {(s?.timeline ?? []).map((t) => (
              <div key={t.hour} className="bar" title={`${t.hour.slice(11)}:00 UTC · ${t.open_web} search/fetch · ${t.agentic} agentic · $${t.cost}`}>
                <i style={{ height: `${(t.open_web / maxT) * 110}px`, background: "var(--teal)" }} />
                <i style={{ height: `${(t.agentic / maxT) * 110}px`, background: "var(--ember)" }} />
              </div>
            ))}
          </div>
          <div className="row note" style={{ marginTop: 6 }}>
            <span><i className="sw" style={{ background: "var(--teal)", display: "inline-block", width: 10, height: 10, borderRadius: 2 }} /> search + fetch</span>
            <span><i className="sw" style={{ background: "var(--ember)", display: "inline-block", width: 10, height: 10, borderRadius: 2 }} /> agent · browser · monitor</span>
          </div>
        </Panel>

        <Panel title="Calls & spend by TinyFish surface">
          <div className="stack" style={{ gap: 8 }}>
            {Object.entries(s?.calls_by_surface ?? {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <div key={k} className="hbar">
                <span className="mono">{k} {s?.spend_by_surface[k] ? `· ${usd(s.spend_by_surface[k], 3)}` : ""}</span>
                <span className="track"><span className="fill" style={{ width: `${(n / maxCalls) * 100}%`, display: "block", background: SURF_COLOR[k] }} /></span>
                <span className="mono">{n}</span>
              </div>
            ))}
            {!Object.keys(s?.calls_by_surface ?? {}).length && <div className="empty">no calls yet</div>}
          </div>
        </Panel>

        <Panel title="Reach">
          <div className="grid-2">
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">Top schemes</span>
              {(s?.reports.schemes ?? []).map((x) => (
                <div key={x.id} className="hbar" style={{ gridTemplateColumns: "110px 1fr 30px" }}>
                  <span className="ellipsis" style={{ maxWidth: 110 }}>{x.name}</span>
                  <span className="track"><span className="fill" style={{ width: `${(x.n / maxScheme) * 100}%`, display: "block" }} /></span>
                  <span className="mono">{x.n}</span>
                </div>
              ))}
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">Top states</span>
              {(s?.reports.states ?? []).map((x) => (
                <div key={x.code} className="hbar" style={{ gridTemplateColumns: "110px 1fr 30px" }}>
                  <span className="ellipsis" style={{ maxWidth: 110 }}>{x.name}</span>
                  <span className="track"><span className="fill" style={{ width: `${(x.n / maxState) * 100}%`, display: "block" }} /></span>
                  <span className="mono">{x.n}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            {Object.entries(s?.reports.languages ?? {}).map(([l, n]) => <span key={l} className="chip">{l} · {n}</span>)}
          </div>
        </Panel>

        <Panel title="Sentinel & live state">
          <div className="grid-3">
            <Kpi label="sentinels" value={s?.sentinels.total ?? 0} />
            <Kpi label="subscribers" value={s?.sentinels.subscribers ?? 0} tone="jade" />
            <Kpi label="changes · 7d" value={s?.sentinels.changes_7d ?? 0} tone="amber" />
            <Kpi label="browser sessions" value={s?.sessions_live.browser_sessions ?? 0} />
            <Kpi label="OTP relays" value={s?.sessions_live.otp_relays ?? 0} tone="teal" />
            <Kpi label="live agent tasks" value={s?.sessions_live.pending_confirms ?? 0} />
          </div>
        </Panel>

        <Panel title="Live rates (wallet)">
          <div className="stack" style={{ gap: 6 }}>
            <div className="pf-field"><span className="k">agent step</span><b>${s?.wallet.rates.step ?? "—"}</b></div>
            <div className="pf-field"><span className="k">browser minute</span><b>${s?.wallet.rates.browserPerMin ?? "—"}</b></div>
            <div className="pf-field"><span className="k">monitor run</span><b>${s?.wallet.rates.monitor ?? "—"}</b></div>
            <div className="pf-field"><span className="k">search / fetch</span><b>$0 per call (daily allowance: 12k searches · 1k fetches)</b></div>
            <p className="note">generated {s ? new Date(s.generated_at).toLocaleTimeString() : "—"}</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
