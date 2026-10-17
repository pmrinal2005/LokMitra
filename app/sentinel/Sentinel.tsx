"use client";
import { useState } from "react";
import { api, ago, citizenId, hostOf } from "@/lib/client";
import { Flash, Json, Kpi, PageHead, Panel, useAction, useApi } from "@/components/ui";

interface LiveMon { id: string; name?: string | null; type: string; status: string; schedule_cron: string; last_error: string | null; config: Record<string, unknown>; updated_at?: string }
interface SentinelRow { id?: string; monitor_id: string; monitor_type: "fetch" | "search"; scheme_id: string; scheme_name: string; state_code: string; kind: string; target: string; schedule_cron: string; purpose?: string | null; last_run_at?: string | null; last_change?: Record<string, unknown> | null; created_at?: string; live: LiveMon | null; subscribers: number }
interface Ev { id: string; monitor_id: string; source: string; changed: boolean; summary: string | null; notified: number; created_at: string }
interface Res { sentinels: SentinelRow[]; events: Ev[]; other_monitors: LiveMon[]; live_error: string | null }
interface Registry { schemes: { id: string; name: string; state_specific: boolean }[]; states: { code: string; name: string }[] }

const KINDS = [
  { id: "deadline", label: "Deadline page", hint: "Page Monitor on the scheme's deadline / enrolment page — alerts when dates change." },
  { id: "circular", label: "New circulars / GRs", hint: "Topic Monitor (Search) for new notices, circulars and guideline PDFs." },
  { id: "compliance", label: "Compliance sentinel", hint: "Page Monitor whose diff is checked against cached guideline facts to flag guideline-vs-portal contradictions." },
];
const CRONS = [
  { v: "CRON_TZ=Asia/Kolkata 0 8 * * 1", l: "Weekly · Mon 08:00 IST" },
  { v: "CRON_TZ=Asia/Kolkata 0 8 * * *", l: "Daily · 08:00 IST" },
  { v: "CRON_TZ=Asia/Kolkata 0 8,18 * * *", l: "Twice daily" },
];

export function Sentinel() {
  const q = useApi<Res>("/api/lokmitra/sentinels", 30_000);
  const reg = useApi<Registry>("/api/lokmitra/schemes");
  const act = useAction();
  const [form, setForm] = useState({ scheme_id: "pmfby", state_code: "IN", kind: "deadline", schedule_cron: CRONS[0].v, target: "" });
  const [email, setEmail] = useState("");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const create = () =>
    act.run("Creating TinyFish Monitor + baseline ($0.005)", () => api<{ created: boolean; sentinel: SentinelRow }>("/api/lokmitra/sentinels", { body: { ...form, target: form.target || undefined } }), (r) => {
      void q.reload();
      return r ? (r.created ? `Monitor ${r.sentinel.monitor_id.slice(0, 8)} created — baseline captured` : "Already watching this (scheme × state × kind) — reused, no extra cost") : undefined;
    });
  const runNow = (id: string) =>
    act.run("Running Monitor now ($0.005 + free Fetch/Search)", () => api<{ processed: { changed: boolean; summary: string; notified: number }; results: number }>(`/api/lokmitra/sentinels/${id}/run`, { method: "POST" }), (r) => {
      void q.reload();
      return r ? `${r.processed.changed ? "CHANGE detected" : "no change"} · ${r.processed.summary?.slice(0, 160) ?? ""} · notified ${r.processed.notified}` : undefined;
    });
  const setStatus = (id: string, status: "active" | "paused") => act.run(`${status === "paused" ? "Pausing" : "Resuming"} monitor`, () => api(`/api/lokmitra/sentinels/${id}`, { method: "PATCH", body: { status } }), () => (void q.reload(), `monitor ${status}`));
  const del = (id: string) => confirm("Delete this Monitor at TinyFish?") && act.run("Deleting monitor", () => api(`/api/lokmitra/sentinels/${id}`, { method: "DELETE" }), () => (void q.reload(), "deleted"));
  const sub = (id: string) =>
    act.run("Subscribing", () => api(`/api/lokmitra/sentinels/${id}/subscribe`, { body: email ? { email } : { user_id: citizenId() } }), () => (void q.reload(), email ? `alerts will be e-mailed to ${email}` : "subscribed this browser (alerts appear here and on Telegram if linked)"));
  const open = (id: string) => act.run("Loading monitor", () => api<Record<string, unknown>>(`/api/lokmitra/sentinels/${id}`), (r) => void setDetail(r));

  const rows = q.data?.sentinels ?? [];
  const events = q.data?.events ?? [];
  const changes = events.filter((e) => e.changed).length;
  const subs = rows.reduce((a, r) => a + r.subscribers, 0);
  const schemeName = (id: string) => reg.data?.schemes.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="page">
      <PageHead
        title="Deadline & Circular Sentinel"
        sub={<>TinyFish <b>Monitor</b> replaces the Agent for every “has anything changed?” question. One Monitor per scheme × state; each run costs $0.005 + a free Fetch/Search, and a single detected change fans out to <b>every</b> subscribed citizen on Telegram / e-mail.</>}
      >
        <span className="chip">Monitor ≈ 3× cheaper than 1 Agent step</span>
      </PageHead>

      <div className="grid-4">
        <Kpi label="sentinels" value={rows.length} sub={`${rows.filter((r) => r.live?.status === "active").length} active at TinyFish`} tone="teal" />
        <Kpi label="subscribers" value={subs} sub="alerted per change" tone="jade" />
        <Kpi label="changes detected" value={changes} sub={`of ${events.length} recent runs`} tone="amber" />
        <Kpi label="other monitors" value={q.data?.other_monitors.length ?? "—"} sub="on this TinyFish account" />
      </div>

      <Panel title="Watch a scheme" sub={KINDS.find((k) => k.id === form.kind)?.hint}>
        <div className="field-grid">
          <label>
            <span className="label">Scheme</span>
            <select className="select" value={form.scheme_id} onChange={(e) => setForm({ ...form, scheme_id: e.target.value })}>
              {(reg.data?.schemes ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>
            <span className="label">State</span>
            <select className="select" value={form.state_code} onChange={(e) => setForm({ ...form, state_code: e.target.value })}>
              {(reg.data?.states ?? [{ code: "IN", name: "All India" }]).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Kind</span>
            <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Schedule</span>
            <select className="select" value={form.schedule_cron} onChange={(e) => setForm({ ...form, schedule_cron: e.target.value })}>
              {CRONS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </label>
          <label className="span-2">
            <span className="label">{form.kind === "circular" ? "Custom query (optional)" : "Custom page URL (optional)"}</span>
            <input className="input" placeholder={form.kind === "circular" ? "auto: “<scheme> new circular notification <state>”" : "auto: best deadline / guideline page from portal_map"} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn paid" disabled={!!act.busy} onClick={create}>🔔 Create sentinel ≈ $0.005</button>
          <input className="input" style={{ width: 240 }} placeholder="alerts e-mail (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <span className="note">Subscribe buttons below use this e-mail, otherwise this browser’s citizen id.</span>
        </div>
        <Flash {...act} />
        {q.data?.live_error && <p className="note err">TinyFish monitors: {q.data.live_error}</p>}
      </Panel>

      <Panel title={`Sentinels · ${rows.length}`} right={<button className="btn sm" onClick={q.reload}>↻</button>}>
        {!rows.length ? (
          <div className="empty">{q.loading ? "loading…" : "No sentinels yet — create one above (e.g. PMFBY Kharif enrolment deadline)."}</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Scheme</th><th>State</th><th>Kind</th><th>Type</th><th>Target</th><th>Schedule</th><th>Status</th><th>Subs</th><th>Last run</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.monitor_id}>
                    <td><b>{r.scheme_name || schemeName(r.scheme_id)}</b></td>
                    <td className="mono">{r.state_code}</td>
                    <td><span className="chip">{r.kind}</span></td>
                    <td className="mono">{r.monitor_type === "search" ? "topic" : "page"}</td>
                    <td className="mono"><span className="ellipsis" style={{ maxWidth: 220 }} title={r.target}>{r.monitor_type === "fetch" ? hostOf(r.target) : r.target}</span></td>
                    <td className="mono">{r.schedule_cron.replace(/^CRON_TZ=\S+\s+/, "")}</td>
                    <td>
                      <span className={`chip ${r.live?.status === "active" ? "hit" : "miss"}`}>{r.live?.status ?? "missing"}</span>
                      {r.live?.last_error && <div className="note err">{r.live.last_error}</div>}
                    </td>
                    <td className="mono">{r.subscribers}</td>
                    <td className="mono">{ago(r.last_run_at)}</td>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <button className="btn sm" disabled={!!act.busy} onClick={() => runNow(r.monitor_id)} title="Run now ($0.005)">▶ Run</button>
                        <button className="btn sm" disabled={!!act.busy} onClick={() => sub(r.monitor_id)}>＋ Subscribe</button>
                        {r.live?.status === "active" ? <button className="btn sm" onClick={() => setStatus(r.monitor_id, "paused")}>⏸</button> : r.live ? <button className="btn sm" onClick={() => setStatus(r.monitor_id, "active")}>⏵</button> : null}
                        <button className="btn sm" onClick={() => open(r.monitor_id)}>ⓘ</button>
                        <button className="btn sm danger" onClick={() => del(r.monitor_id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {detail && (
          <div className="section-card" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>Monitor detail</b>
              <button className="btn sm" onClick={() => setDetail(null)}>close</button>
            </div>
            <Json value={detail} max={320} />
          </div>
        )}
      </Panel>

      <div className="grid-2">
        <Panel title="Recent change events" sub="Every webhook delivery and run-now, with the detected diff and how many citizens were alerted.">
          {!events.length ? (
            <div className="empty">No monitor runs yet.</div>
          ) : (
            <div className="stack" style={{ maxHeight: 420, overflow: "auto" }}>
              {events.map((e) => (
                <div key={e.id} className="section-card">
                  <h4>
                    <span className={`chip ${e.changed ? "miss" : "hit"}`}>{e.changed ? "CHANGED" : "no change"}</span>
                    <span className="chip">{e.source}</span>
                    <span className="mono note">{rows.find((r) => r.monitor_id === e.monitor_id)?.scheme_name ?? e.monitor_id.slice(0, 8)}</span>
                    <span className="mono note" style={{ marginLeft: "auto" }}>{ago(e.created_at)}</span>
                  </h4>
                  {e.summary && <p className="note" style={{ margin: 0 }}>{e.summary}</p>}
                  {e.notified > 0 && <span className="note ok">📣 {e.notified} citizen(s) alerted</span>}
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Other TinyFish monitors" sub="Monitors on this account not created by LokMitra (read-only).">
          {!q.data?.other_monitors.length ? (
            <div className="empty">none</div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Cron</th></tr></thead>
                <tbody>{q.data.other_monitors.map((m) => <tr key={m.id}><td>{m.name ?? m.id.slice(0, 8)}</td><td className="mono">{m.type}</td><td><span className="chip">{m.status}</span></td><td className="mono">{m.schedule_cron}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
