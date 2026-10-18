"use client";
import { useEffect, useRef, useState } from "react";
import { Kpi, PageHead, Panel } from "@/components/ui";
import { citizenId, ssePost } from "@/lib/client";

interface Tick {
  at: string;
  wallet: number | null;
  wallet_error: string | null;
  spend_usd: number;
  budget_usd: number;
  cache: { hits: number; misses: number; hit_pct: number; free_calls: number; paid_calls: number; free_pct: number };
  portal_map: { rows: number; agent_rows: number; hits: number; discovery_usd: number };
  reports: number;
  hours_saved: number;
  calls_by_surface: Record<string, number>;
  live_run: { run_id: string; status: string; goal: string; streaming_url: string | null; steps: number } | null;
  recent_runs: { run_id: string; status: string; goal: string; steps: number; streaming_url: string | null; created_at: string }[];
}
interface Rehearsal { label: string; ms: number | null; hits: number; misses: number; report_id: string | null; stages: string[]; walletBefore: number | null; walletAfter: number | null; error?: string }

const DEMO = "Main Nashik ka kisan hoon. PM-KISAN ki eligibility, aaj gehu ka mandi bhaav, aur Ayushman Bharat mein kya milta hai?";

/**
 * Judge Console — one screen for the live demo:
 *  - SSE wallet counter (server pushes the live TinyFish balance every ~4 s) + session delta
 *  - cache ring: hit ratio and free-vs-paid call share (Discover-Once-Fetch-Forever proof)
 *  - embedded live browser preview of the newest running Agent run (streaming_url)
 *  - Rehearsal: the same multi-domain query for two "virtual farmers"; the second is served
 *    from portal_map, so it's faster and costs $0. The wallet delta is shown for both.
 */
export function Judge() {
  const [tick, setTick] = useState<Tick | null>(null);
  const [conn, setConn] = useState<"connecting" | "live" | "retrying">("connecting");
  const start = useRef<number | null>(null);
  const [history, setHistory] = useState<{ t: number; w: number }[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [query, setQuery] = useState(DEMO);
  const [reh, setReh] = useState<Rehearsal[]>([]);
  const [running, setRunning] = useState(false);
  const lastTick = useRef<Tick | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/lokmitra/judge/stream");
    es.addEventListener("tick", (ev) => {
      const d = JSON.parse((ev as MessageEvent).data) as Tick;
      lastTick.current = d;
      setTick(d);
      setConn("live");
      if (d.wallet !== null) {
        if (start.current === null) start.current = d.wallet;
        setHistory((h) => [...h, { t: Date.now(), w: d.wallet! }].slice(-90));
      }
      if (d.live_run?.streaming_url) setPreview((p) => p ?? d.live_run!.streaming_url);
    });
    es.onerror = () => setConn("retrying");
    return () => es.close();
  }, []);

  const delta = tick?.wallet !== null && tick?.wallet !== undefined && start.current !== null ? start.current - tick.wallet : 0;
  const pct = tick ? Math.min(100, (tick.spend_usd / Math.max(tick.budget_usd, 0.0001)) * 100) : 0;
  const R = 54;
  const C = 2 * Math.PI * R;
  const hitArc = ((tick?.cache.hit_pct ?? 0) / 100) * C;
  const freeArc = ((tick?.cache.free_pct ?? 100) / 100) * (2 * Math.PI * 40);

  async function rehearse() {
    if (running) return;
    setRunning(true);
    setReh([]);
    for (const [i, label] of ["Farmer #1 (first ask — may be cache MISS)", "Farmer #2 (same state & schemes — cache HIT)"].entries()) {
      const before = lastTick.current?.wallet ?? null;
      const row: Rehearsal = { label, ms: null, hits: 0, misses: 0, report_id: null, stages: [], walletBefore: before, walletAfter: null };
      setReh((r) => [...r, row]);
      const t0 = performance.now();
      try {
        await ssePost(
          "/api/lokmitra/ask?stream=1",
          { text: query, user_id: `${citizenId()}r${i}`.slice(0, 80), language: "hi", state_code: "MH", district: "Nashik", channel: "web" },
          (m) => {
            if (m.event === "stage") row.stages = [...row.stages, String((m.data as { message?: string }).message ?? "")].slice(-6);
            if (m.event === "report") {
              const d = m.data as { report_id: string; cache_hits: number; cache_misses: number };
              row.report_id = d.report_id;
              row.hits = d.cache_hits;
              row.misses = d.cache_misses;
            }
            if (m.event === "error") row.error = String((m.data as { message?: string }).message ?? "error");
            setReh((r) => r.map((x, j) => (j === i ? { ...row } : x)));
          },
        );
      } catch (e) {
        row.error = (e as Error).message;
      }
      row.ms = Math.round(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 4500)); // let the SSE wallet tick refresh
      row.walletAfter = lastTick.current?.wallet ?? null;
      setReh((r) => r.map((x, j) => (j === i ? { ...row } : x)));
    }
    setRunning(false);
  }

  const spark = (() => {
    if (history.length < 2) return "";
    const ws = history.map((h) => h.w);
    const min = Math.min(...ws);
    const max = Math.max(...ws);
    const span = Math.max(max - min, 0.0005);
    return history.map((h, i) => `${(i / (history.length - 1)) * 300},${50 - ((h.w - min) / span) * 44 - 3}`).join(" ");
  })();

  return (
    <div className="page">
      <PageHead title="Judge Console" sub={<>Everything a judge needs on one screen. The live TinyFish Wallet counter (pushed over SSE), cache ratio, the agent's live browser, and a two-farmer rehearsal that shows <b>Discover-Once-Fetch-Forever</b> working.</>}>
        <span className={`chip ${conn === "live" ? "hit" : "miss"}`}>{conn === "live" ? "● SSE live" : conn}</span>
        <span className="chip">{tick ? new Date(tick.at).toLocaleTimeString("en-IN") : "…"}</span>
      </PageHead>

      <div className="judge-grid">
        <Panel title="Wallet (live)" sub="GET /v1/wallet pushed every ~4 s">
          <div className="judge-wallet" aria-live="polite">
            <div className="judge-odo">{tick?.wallet === null || tick?.wallet === undefined ? "—" : `$${tick.wallet.toFixed(4)}`}</div>
            <div className="note">
              this session: <b className={delta > 0 ? "warn-text" : ""}>{delta > 0 ? `−$${delta.toFixed(4)}` : "$0.0000"}</b> · LokMitra spend <b>${(tick?.spend_usd ?? 0).toFixed(3)}</b> / ${tick?.budget_usd ?? 5}
            </div>
            <div className="hbar" style={{ gridTemplateColumns: "1fr" }}>
              <span className="track"><span className="fill" style={{ width: `${pct}%`, display: "block", background: pct > 80 ? "var(--coral)" : undefined }} /></span>
            </div>
            {spark && (
              <svg viewBox="0 0 300 50" className="judge-spark" preserveAspectRatio="none" aria-label="wallet balance trend">
                <polyline points={spark} fill="none" stroke="var(--teal)" strokeWidth="1.6" />
              </svg>
            )}
            {tick?.wallet_error && <p className="note err">⚠ {tick.wallet_error}</p>}
          </div>
        </Panel>

        <Panel title="Cache ratio" sub="outer = cache hits · inner = free Search/Fetch share">
          <div className="judge-ring">
            <svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label={`cache hit ${tick?.cache.hit_pct ?? 0}%`}>
              <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="10" />
              <circle cx="70" cy="70" r={R} fill="none" stroke="var(--jade)" strokeWidth="10" strokeDasharray={`${hitArc} ${C}`} transform="rotate(-90 70 70)" strokeLinecap="round" />
              <circle cx="70" cy="70" r="40" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="7" />
              <circle cx="70" cy="70" r="40" fill="none" stroke="var(--teal)" strokeWidth="7" strokeDasharray={`${freeArc} ${2 * Math.PI * 40}`} transform="rotate(-90 70 70)" strokeLinecap="round" />
              <text x="70" y="68" textAnchor="middle" fill="var(--pearl)" fontSize="22" fontWeight="700">{tick?.cache.hit_pct ?? 0}%</text>
              <text x="70" y="86" textAnchor="middle" fill="var(--fog)" fontSize="9">cache hit</text>
            </svg>
            <div className="stack" style={{ gap: 4 }}>
              <span className="note">✓ {tick?.cache.hits ?? 0} hits · ✕ {tick?.cache.misses ?? 0} misses</span>
              <span className="note">free {tick?.cache.free_calls ?? 0} · paid {tick?.cache.paid_calls ?? 0} ({tick?.cache.free_pct ?? 100}% free)</span>
              <span className="note">portal_map {tick?.portal_map.rows ?? 0} paths · {tick?.portal_map.hits ?? 0} served</span>
              <span className="note">reports {tick?.reports ?? 0} · ≈{tick?.hours_saved ?? 0} h saved</span>
            </div>
          </div>
        </Panel>

        <div className="grid-2" style={{ gridColumn: "1 / -1" }}>
          {Object.entries(tick?.calls_by_surface ?? {}).length > 0 && (
            <div className="row" style={{ gridColumn: "1 / -1", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(tick?.calls_by_surface ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Kpi key={k} label={k} value={v} tone={k === "agent" || k === "browser" || k === "monitor" ? "amber" : "jade"} />)}
            </div>
          )}
        </div>

        <Panel title="Live browser preview" sub={tick?.live_run ? `▶ ${tick.live_run.status} · ${tick.live_run.steps} steps · ${tick.live_run.goal.slice(0, 90)}…` : "Shows the newest running Agent run automatically (streaming_url). Start one from Sahayak (✅ consent) or Portal Map (discover)."} className="judge-wide"
          right={preview && <><a className="btn sm" href={preview} target="_blank" rel="noreferrer">↗ open</a><button className="btn sm" onClick={() => setPreview(null)}>✕</button></>}>
          {preview ? (
            <iframe className="judge-frame" src={preview} title="TinyFish agent live browser" sandbox="allow-scripts allow-same-origin" />
          ) : (
            <div className="judge-frame empty">
              <p className="note">// no agent is running right now: the free path (Search + Fetch) is serving citizens. Pick a recent run below to replay its live view, if it is still available.</p>
            </div>
          )}
          <div className="stack" style={{ gap: 4, marginTop: 8 }}>
            {(tick?.recent_runs ?? []).slice(0, 5).map((r) => (
              <div key={r.run_id} className="row" style={{ gap: 6 }}>
                <span className={`chip ${r.status === "COMPLETED" ? "hit" : r.status === "RUNNING" ? "" : "miss"}`}>{r.status}</span>
                <span className="note mono">{r.run_id.slice(0, 8)} · {r.steps} steps · {new Date(r.created_at).toLocaleTimeString("en-IN")}</span>
                <span className="note" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.goal}</span>
                {r.streaming_url && <button className="btn sm" onClick={() => setPreview(r.streaming_url)}>▶ view</button>}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Rehearsal: two virtual farmers" sub="Same multi-domain question, same state. Free path only (Search + Fetch), so no Agent is started." className="judge-wide"
          right={<button className="btn primary sm" onClick={rehearse} disabled={running}>{running ? "running…" : "▶ Run rehearsal"}</button>}>
          <textarea className="input" rows={2} value={query} onChange={(e) => setQuery(e.target.value)} disabled={running} aria-label="Rehearsal question" />
          <div className="grid-2" style={{ marginTop: 10 }}>
            {reh.map((r, i) => (
              <div key={i} className="section-card">
                <h4>{r.label}</h4>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <span className="chip">{r.ms === null ? "…" : `${(r.ms / 1000).toFixed(1)} s`}</span>
                  <span className="chip hit">⚡ {r.hits} hit</span>
                  <span className={`chip ${r.misses ? "miss" : ""}`}>{r.misses} miss</span>
                  <span className="chip">
                    wallet Δ {r.walletBefore !== null && r.walletAfter !== null ? `$${Math.max(0, r.walletBefore - r.walletAfter).toFixed(4)}` : "…"}
                  </span>
                </div>
                <ul className="note" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {r.stages.map((s, j) => <li key={j}>{s}</li>)}
                </ul>
                {r.error && <p className="note err">⚠ {r.error}</p>}
                {r.report_id && (
                  <div className="row" style={{ marginTop: 6 }}>
                    <a className="btn sm" href={`/report/${r.report_id}`} target="_blank" rel="noreferrer">🖨 slip</a>
                    <a className="btn sm" href={`/api/lokmitra/report/${r.report_id}/email?preview=1`} target="_blank" rel="noreferrer">👁 e-mail</a>
                  </div>
                )}
              </div>
            ))}
          </div>
          {reh.length === 2 && reh[0].ms && reh[1].ms && (
            <p className="note ok" style={{ marginTop: 8 }}>
              ✓ Farmer #2 took {(reh[1].ms / 1000).toFixed(1)} s vs {(reh[0].ms / 1000).toFixed(1)} s, with {reh[1].hits}/{reh[1].hits + reh[1].misses} answers from the LokMitra cache. Agent spend for both: $0.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
