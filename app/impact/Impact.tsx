"use client";
import { Kpi, PageHead, Panel, useApi, usd } from "@/components/ui";

interface Stats {
  generated_at: string;
  backend: "supabase" | "memory";
  wallet: { balance: number | null; error?: string | null; rates: { step: number; browserPerMin: number; monitor: number; source: string } };
  budget_usd: number;
  spend_usd: number;
  spend_by_surface: Record<string, number>;
  calls_by_surface: Record<string, number>;
  cache: { hits: number; misses: number; hit_pct: number; free_calls: number; paid_calls: number; free_pct: number };
  portal_map: { rows: number; agent_rows: number; hits: number; discovery_usd: number; amortised_usd_per_hit: number | null };
  reports: { total: number; sections: number; citizens: number; languages: Record<string, number>; schemes: { id: string; name: string; n: number }[]; states: { code: string; name: string; n: number }[] };
  impact: { schemes_surfaced: number; hours_saved: number; agent_runs: number; avg_cost_per_report_usd: number | null };
  sentinels: { total: number; subscribers: number; changes_7d: number };
  live: { browser_sessions: number; otp_relays: number; pending_confirms: number };
  timeline: { hour: string; free: number; paid: number; cost: number }[];
}

const SURF_COLOR: Record<string, string> = { search: "var(--jade)", fetch: "var(--teal)", agent: "var(--ember)", browser: "var(--coral)", monitor: "var(--aqua)", llm: "var(--fog)", telegram: "#7aa2ff", email: "#c79bff" };

export function Impact() {
  const { data: s, error, loading, reload } = useApi<Stats>("/api/lokmitra/stats", 15_000);
  const pct = s ? Math.min(100, (s.spend_usd / Math.max(s.budget_usd, 0.0001)) * 100) : 0;
  const maxT = Math.max(1, ...(s?.timeline ?? []).map((t) => t.free + t.paid));
  const maxScheme = Math.max(1, ...(s?.reports.schemes ?? []).map((x) => x.n));
  const maxState = Math.max(1, ...(s?.reports.states ?? []).map((x) => x.n));
  const maxCalls = Math.max(1, ...Object.values(s?.calls_by_surface ?? {}));
  // what the same traffic would cost if every citizen triggered an Agent run (no cache)
  const naive = s ? (s.cache.hits + s.cache.misses) * 8 * s.wallet.rates.step : 0;

  return (
    <div className="page">
      <PageHead title="Impact & Wallet" sub={<>Judge view, computed from LokMitra’s own audit log and the live TinyFish wallet. The proof of <b>Discover-Once-Fetch-Forever</b>: free calls dominate, Agent spend is paid once per combo, and the cost per citizen keeps falling.</>}>
        <span className="chip">store: {s?.backend ?? "…"}</span>
        <button className="btn sm" onClick={reload}>↻</button>
      </PageHead>
      {error && <p className="note err">⚠ {error}</p>}
      {loading && !s && <p className="note">loading…</p>}

      <div className="grid-4">
        <Kpi label="wallet balance" value={s?.wallet.balance === null || s?.wallet.balance === undefined ? "—" : `$${s.wallet.balance.toFixed(3)}`} sub={s?.wallet.error ?? `rates from ${s?.wallet.rates.source ?? "…"}`} tone="teal" />
        <Kpi label="LokMitra spend vs budget" value={`${usd(s?.spend_usd ?? 0, 3)} / $${s?.budget_usd ?? 5}`} sub={<span className="track-wrap"><span className="hbar" style={{ gridTemplateColumns: "1fr" }}><span className="track"><span className="fill" style={{ width: `${pct}%`, display: "block", background: pct > 80 ? "var(--coral)" : undefined }} /></span></span></span>} tone="amber" />
        <Kpi label="free share of calls" value={`${s?.cache.free_pct ?? 100}%`} sub={`${s?.cache.free_calls ?? 0} free · ${s?.cache.paid_calls ?? 0} paid`} tone="jade" />
        <Kpi label="cache hit rate" value={`${s?.cache.hit_pct ?? 0}%`} sub={`${s?.cache.hits ?? 0} hits / ${s?.cache.misses ?? 0} misses`} />
        <Kpi label="citizen reports" value={s?.reports.total ?? 0} sub={`${s?.reports.citizens ?? 0} unique citizens`} tone="teal" />
        <Kpi label="schemes surfaced" value={s?.impact.schemes_surfaced ?? 0} sub={`${s?.reports.sections ?? 0} scheme answers`} />
        <Kpi label="est. hours saved" value={s?.impact.hours_saved ?? 0} sub="≈75 min per scheme vs CSC visit" tone="jade" />
        <Kpi label="avg cost / report" value={s?.impact.avg_cost_per_report_usd === null || s?.impact.avg_cost_per_report_usd === undefined ? "$0" : usd(s.impact.avg_cost_per_report_usd)} sub={`${s?.impact.agent_runs ?? 0} paid agent runs total`} tone="amber" />
      </div>

      <div className="grid-2">
        <Panel title="Discover once, fetch forever" sub="One-time Agent discovery amortised across every citizen served from portal_map.">
          <div className="grid-2">
            <Kpi label="cached paths" value={s?.portal_map.rows ?? 0} sub={`${s?.portal_map.agent_rows ?? 0} by Agent`} />
            <Kpi label="citizens served from cache" value={s?.portal_map.hits ?? 0} tone="jade" />
            <Kpi label="discovery spend" value={usd(s?.portal_map.discovery_usd ?? 0, 3)} tone="amber" />
            <Kpi label="amortised / citizen" value={s?.portal_map.amortised_usd_per_hit === null || s?.portal_map.amortised_usd_per_hit === undefined ? "—" : `$${s.portal_map.amortised_usd_per_hit.toFixed(5)}`} tone="teal" />
          </div>
          <p className="note" style={{ marginTop: 10 }}>
            Without the cache, the same {(s?.cache.hits ?? 0) + (s?.cache.misses ?? 0)} lookups at ~8 Agent steps each would have cost ≈ <b>{usd(naive, 2)}</b>. LokMitra spent <b>{usd(s?.spend_usd ?? 0, 3)}</b>.
          </p>
        </Panel>

        <Panel title="Last 24 hours" sub="free (Search + Fetch) vs paid calls per hour">
          <div className="bars" aria-label="hourly calls">
            {(s?.timeline ?? []).map((t) => (
              <div key={t.hour} className="bar" title={`${t.hour.slice(11)}:00 UTC · ${t.free} free · ${t.paid} paid · $${t.cost}`}>
                <i style={{ height: `${(t.free / maxT) * 110}px`, background: "var(--teal)" }} />
                <i style={{ height: `${(t.paid / maxT) * 110}px`, background: "var(--ember)" }} />
              </div>
            ))}
          </div>
          <div className="row note" style={{ marginTop: 6 }}>
            <span><i className="sw" style={{ background: "var(--teal)", display: "inline-block", width: 10, height: 10, borderRadius: 2 }} /> free</span>
            <span><i className="sw" style={{ background: "var(--ember)", display: "inline-block", width: 10, height: 10, borderRadius: 2 }} /> paid</span>
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
            <Kpi label="browser sessions" value={s?.live.browser_sessions ?? 0} />
            <Kpi label="OTP relays" value={s?.live.otp_relays ?? 0} tone="teal" />
            <Kpi label="pending consents" value={s?.live.pending_confirms ?? 0} />
          </div>
        </Panel>

        <Panel title="Live rates (wallet)">
          <div className="stack" style={{ gap: 6 }}>
            <div className="pf-field"><span className="k">agent step</span><b>${s?.wallet.rates.step ?? "—"}</b></div>
            <div className="pf-field"><span className="k">browser minute</span><b>${s?.wallet.rates.browserPerMin ?? "—"}</b></div>
            <div className="pf-field"><span className="k">monitor run</span><b>${s?.wallet.rates.monitor ?? "—"}</b></div>
            <div className="pf-field"><span className="k">search / fetch</span><b>FREE (12k searches · 1k fetches / day)</b></div>
            <p className="note">generated {s ? new Date(s.generated_at).toLocaleTimeString() : "—"}</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
