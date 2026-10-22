"use client";
import { useEffect, useState } from "react";
import { api, ago, hostOf } from "@/lib/client";
import type { RelaySnapshot } from "@/components/RelayPanel";
import { Flash, Kpi, PageHead, Panel, useAction, useApi, usd } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface LiveView { handle: string; kind: "browser_api" | "profile_setup"; session_id: string; profile_id: string | null; label: string | null; url: string | null; last_url: string | null; last_title: string | null; started_at: string; expires_at: string; minutes: number; est_cost_usd: number; actions: number; snapshot?: RelaySnapshot | null; error?: string }

const PRESETS = [
  { label: "PM-KISAN home", url: "https://pmkisan.gov.in/" },
  { label: "UP Bhulekh (land)", url: "https://upbhulekh.gov.in/" },
  { label: "Maharashtra 7/12", url: "https://bhulekh.mahabhumi.gov.in/" },
  { label: "Agmarknet mandi", url: "https://agmarknet.gov.in/" },
  { label: "myScheme", url: "https://www.myscheme.gov.in/" },
  { label: "PM-JAY beneficiary", url: "https://beneficiary.nha.gov.in/" },
];

export function Live() {
  const list = useApi<{ sessions: LiveView[] }>("/api/lokmitra/live", 15_000);
  const act = useAction();
  const [cur, setCur] = useState<LiveView | null>(null);
  const [url, setUrl] = useState(PRESETS[0].url);
  const [timeout, setTimeoutS] = useState(300);
  const [nav, setNav] = useState("");
  const [vals, setVals] = useState<Record<number, string>>({});
  const [auto, setAuto] = useState(false);

  // deep link /live?handle=browser_…
  useEffect(() => {
    const h = new URLSearchParams(window.location.search).get("handle");
    if (h && /^browser_[0-9a-f-]{36}$/.test(h)) void attach(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setVals(Object.fromEntries((cur?.snapshot?.fields ?? []).filter((f) => ["text", "otp", "captcha", "select"].includes(f.kind)).map((f) => [f.idx, f.value === "••••" ? "" : f.value])));
    if (cur?.snapshot?.url) setNav(cur.snapshot.url);
  }, [cur?.snapshot]);

  // optional auto-refresh of the screenshot (each refresh = one CDP screenshot, no extra TinyFish fee beyond browser minutes)
  useEffect(() => {
    if (!auto || !cur) return;
    const t = setInterval(() => void send([{ op: "scan" }], null), 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, cur?.handle]);

  const send = async (actions: unknown[], label: string | null, handle = cur?.handle) => {
    if (!handle) return;
    const r = label
      ? await act.run(label, () => api<LiveView>(`/api/lokmitra/live/${handle}`, { body: { actions } }))
      : await api<LiveView>(`/api/lokmitra/live/${handle}`, { body: { actions } }).catch(() => null);
    if (r) setCur(r);
    if (r?.error) act.setError(r.error);
  };
  const attach = (handle: string) => send([{ op: "scan" }], "Attaching to the remote browser", handle);
  const start = () =>
    act.run("Starting a TinyFish Browser API session", () => api<LiveView>("/api/lokmitra/live", { body: { url, timeout_seconds: timeout, label: hostOf(url) } }), (r) => {
      setCur(r);
      void list.reload();
      return r?.error ?? `session ${r?.session_id.slice(0, 8)} running · billed per minute`;
    });
  const stop = (h: string) =>
    act.run("Terminating browser session", () => api<{ minutes: number; cost_usd: number }>(`/api/lokmitra/live/${h}`, { method: "DELETE" }), (r) => {
      if (cur?.handle === h) setCur(null);
      void list.reload();
      return r ? `stopped after ${r.minutes} min · ${usd(r.cost_usd)} metered` : undefined;
    });
  const saveProfile = () =>
    cur &&
    act.run("Saving cookies into the Browser Context Profile", () => api<{ cookie_count: number; domains_updated: string[] }>(`/api/lokmitra/live/${cur.handle}/save`, { body: {} }), (r) => {
      setCur(null);
      void list.reload();
      return r ? `saved ${r.cookie_count} cookies for ${r.domains_updated.join(", ") || "—"} — agents can now run with use_profile` : undefined;
    });

  const fields = cur?.snapshot?.fields ?? [];
  const inputs = fields.filter((f) => ["text", "otp", "captcha", "select"].includes(f.kind));
  const buttons = fields.filter((f) => (f.kind === "button" || f.kind === "link") && f.label).slice(0, 24);
  const sessions = list.data?.sessions ?? [];
  const pushFills = () => inputs.filter((f) => vals[f.idx] !== undefined && vals[f.idx] !== (f.value === "••••" ? "" : f.value)).map((f) => ({ op: "fill", idx: f.idx, value: vals[f.idx] }));

  return (
    <div className="page">
      <PageHead
        title="Live Browser"
        sub={<>A real TinyFish <b>Browser API</b> session driven over CDP from this dashboard — the judge-facing “watch it live” panel and the manual fallback for Bhulekh cascades and other edge cases. Agent runs stream their own live view on Sahayak / Portal Map via <code>streaming_url</code>.</>}
      />

      <div className="grid-4">
        <Kpi label="open sessions" value={sessions.length} tone="teal" />
        <Kpi label="minutes running" value={sessions.reduce((a, s) => a + s.minutes, 0).toFixed(1)} />
        <Kpi label="est. metered cost" value={usd(sessions.reduce((a, s) => a + s.est_cost_usd, 0))} tone="amber" />
        <Kpi label="actions relayed" value={sessions.reduce((a, s) => a + s.actions, 0)} tone="jade" />
      </div>

      <Panel title="Start a session" sub="Operator action. The raw cdp_url never leaves the server — this page only holds an opaque handle.">
        <div className="row">
          <input className="input" style={{ flex: 1, minWidth: 260 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          <select className="select" style={{ width: 150 }} value={timeout} onChange={(e) => setTimeoutS(Number(e.target.value))}>
            {[120, 300, 600, 900].map((s) => <option key={s} value={s}>{s / 60} min max</option>)}
          </select>
          <button className="btn paid" disabled={!!act.busy} onClick={start}>▶ Start browser</button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {PRESETS.map((p) => <button key={p.url} className="preset" onClick={() => setUrl(p.url)}>{p.label}</button>)}
        </div>
        <Flash {...act} />
      </Panel>

      {cur && (
        <Panel
          title={cur.kind === "profile_setup" ? "Profile setup session" : "Live session"}
          sub={<span className="mono">{cur.session_id} · {cur.minutes} min · {usd(cur.est_cost_usd)}</span>}
          right={
            <>
              <label className="row note" style={{ gap: 6 }}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto-refresh</label>
              <button className="btn sm" disabled={!!act.busy} onClick={() => send([{ op: "scan" }], "Refreshing")}><Icon name="refresh" /></button>
              {cur.kind === "profile_setup" && <button className="btn sm paid" disabled={!!act.busy} onClick={saveProfile}><Icon name="save" /> Save login to profile</button>}
              <button className="btn sm danger" disabled={!!act.busy} onClick={() => stop(cur.handle)}>■ Stop</button>
            </>
          }
        >
          <div className="row" style={{ marginBottom: 10 }}>
            <input className="input" style={{ flex: 1 }} value={nav} onChange={(e) => setNav(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send([{ op: "navigate", url: nav }], "Navigating")} />
            <button className="btn sm" disabled={!/^https?:\/\//.test(nav) || !!act.busy} onClick={() => send([{ op: "navigate", url: nav }], "Navigating")}>Go</button>
          </div>
          <div className="relay-grid">
            <figure className="relay-shot">
              {cur.snapshot?.screenshot ? <img className="shot-frame" src={cur.snapshot.screenshot} alt={`Live screenshot of ${cur.snapshot.title}`} /> : <div className="empty">no screenshot yet — press <Icon name="refresh" /></div>}
              <figcaption className="note">
                {cur.snapshot?.title ?? cur.last_title ?? "—"} · <span className="mono">{hostOf(cur.snapshot?.url ?? cur.last_url ?? "")}</span>
                {cur.snapshot?.captcha_present && <span className="chip miss" style={{ marginLeft: 8 }}>CAPTCHA</span>}
              </figcaption>
            </figure>
            <div className="stack">
              <span className="label">Fields ({inputs.length})</span>
              {inputs.map((f) => (
                <label key={f.idx} className="stack" style={{ gap: 2 }}>
                  <span className="note">#{f.idx} {f.label || f.type} {f.kind !== "text" ? `· ${f.kind}` : ""}</span>
                  {f.kind === "select" ? (
                    <select className="select" value={vals[f.idx] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.idx]: e.target.value }))}>
                      {(f.options ?? []).map((o) => <option key={`${o.value}-${o.label}`} value={o.value}>{o.label || o.value}</option>)}
                    </select>
                  ) : (
                    <input className="input" value={vals[f.idx] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.idx]: e.target.value }))} />
                  )}
                </label>
              ))}
              <div className="row">
                <button className="btn sm" disabled={!!act.busy} onClick={() => send(pushFills().length ? pushFills() : [{ op: "scan" }], "Typing")}><Icon name="keyboard" /> Apply fields</button>
              </div>
              {buttons.length > 0 && <span className="label">Buttons / links</span>}
              <div className="row">
                {buttons.map((b) => (
                  <button key={b.idx} className="btn sm" disabled={!!act.busy} onClick={() => send([...pushFills(), { op: "click", idx: b.idx }], `Clicking “${b.label.slice(0, 30)}”`)}>
                    {b.label.slice(0, 32)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      )}

      <Panel title={`Open sessions · ${sessions.length}`} right={<button className="btn sm" onClick={list.reload}><Icon name="refresh" /></button>}>
        {!sessions.length ? (
          <div className="empty">No live sessions. Browser minutes stop billing when a session is stopped or times out.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Kind</th><th>Page</th><th>Started</th><th>Min</th><th>Est. cost</th><th>Actions</th><th /></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.handle}>
                    <td><span className="chip">{s.kind === "browser_api" ? "Browser API" : "profile setup"}</span></td>
                    <td><span className="ellipsis" style={{ maxWidth: 300 }}>{s.last_title ?? s.label ?? hostOf(s.last_url ?? s.url ?? "")}</span></td>
                    <td className="mono">{ago(s.started_at)}</td>
                    <td className="mono">{s.minutes}</td>
                    <td className="mono">{usd(s.est_cost_usd)}</td>
                    <td className="mono">{s.actions}</td>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <button className="btn sm" onClick={() => attach(s.handle)}>Attach</button>
                        <button className="btn sm danger" onClick={() => stop(s.handle)}>Stop</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
