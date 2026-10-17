"use client";
import { useEffect, useRef, useState } from "react";
import { api, citizenId, hostOf } from "@/lib/client";

/**
 * OTP relay panel — the citizen stays in control of their own login.
 *   POST   /api/lokmitra/relay {confirm_id}      → short-lived Browser Context Profile + setup-session (CDP)
 *   POST   /api/lokmitra/relay/:id/act {actions} → type CAPTCHA / OTP, press buttons (relayed over CDP)
 *   POST   /api/lokmitra/relay/:id/save          → POST /v1/profiles/{id}/save (cookies captured)
 *   DELETE /api/lokmitra/relay/:id               → cancel + delete the temporary profile at TinyFish
 * After "save", the parent re-runs the confirmed Agent check with `relay_id` so the run uses
 * `use_profile: true` + `profile_id` — no second paid login sequence.
 */

export interface RelayField {
  idx: number;
  tag: string;
  type: string;
  label: string;
  value: string;
  kind: "text" | "select" | "button" | "captcha" | "otp" | "checkbox" | "radio" | "link";
  options?: { value: string; label: string }[];
}
export interface RelaySnapshot {
  url: string;
  title: string;
  fields: RelayField[];
  captcha_present: boolean;
  text_excerpt: string;
  screenshot?: string;
}
export interface RelayView {
  relay_id: string;
  profile_id: string;
  scheme_id: string;
  scheme_name: string;
  state_code: string;
  entry_url: string;
  saved: boolean;
  expires_at: string;
  snapshot?: RelaySnapshot | null;
  autofilled?: string[];
  error?: string;
  cookie_count?: number;
  domains?: string[];
}

type Action = { op: "fill"; idx: number; value: string } | { op: "click"; idx: number } | { op: "navigate"; url: string } | { op: "scan" };

interface Props {
  /** Confirmation id (from the gate or the agent's retry_confirm_id) that seeds scheme/state/identifiers. */
  confirmId?: string;
  /** Resume an already-started relay (e.g. from the Sessions page). */
  relayId?: string;
  schemeName?: string;
  /** Extra identifiers typed in the gate (merged with the sealed ones server-side) for auto-fill. */
  identifiers?: Record<string, string>;
  /** Called once the login is saved into the Browser Context Profile. */
  onSaved?: (relayId: string, view: RelayView) => void;
  onClosed?: () => void;
  compact?: boolean;
}

const INTERACTIVE: RelayField["kind"][] = ["text", "otp", "captcha", "select", "checkbox", "radio"];

export function RelayPanel({ confirmId, relayId, schemeName, identifiers, onSaved, onClosed, compact }: Props) {
  const [view, setView] = useState<RelayView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const started = useRef(false);

  // start (or resume) once
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      setBusy(relayId ? "Reconnecting to your secure browser…" : "Opening the official portal in a secure TinyFish browser…");
      setError(null);
      try {
        if (relayId) {
          const v = await api<RelayView>(`/api/lokmitra/relay/${relayId}`);
          setView(v);
          if (!v.saved) setView(await api<RelayView>(`/api/lokmitra/relay/${relayId}/act`, { body: { actions: [{ op: "scan" }] } }));
        } else if (confirmId) {
          setView(await api<RelayView>("/api/lokmitra/relay", { body: { confirm_id: confirmId, user_id: citizenId(), identifiers: Object.fromEntries(Object.entries(identifiers ?? {}).filter(([, v]) => v && v.trim())) } }));
        } else setError("Nothing to relay — missing confirmation.");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
    })();
  }, [confirmId, relayId]);

  // session countdown
  useEffect(() => {
    if (!view?.expires_at) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(view.expires_at).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [view?.expires_at]);

  // seed inputs from the live page values whenever a fresh snapshot arrives
  useEffect(() => {
    const f = view?.snapshot?.fields;
    if (!f) return;
    setVals((cur) => {
      const next: Record<number, string> = {};
      for (const x of f) if (INTERACTIVE.includes(x.kind)) next[x.idx] = cur[x.idx] !== undefined && x.kind !== "select" ? cur[x.idx] : x.value === "••••" ? "" : x.value;
      return next;
    });
  }, [view?.snapshot]);

  const act = async (actions: Action[], label: string) => {
    if (!view) return;
    setBusy(label);
    setError(null);
    try {
      const v = await api<RelayView>(`/api/lokmitra/relay/${view.relay_id}/act`, { body: { actions } });
      setView((p) => ({ ...(p ?? v), ...v }));
      if (v.error) setError(v.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /** Push every edited value, then (optionally) click a button — one round-trip. */
  const submit = (clickIdx?: number) => {
    const fields = view?.snapshot?.fields ?? [];
    const fills: Action[] = fields
      .filter((f) => INTERACTIVE.includes(f.kind) && vals[f.idx] !== undefined && vals[f.idx] !== (f.value === "••••" ? "" : f.value))
      .map((f) => ({ op: "fill", idx: f.idx, value: vals[f.idx] }));
    const acts: Action[] = clickIdx === undefined ? fills : [...fills, { op: "click", idx: clickIdx }];
    void act(acts.length ? acts : [{ op: "scan" }], clickIdx === undefined ? "Typing into the portal…" : "Pressing the button on the portal…");
  };

  const save = async () => {
    if (!view) return;
    setBusy("Saving your logged-in session into a short-lived Browser Context Profile…");
    setError(null);
    try {
      const v = await api<RelayView>(`/api/lokmitra/relay/${view.relay_id}/save`, { method: "POST" });
      setView((p) => ({ ...(p ?? v), ...v, saved: true }));
      onSaved?.(view.relay_id, { ...view, ...v, saved: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (view) {
      setBusy("Closing the browser and deleting the temporary profile…");
      try {
        await api(`/api/lokmitra/relay/${view.relay_id}`, { method: "DELETE" });
      } catch {
        /* ignore */
      }
    }
    setBusy(null);
    setView(null);
    onClosed?.();
  };

  const snap = view?.snapshot ?? null;
  const fields = snap?.fields ?? [];
  const inputs = fields.filter((f) => INTERACTIVE.includes(f.kind));
  const buttons = fields.filter((f) => (f.kind === "button" || f.kind === "link") && f.label);
  const keyButtons = buttons.filter((b) => /otp|login|log in|sign in|submit|search|get|verify|send|proceed|continue|status|data|show|खोज|सबमिट|लॉग/i.test(b.label));
  const shownButtons = showAll ? buttons : (keyButtons.length ? keyButtons : buttons).slice(0, 8);
  const otpField = inputs.find((f) => f.kind === "otp");
  const mmss = left === null ? "—" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <section className="relay" aria-label="OTP relay — secure login">
      <header className="row" style={{ justifyContent: "space-between" }}>
        <b>🔐 OTP relay · {view?.scheme_name ?? schemeName ?? "official portal"}</b>
        <div className="row">
          {view && <span className="chip">{hostOf(snap?.url || view.entry_url)}</span>}
          {view && <span className={`chip ${left !== null && left < 120 ? "miss" : ""}`} title="Session auto-deletes at TinyFish when this reaches 0">⏱ {mmss}</span>}
          {view?.saved && <span className="chip hit">✓ login saved{view.cookie_count ? ` · ${view.cookie_count} cookies` : ""}</span>}
        </div>
      </header>

      {!view?.saved && (
        <ol className="relay-steps note">
          <li>LokMitra opened the official page in a secure TinyFish browser and pre-filled what you already gave{view?.autofilled?.length ? ` (${view.autofilled.join(", ")})` : ""}.</li>
          <li>Type the CAPTCHA you see in the screenshot, press <i>Get OTP</i>, then type the OTP that arrives on <b>your</b> phone.</li>
          <li>Once you can see you are logged in, press <b>Save login &amp; check status</b>. The agent reuses this session — no second paid login.</li>
        </ol>
      )}

      {busy && (
        <div className="row note" role="status">
          <span className="school" aria-hidden="true"><span /><span /><span /></span> {busy}
        </div>
      )}
      {error && <p className="note err">⚠ {error}</p>}

      {snap && !view?.saved && (
        <div className={compact ? "stack" : "relay-grid"}>
          <figure className="relay-shot">
            {snap.screenshot ? <img src={snap.screenshot} alt={`Live screenshot of ${snap.title || hostOf(snap.url)}`} className="shot-frame" /> : <div className="empty">no screenshot</div>}
            <figcaption className="note">
              {snap.title || "—"} · <span className="mono">{hostOf(snap.url)}</span>
              {snap.captcha_present && <span className="chip miss" style={{ marginLeft: 8 }}>CAPTCHA on page</span>}
            </figcaption>
          </figure>

          <div className="stack">
            {otpField && <p className="note ok">An OTP box is visible — enter the code you just received by SMS.</p>}
            {inputs.length === 0 && <p className="note">No input fields detected on this page. Use a button below or refresh.</p>}
            <div className="stack" style={{ gap: 8 }}>
              {inputs.map((f) => (
                <label key={f.idx} className="stack" style={{ gap: 2 }}>
                  <span className="label">
                    {f.label || f.type} {f.kind === "otp" ? "· OTP" : f.kind === "captcha" ? "· CAPTCHA" : ""}
                  </span>
                  {f.kind === "select" ? (
                    <select className="select" value={vals[f.idx] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.idx]: e.target.value }))}>
                      {(f.options ?? []).map((o) => (
                        <option key={`${o.value}-${o.label}`} value={o.value}>{o.label || o.value}</option>
                      ))}
                    </select>
                  ) : f.kind === "checkbox" || f.kind === "radio" ? (
                    <input type="checkbox" checked={(vals[f.idx] ?? f.value) !== "" && (vals[f.idx] ?? "") !== "false"} onChange={(e) => setVals((v) => ({ ...v, [f.idx]: e.target.checked ? "true" : "false" }))} />
                  ) : (
                    <input
                      className={`input ${f.kind === "otp" ? "otp-input" : ""}`}
                      inputMode={f.kind === "otp" ? "numeric" : undefined}
                      autoComplete={f.kind === "otp" ? "one-time-code" : "off"}
                      type={f.type === "password" ? "password" : "text"}
                      placeholder={f.label}
                      value={vals[f.idx] ?? ""}
                      onChange={(e) => setVals((v) => ({ ...v, [f.idx]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submit();
                        }
                      }}
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="row">
              <button className="btn sm" disabled={!!busy} onClick={() => submit()}>⌨ Type into page</button>
              <button className="btn sm" disabled={!!busy} onClick={() => act([{ op: "scan" }], "Refreshing screenshot…")}>↻ Refresh</button>
            </div>
            {shownButtons.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <span className="label">Buttons on the page</span>
                <div className="row">
                  {shownButtons.map((b) => (
                    <button key={b.idx} className="btn sm" disabled={!!busy} onClick={() => submit(b.idx)} title={`Fill fields, then press “${b.label}”`}>
                      ▶ {b.label.slice(0, 40)}
                    </button>
                  ))}
                  {buttons.length > shownButtons.length && !showAll && (
                    <button className="btn sm" onClick={() => setShowAll(true)}>+{buttons.length - shownButtons.length} more</button>
                  )}
                </div>
              </div>
            )}
            {snap.text_excerpt && (
              <details>
                <summary className="note" style={{ cursor: "pointer" }}>Page text</summary>
                <p className="note" style={{ whiteSpace: "pre-wrap" }}>{snap.text_excerpt}</p>
              </details>
            )}
          </div>
        </div>
      )}

      <footer className="row" style={{ justifyContent: "space-between" }}>
        <span className="note">Your OTP is typed straight into the official page and never stored. The temporary profile is deleted after {mmss}.</span>
        <div className="row">
          {view && !view.saved && (
            <button className="btn sm paid" disabled={!!busy} onClick={save}>💾 Save login &amp; check status</button>
          )}
          {view?.entry_url && <a className="btn sm" href={view.entry_url} target="_blank" rel="noreferrer noopener">Do it myself ↗</a>}
          <button className="btn sm danger" disabled={busy !== null && !view} onClick={cancel}>{view?.saved ? "Delete session" : "Cancel"}</button>
        </div>
      </footer>
    </section>
  );
}
