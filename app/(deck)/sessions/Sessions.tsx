"use client";
import { useEffect, useMemo, useState } from "react";
import { api, ago, hostOf } from "@/lib/client";
import { RelayPanel } from "@/components/RelayPanel";
import { Flash, Kpi, PageHead, Panel, useAction, useApi } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface Sess { id: string; kind: string; user_id: string | null; expires_at: string; created_at: string; data: Record<string, unknown> }
interface EProf { profile_id: string; user_id?: string | null; scheme_id?: string; state_code?: string; purpose: string; expires_at: string; deleted_at?: string | null; created_at: string }
interface TfProf { id: string; name: string; created_at?: string; is_default?: boolean }
interface Res { sessions: Sess[]; ephemeral_profiles: EProf[]; tinyfish_profiles: { profiles?: TfProf[]; error?: string } }

const KIND_LABEL: Record<string, string> = { confirm: "Confirmation gate", otp: "OTP relay", browser: "Live browser", chat: "Chat memory", tg_state: "Telegram state" };

function left(iso: string) {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(s) || s <= 0) return "expired";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

export function Sessions() {
  const q = useApi<Res>("/api/lokmitra/sessions", 15_000);
  const act = useAction();
  const [kind, setKind] = useState("");
  const [relay, setRelay] = useState<{ confirmId?: string; relayId?: string } | null>(null);
  const [newProf, setNewProf] = useState("");
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    // deep link: /sessions?relay=<confirm_… | otp_…>
    const p = new URLSearchParams(window.location.search).get("relay");
    if (p && /^confirm_[0-9a-f-]{36}$/.test(p)) setRelay({ confirmId: p });
    else if (p && /^otp_[0-9a-f-]{36}$/.test(p)) setRelay({ relayId: p });
    return () => clearInterval(t);
  }, []);

  const all = q.data?.sessions ?? [];
  const rows = useMemo(() => all.filter((s) => !kind || s.kind === kind), [all, kind]);
  const count = (k: string) => all.filter((s) => s.kind === k).length;
  const end = (s: Sess) => act.run(`Ending ${KIND_LABEL[s.kind] ?? s.kind}`, () => api(`/api/lokmitra/sessions?id=${encodeURIComponent(s.id)}`, { method: "DELETE" }), () => (void q.reload(), s.kind === "otp" ? "relay closed and its TinyFish profile deleted" : "session ended"));
  const delProfile = (id: string) => confirm(`Delete Browser Context Profile ${id}?`) && act.run("Deleting profile at TinyFish", () => api(`/api/tinyfish/profiles/${id}`, { method: "DELETE" }), () => (void q.reload(), "profile deleted"));
  const createProfile = () => newProf.trim() && act.run("Creating Browser Context Profile", () => api<{ id: string }>("/api/tinyfish/profiles", { body: { name: newProf.trim(), proxy_country_code: "IN" } }), (r) => (setNewProf(""), void q.reload(), r ? `profile ${r.id} created — open it on Live Browser to log in once` : undefined));
  const setupSession = (id: string) =>
    act.run("Opening a profile setup session", () => api<{ handle: string }>(`/api/tinyfish/profiles/${id}/setup-session`, { body: { timeout_seconds: 900 } }), (r) => {
      if (r?.handle) window.location.href = `/live?handle=${encodeURIComponent(r.handle)}`;
      return "setup session ready";
    });

  const eprofs = q.data?.ephemeral_profiles ?? [];
  const tfp = q.data?.tinyfish_profiles?.profiles ?? [];

  return (
    <div className="page">
      <PageHead
        title="Sessions & Profiles"
        sub={<>Everything ephemeral in LokMitra. Confirmation gates expire in minutes, OTP-relay Browser Context Profiles are deleted at TinyFish after the OTP validity window, and no sealed identifier or <code>cdp_url</code> is ever shown here.</>}
      />

      <div className="grid-4">
        <Kpi label="pending confirmations" value={count("confirm")} sub="paid checks awaiting consent" tone="amber" />
        <Kpi label="OTP relays" value={count("otp")} sub="citizen-controlled logins" tone="teal" />
        <Kpi label="live browsers" value={count("browser")} sub="Browser API / profile setup" />
        <Kpi label="ephemeral profiles" value={eprofs.filter((p) => !p.deleted_at).length} sub={`${eprofs.filter((p) => p.deleted_at).length} already deleted`} tone="jade" />
      </div>

      {relay && (
        <Panel title="OTP relay" sub="Resumed from a link. Save the login, then go back to Sahayak and press Retry — or run the check from here.">
          <RelayPanel confirmId={relay.confirmId} relayId={relay.relayId} onSaved={() => (void q.reload(), act.setNotice("Login saved into the Browser Context Profile. Return to Sahayak and press “Retry agent” — the run will reuse it."))} onClosed={() => (setRelay(null), void q.reload())} />
        </Panel>
      )}

      <Panel
        title={`Active sessions · ${rows.length}`}
        right={
          <>
            <select className="select" style={{ width: 190 }} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">all kinds</option>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l} ({count(k)})</option>)}
            </select>
            <button className="btn sm" onClick={q.reload}><Icon name="refresh" /></button>
          </>
        }
      >
        <Flash {...act} />
        {q.error && <p className="note err"><Icon name="alert" /> {q.error}</p>}
        {!rows.length ? (
          <div className="empty">{q.loading ? "loading…" : "No active sessions."}</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Kind</th><th>Detail</th><th>User</th><th>Created</th><th>Expires in</th><th /></tr></thead>
              <tbody>
                {rows.map((s) => {
                  const d = s.data;
                  const detail =
                    s.kind === "confirm"
                      ? `${String(d.scheme_id ?? "")} · ${String(d.task ?? "")} · ${String(d.state_code ?? "")} · ~${String(d.est_steps ?? "?")} steps${d.used ? " · used" : ""}`
                      : s.kind === "otp"
                        ? `${String(d.scheme_id ?? "")} · ${hostOf(String(d.entry_url ?? ""))} · ${d.saved ? `saved (${String(d.cookie_count ?? 0)} cookies)` : "awaiting OTP"}`
                        : s.kind === "browser"
                          ? `${String(d.kind ?? "")} · ${String(d.label ?? "") || hostOf(String(d.last_url ?? d.url ?? ""))} · ${String(d.actions ?? 0)} actions`
                          : s.kind === "tg_state"
                            ? `pending: ${((d.pending as string[]) ?? []).join(", ") || "—"}`
                            : Object.keys(d).join(", ");
                  return (
                    <tr key={s.id}>
                      <td><span className={`chip ${s.kind === "confirm" ? "miss" : s.kind === "otp" ? "hit" : ""}`}>{KIND_LABEL[s.kind] ?? s.kind}</span></td>
                      <td className="mono"><span className="ellipsis" style={{ maxWidth: 380 }} title={detail}>{detail}</span></td>
                      <td className="mono">{s.user_id ?? "—"}</td>
                      <td className="mono">{ago(s.created_at)}</td>
                      <td className="mono">{left(s.expires_at)}</td>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          {s.kind === "otp" && !d.saved && <button className="btn sm" onClick={() => setRelay({ relayId: s.id })}>Resume</button>}
                          {s.kind === "confirm" && !d.used && <button className="btn sm" onClick={() => setRelay({ confirmId: s.id })} title="Start an OTP relay for this check">OTP relay</button>}
                          {s.kind === "browser" && <a className="btn sm" href={`/live?handle=${encodeURIComponent(s.id)}`}>Open</a>}
                          <button className="btn sm danger" disabled={!!act.busy} onClick={() => end(s)}>End</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid-2">
        <Panel title="Ephemeral OTP profiles" sub="Created per citizen login, auto-deleted by the nightly cron after OTP_SESSION_TTL_SECONDS.">
          {!eprofs.length ? (
            <div className="empty">none yet</div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Profile</th><th>Scheme</th><th>State</th><th>Expires</th><th>Status</th></tr></thead>
                <tbody>
                  {eprofs.map((p) => (
                    <tr key={p.profile_id}>
                      <td className="mono">{p.profile_id.slice(0, 14)}…</td>
                      <td>{p.scheme_id ?? "—"}</td>
                      <td className="mono">{p.state_code ?? "—"}</td>
                      <td className="mono">{left(p.expires_at)}</td>
                      <td><span className={`chip ${p.deleted_at ? "hit" : "miss"}`}>{p.deleted_at ? "deleted" : "live"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="TinyFish Browser Context Profiles" sub="GET /v1/profiles. Operator-owned profiles (e.g. a CSC’s own login) persist; lokmitra-otp-* ones are temporary.">
          {q.data?.tinyfish_profiles?.error && <p className="note err"><Icon name="alert" /> {q.data.tinyfish_profiles.error}</p>}
          <div className="row" style={{ marginBottom: 10 }}>
            <input className="input" style={{ width: 240 }} placeholder="new profile name (operator)" value={newProf} onChange={(e) => setNewProf(e.target.value)} />
            <button className="btn sm" disabled={!newProf.trim() || !!act.busy} onClick={createProfile}>＋ Create</button>
          </div>
          {!tfp.length ? (
            <div className="empty">no profiles</div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Name</th><th>Id</th><th>Created</th><th /></tr></thead>
                <tbody>
                  {tfp.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}{p.is_default ? <> <Icon name="star" size={11} /></> : null} {/^lokmitra-otp-/.test(p.name) && <span className="chip miss">temp</span>}</td>
                      <td className="mono">{p.id.slice(0, 14)}…</td>
                      <td className="mono">{ago(p.created_at)}</td>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          <button className="btn sm" disabled={!!act.busy} onClick={() => setupSession(p.id)} title="Open a setup session to log in once and save cookies">Log in once</button>
                          <button className="btn sm danger" disabled={!!act.busy} onClick={() => delProfile(p.id)}><Icon name="x" /></button>
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
    </div>
  );
}
