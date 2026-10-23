"use client";
import { BrandLogo } from "@/components/BrandLogo";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, citizenId, fmtUsd, hostOf, ssePost } from "@/lib/client";
import { mdToHtml } from "@/lib/md";
import { RelayPanel } from "@/components/RelayPanel";
import { ReportView } from "@/components/ReportView";
import type { StructuredReport } from "@/lib/lokmitra/report-shape";
import { Icon } from "@/components/Icon";

/** CSC operators share one tablet: a stable "csc:<id>" identity (rate limits + report history per centre). */
function cscUserId(name: string) {
  const n = name.trim().replace(/[^A-Za-z0-9_.@-]/g, "").slice(0, 60);
  return n ? `csc:${n}` : citizenId().replace(/^web:/, "csc:");
}

/** Everything the server needs to render + send the report e-mail without reading the stored row. */
function emailPayload(t: { q: string; report?: { report_id: string; summary_local: string; summary_en: string; language: string }; structured?: StructuredReport | null; sections: { scheme_id: string; scheme_name: string; task: string; status: string; sources: string[]; diy: string[] }[] }) {
  const r = t.report!;
  return { id: r.report_id, language: r.language, query: t.q, summary_en: r.summary_en, summary_local: r.summary_local, structured: t.structured ?? null, sources: [...new Set(t.sections.flatMap((s) => s.sources))].slice(0, 20), sections: t.sections.map((s) => ({ scheme_id: s.scheme_id, scheme_name: s.scheme_name, task: s.task, status: s.status, sources: s.sources, diy: s.diy })) };
}

interface Lang { code: string; name: string; native: string; speech: string; priority: boolean }
interface St { code: string; name: string; hindi: string }
interface Confirm { confirm_id: string; report_id?: string; ready?: boolean; scheme_id: string; scheme_name: string; task: "status" | "land" | "verify"; mode?: "page" | "map" | "personal"; sub_task?: string; token?: string; entry_url: string; est_steps: number; est_cost_usd: number; requires_otp: boolean | null; fields: { key: string; label: string; provided: boolean }[]; expires_at: string }
interface Section { scheme_id: string; scheme_name: string; task: string; status: string; data: Record<string, unknown> | null; sources: string[]; diy: string[]; live?: boolean; portal_state: string; search?: { query: string; results: number; error?: string | null; latency_ms: number }; confirm?: Confirm; benefit?: string }
interface AgentRun { confirm_id: string; scheme_name: string; stages: string[]; streaming_url: string | null; steps: number; result: Record<string, unknown> | null; running: boolean; error?: string | null; retry_confirm_id?: string | null; needs_otp?: boolean; needs_captcha?: boolean; relay_id?: string | null; cost_usd?: number; step_rate?: number; video_url?: string | null; needs_input?: boolean }
interface Turn {
  id: string;
  q: string;
  stages: string[];
  pages: { url: string; title: string | null; chars: number; latency_ms?: number | null; error: string | null }[];
  sections: Section[];
  /** guaranteed live "verify" Agents (the Live Agent step is never skipped) */
  verify: Confirm[];
  report?: { report_id: string; summary_local: string; summary_en: string; language: string; live_calls?: { search: number; fetch_urls: number; fetch_ok: number }; elapsed_ms?: number; follow_up?: boolean; structured?: StructuredReport | null };
  structured?: StructuredReport | null;
  error?: string;
  done: boolean;
}

const EXAMPLES = [
  { t: "Main Nashik ka kisan hoon, PM-KISAN ki eligibility, aaj gehu ka bhaav aur Ayushman mein naya kya hai?", l: "hi" },
  { t: "मेरे बेटे की नेशनल स्कॉलरशिप की अंतिम तिथि क्या है? हम बिहार से हैं।", l: "hi" },
  { t: "I am a daily wage worker in Lucknow. What are e-Shram card benefits and how do I register?", l: "en" },
  { t: "माझा PM-KISAN हप्ता आला का? मी पुणे जिल्ह्यातला शेतकरी आहे.", l: "mr" },
  { t: "Check my PM-KISAN status", l: "en" },
  { t: "Mujhe apna land record (khatauni) dekhna hai, Varanasi", l: "hi" },
];

type SR = { new (): { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null } };

export function Sahayak({ mode = "citizen" }: { mode?: "citizen" | "csc" }) {
  const csc = mode === "csc";
  const [cscName, setCscName] = useState("");
  const [served, setServed] = useState(0);
  const [langs, setLangs] = useState<Lang[]>([]);
  const [states, setStates] = useState<St[]>([]);
  const [lang, setLang] = useState("hi");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [runs, setRuns] = useState<Record<string, AgentRun>>({});
  const [ids, setIds] = useState<Record<string, Record<string, string>>>({});
  const [email, setEmail] = useState("");
  const [mailNote, setMailNote] = useState<Record<string, string>>({});
  const [view, setView] = useState<Record<string, "cards" | "text" | "en">>({});
  const [relayFor, setRelayFor] = useState<Record<string, string | null>>({}); // gate key → confirm id the relay was started from
  const recRef = useRef<InstanceType<SR> | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api<{ languages: Lang[]; states: St[] }>("/api/lokmitra/schemes").then((r) => {
      setLangs(r.languages);
      setStates(r.states);
    }).catch(() => null);
    try {
      setCscName(localStorage.getItem("lm-csc") || "");
      setLang(localStorage.getItem("lm-lang") || "hi");
      setState(localStorage.getItem("lm-state") || "");
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("lm-lang", lang);
      localStorage.setItem("lm-state", state);
    } catch {}
  }, [lang, state]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, runs]);

  const speechLang = useMemo(() => langs.find((l) => l.code === lang)?.speech ?? "hi-IN", [langs, lang]);
  const speechOk = typeof window !== "undefined" && !!((window as unknown as { SpeechRecognition?: SR }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: SR }).webkitSpeechRecognition);

  const toggleMic = () => {
    const W = window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR };
    const Rec = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Rec) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const r = new Rec();
    r.lang = speechLang;
    r.interimResults = true;
    r.continuous = false;
    const base = text ? `${text.trim()} ` : "";
    r.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      setText(base + s);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    setListening(true);
    r.start();
  };

  const patchTurn = (id: string, f: (t: Turn) => Turn) => setTurns((ts) => ts.map((t) => (t.id === id ? f(t) : t)));

  const ask = async (q?: string) => {
    const query = (q ?? text).trim();
    if (!query || busy) return;
    const id = `t${Date.now()}`;
    setTurns((ts) => [...ts, { id, q: query, stages: [], pages: [], sections: [], verify: [], done: false }]);
    setText("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await ssePost(
        "/api/lokmitra/ask",
        { text: query, user_id: csc ? cscUserId(cscName) : citizenId(), language: lang, state_code: state || undefined, district: district || undefined, channel: csc ? "csc" : "web" },
        ({ event, data }) => {
          if (event === "stage") patchTurn(id, (t) => ({ ...t, stages: [...t.stages, String(data.message)] }));
          else if (event === "fetch") patchTurn(id, (t) => ({ ...t, pages: (data.pages as Turn["pages"]) ?? [] }));
          else if (event === "agent_task") {
            const c = data as unknown as Confirm;
            if (c.task === "verify") patchTurn(id, (t) => ({ ...t, verify: [...t.verify.filter((v) => v.confirm_id !== c.confirm_id), c] }));
            // every task starts immediately, in parallel (no consent step). Missing identifiers stay as plain inputs.
            if (c.ready) void runConfirm(c, c.report_id);
          } else if (event === "section") patchTurn(id, (t) => ({ ...t, sections: [...t.sections.filter((s) => !(s.scheme_id === data.scheme_id && s.task === data.task)), data as unknown as Section] }));
          else if (event === "structured") patchTurn(id, (t) => ({ ...t, structured: data as unknown as StructuredReport }));
          else if (event === "report") patchTurn(id, (t) => ({ ...t, report: data as unknown as Turn["report"], structured: (data.structured as StructuredReport | undefined) ?? t.structured }));
          else if (event === "error") patchTurn(id, (t) => ({ ...t, error: String(data.message ?? "error") }));
        },
        ctrl.signal,
      );
    } catch (e) {
      patchTurn(id, (t) => ({ ...t, error: (e as Error).message }));
    } finally {
      patchTurn(id, (t) => ({ ...t, done: true }));
      setBusy(false);
      if (csc) setServed((n) => n + 1);
    }
  };

  const runConfirm = async (c: Confirm, reportId?: string, relayId?: string, overrideConfirmId?: string) => {
    const key = c.confirm_id;
    setRuns((r) => ({ ...r, [key]: { confirm_id: key, scheme_name: c.scheme_name, stages: relayId ? ["Re-running with your saved login (Browser Context Profile)…"] : [], streaming_url: null, steps: 0, result: null, running: true, relay_id: relayId ?? null, step_rate: 0, cost_usd: 0, video_url: null, needs_input: false } }));
    const up = (f: (a: AgentRun) => AgentRun) => setRuns((r) => ({ ...r, [key]: f(r[key]) }));
    try {
      await ssePost("/api/lokmitra/confirm", { confirm_id: overrideConfirmId ?? key, identifiers: ids[key] ?? {}, report_id: reportId, relay_id: relayId, token: overrideConfirmId ? undefined : c.token }, ({ event, data }) => {
        if (event === "stage") up((a) => ({ ...a, step_rate: Number(data.step_rate_usd ?? a.step_rate ?? 0), stages: [...a.stages, String(data.message)] }));
        else if (event === "agent") {
          const type = String(data.type ?? "");
          if (type === "STREAMING_URL" && data.streaming_url) up((a) => ({ ...a, streaming_url: String(data.streaming_url) }));
          if (type === "PROGRESS") up((a) => ({ ...a, steps: a.steps + 1, cost_usd: (a.steps + 1) * (a.step_rate ?? 0), stages: [...a.stages, `▶ ${String(data.purpose ?? data.action ?? "step")}`].slice(-40) }));
          if (type === "STARTED") up((a) => ({ ...a, stages: [...a.stages, `run ${String(data.run_id ?? "").slice(0, 8)} started`] }));
        } else if (event === "result") up((a) => ({ ...a, result: (data.result as Record<string, unknown>) ?? {}, steps: Number(data.steps ?? a.steps), error: (data.error as string) ?? null, retry_confirm_id: (data.retry_confirm_id as string) ?? null, needs_otp: !!data.needs_otp, needs_captcha: !!data.needs_captcha, cost_usd: Number(data.cost_usd ?? 0), video_url: (data.video_url as string) ?? null, stages: [...a.stages, `Done: ${data.status} · ${data.steps} steps · ${fmtUsd(Number(data.cost_usd ?? 0))}`] }));
        else if (event === "error") up((a) => ({ ...a, running: false, needs_input: Array.isArray(data.missing_fields) && data.missing_fields.length > 0, error: String(data.error ?? data.message ?? "error") }));
      });
    } catch (e) {
      up((a) => ({ ...a, error: (e as Error).message }));
    } finally {
      up((a) => ({ ...a, running: false }));
    }
  };

  const emailReport = async (t: Turn) => {
    const reportId = t.report!.report_id;
    setMailNote((m) => ({ ...m, [reportId]: "sending…" }));
    try {
      // the full report payload travels with the request, so e-mail works even if the stored row is unreachable
      await api(`/api/lokmitra/report/${reportId}/email`, { body: { to: email, payload: emailPayload(t) } });
      setMailNote((m) => ({ ...m, [reportId]: `sent to ${email}` }));
    } catch (e) {
      setMailNote((m) => ({ ...m, [reportId]: (e as Error).message }));
    }
  };

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      {csc && (
        <section className="panel csc-bar" aria-label="CSC operator">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row">
              <b><Icon name="store" /> CSC / VLE mode</b>
              <input className="input" style={{ width: 220 }} placeholder="CSC ID or operator name" value={cscName} onChange={(e) => { setCscName(e.target.value); try { localStorage.setItem("lm-csc", e.target.value); } catch {} }} aria-label="CSC id" />
              <span className="chip">citizens served this shift: {served}</span>
            </div>
            <div className="row">
              <button className="btn sm" onClick={() => { setTurns([]); setRuns({}); setIds({}); setRelayFor({}); setText(""); setDistrict(""); }} title="Clear the screen before the next citizen — nothing personal stays on this tablet"><Icon name="refresh" /> Next citizen</button>
            </div>
          </div>
          <p className="note" style={{ margin: "8px 0 0" }}>The citizen speaks, you type or press the mic. Every answer has a printable slip with QR codes to the official portal. Identifiers are used once and masked in logs; press <b>Next citizen</b> between visitors.</p>
        </section>
      )}
      <header className="page-head">
        <div className="page-head-brand">
          <BrandLogo size={44} decorative className="brand-logo-head" />
          <div>
          <h1>{csc ? "CSC Sahayak Desk" : "LokMitra Sahayak"}</h1>
          <p>
            Ask in your own language — by voice or text — about PM-KISAN, Ayushman, e-Shram, scholarships, ration, pension, land records or mandi prices. Every question is answered live: TinyFish Search locates the official portal and Fetch reads it right now — nothing is cached, so repeat questions run in full again. Personal checks start a live TinyFish Agent automatically (in parallel) and stream every step, the cost and the live browser here.
          </p>
          </div>
        </div>
      </header>

      {turns.length === 0 && (
        <section className="panel" aria-label="Examples">
          <h2 className="panel-title" style={{ marginBottom: 12 }}>
            <span className="glyph" /> Try a question
          </h2>
          <div className="row">
            {EXAMPLES.map((e) => (
              <button key={e.t} className="preset" onClick={() => (setLang(e.l), ask(e.t))} disabled={busy}>
                <span className={/[\u0900-\u097F]/.test(e.t) ? "deva" : ""} style={{ marginLeft: 0, color: "inherit" }}>{e.t}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="chat" aria-live="polite">
        {turns.map((t) => (
          <article key={t.id} className="stack" style={{ gap: 10 }}>
            <div className="msg me">{t.q}</div>
            <div className="msg bot">
              <div className="stage-list">
                {t.stages.map((s, i) => (
                  <span key={i} className={i === t.stages.length - 1 && !t.done ? "on" : ""}>
                    {i === t.stages.length - 1 && !t.done ? <Icon name="hourglass" size={11} /> : <Icon name="check" size={11} />} {s}
                  </span>
                ))}
              </div>
              {t.pages.length > 0 && (
                <div className="note" style={{ marginTop: 8 }}>
                  Live TinyFish Fetch read {t.pages.filter((p) => !p.error && p.chars > 0).length}/{t.pages.length} official page(s) just now: {t.pages.map((p) => `${hostOf(p.url)}${p.error ? " (failed)" : ` (ok${p.latency_ms ? ` ${(p.latency_ms / 1000).toFixed(1)}s` : ""})`}`).join(" · ")}
                </div>
              )}

              {t.verify.map((c) => {
                const run = runs[c.confirm_id];
                return (
                  <div key={c.confirm_id} className="gate" style={{ marginTop: 12 }}>
                    <b><Icon name="bot" /> {c.scheme_name} — live TinyFish agent {c.mode === "map" ? "mapping the status checker" : "reading the official page"}</b>
                    <span className="note">A real browser agent opened <b>{hostOf(c.entry_url)}</b> for this question. It never submits anything and enters no personal data.</span>
                    {run ? <AgentPanel run={run} /> : <span className="note">Starting the agent…</span>}
                  </div>
                );
              })}

              {t.sections.filter((s) => s.confirm).map((s) => {
                const c = s.confirm!;
                const run = runs[c.confirm_id];
                const v = ids[c.confirm_id] ?? {};
                return (
                  <div key={c.confirm_id} className="gate" style={{ marginTop: 12 }}>
                    <b><Icon name="bot" /> {c.scheme_name} — personal {c.task} check</b>
                    <span className="note">
                      {run?.running ? <>A TinyFish agent is working on <b>{hostOf(c.entry_url)}</b> right now. </> : run ? null : c.ready ? <>Starting a TinyFish agent on <b>{hostOf(c.entry_url)}</b>… </> : <>Enter the detail(s) below — the live TinyFish agent on <b>{hostOf(c.entry_url)}</b> starts the moment you submit. </>}It never submits anything. Your identifiers are used once, masked in logs.{c.requires_otp ? " This portal may send an OTP to your registered mobile." : ""}
                    </span>
                    {(!run || run.needs_input) && !c.ready && (
                      <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void runConfirm(c, c.report_id ?? t.report?.report_id); }}>
                        <div className="field-grid">
                          {c.fields.filter((f) => !f.provided).map((f) => (
                            <label key={f.key}>
                              <span className="label">{f.label}</span>
                              <input className="input" placeholder={f.label} value={v[f.key] ?? ""} onChange={(e) => setIds((m) => ({ ...m, [c.confirm_id]: { ...(m[c.confirm_id] ?? {}), [f.key]: e.target.value } }))} autoComplete="off" />
                            </label>
                          ))}
                        </div>
                        <div className="row">
                          <button type="submit" className="btn paid" disabled={!!run?.running || !c.fields.filter((f) => !f.provided).every((f) => (v[f.key] ?? "").trim())}><Icon name="bot" /> Start live check</button>
                          <a className="btn sm" href={c.entry_url} target="_blank" rel="noreferrer noopener">Do it myself ↗</a>
                        </div>
                      </form>
                    )}
                    {run && !run.running && !!run.retry_confirm_id && !run.needs_otp && !run.needs_captcha && (
                      <div className="row">
                        <button className="btn paid" onClick={() => runConfirm(c, c.report_id ?? t.report?.report_id, undefined, run.retry_confirm_id ?? undefined)}><Icon name="refresh" /> Retry live agent</button>
                      </div>
                    )}
                    {run && <AgentPanel run={run} onOtp={run.retry_confirm_id && !run.running && relayFor[c.confirm_id] === undefined ? () => setRelayFor((m) => ({ ...m, [c.confirm_id]: run.retry_confirm_id! })) : undefined} />}
                    {relayFor[c.confirm_id] && (
                      <RelayPanel
                        confirmId={relayFor[c.confirm_id]!}
                        identifiers={ids[c.confirm_id]}
                        schemeName={c.scheme_name}
                        onSaved={(relayId) => {
                          const retry = relayFor[c.confirm_id]!;
                          setRelayFor((m) => ({ ...m, [c.confirm_id]: null }));
                          void runConfirm(c, c.report_id ?? t.report?.report_id, relayId, retry);
                        }}
                        onClosed={() => setRelayFor((m) => { const n = { ...m }; delete n[c.confirm_id]; return n; })}
                      />
                    )}
                    {!run && c.requires_otp && relayFor[c.confirm_id] === undefined && (
                      <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setRelayFor((m) => ({ ...m, [c.confirm_id]: c.confirm_id }))} title="Log in first with your own OTP, then the agent reuses that session">
                        <Icon name="lock" /> This portal needs OTP — log in first (OTP relay)
                      </button>
                    )}
                  </div>
                );
              })}

              {t.report && (
                <div style={{ marginTop: 12 }}>
                  {t.structured && !t.report.follow_up && (
                    <div className="row" style={{ marginBottom: 8 }} role="tablist" aria-label="Report view">
                      {(["cards", "text", ...(t.report.language !== "en" ? ["en"] : [])] as ("cards" | "text" | "en")[]).map((v) => (
                        <button key={v} role="tab" aria-selected={(view[t.id] ?? "cards") === v} className={`btn sm ${(view[t.id] ?? "cards") === v ? "primary" : ""}`} onClick={() => setView((m) => ({ ...m, [t.id]: v }))}>
                          {v === "cards" ? <><Icon name="grid" /> Structured report</> : v === "text" ? <><Icon name="list" /> Plain text</> : <><Icon name="globe" /> English</>}
                        </button>
                      ))}
                    </div>
                  )}
                  {t.structured && !t.report.follow_up && (view[t.id] ?? "cards") !== "text" ? (
                    <ReportView r={t.structured} lang={t.report.language} showEnglish={view[t.id] === "en"} />
                  ) : (
                    <>
                      <div className="md-body" dangerouslySetInnerHTML={{ __html: mdToHtml(t.report.summary_local) }} />
                      {t.report.language !== "en" && t.report.summary_en !== t.report.summary_local && (
                        <details style={{ marginTop: 8 }}>
                          <summary className="note" style={{ cursor: "pointer" }}>English version</summary>
                          <div className="md-body" dangerouslySetInnerHTML={{ __html: mdToHtml(t.report.summary_en) }} />
                        </details>
                      )}
                    </>
                  )}
                  <hr className="hr" style={{ margin: "12px 0" }} />
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="note">
                      {t.report.live_calls?.fetch_ok ?? 0} official page(s) checked · {((t.report.elapsed_ms ?? 0) / 1000).toFixed(1)}s
                    </span>
                    {!t.report.follow_up && (
                      <div className="row">
                        <a className="btn sm" href={`/report/${t.report.report_id}`} target="_blank" rel="noreferrer"><Icon name="printer" /> Printable slip + QR</a>
                        <a className="btn sm" href={`/api/lokmitra/report/${t.report.report_id}/email?preview=1`} target="_blank" rel="noreferrer" title="Preview the structured HTML e-mail"><Icon name="eye" /> Email preview</a>
                        <input className="input" style={{ width: 200, padding: "6px 10px" }} placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                        <button className="btn sm" disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)} onClick={() => emailReport(t)}><Icon name="mail" /> Email</button>
                        {mailNote[t.report.report_id] && <span className="note">{mailNote[t.report.report_id]}</span>}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {t.sections.length > 0 && t.report && (
                <details style={{ marginTop: 10 }}>
                  <summary className="note" style={{ cursor: "pointer" }}>Structured results per scheme ({t.sections.length})</summary>
                  <div className="stack" style={{ marginTop: 8 }}>
                    {t.sections.map((s) => (
                      <div key={`${s.scheme_id}:${s.task}`} className="section-card">
                        <h4>
                          {s.scheme_name} <span className="chip">{s.task}</span> <span className="chip">{s.status}</span>
                        </h4>
                        <pre className="mono note" style={{ whiteSpace: "pre-wrap", margin: 0, maxHeight: 220, overflow: "auto" }}>{JSON.stringify(s.data, null, 2)}</pre>
                        <div className="note">DIY: {s.diy.join(" → ")}</div>
                        <div className="note">{s.sources.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer noopener" style={{ marginRight: 10 }}>{hostOf(u)}</a>)}</div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {t.error && <p className="note err"><Icon name="alert" /> {t.error}</p>}
              {!t.done && !t.stages.length && <p className="note">connecting…</p>}
            </div>
          </article>
        ))}
        <div ref={endRef} />
      </section>

      <section className="composer" aria-label="Ask LokMitra">
        <div className="row">
          <select className="select" style={{ width: 170 }} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Reply language">
            {(langs.length ? langs : [{ code: "hi", native: "हिन्दी", name: "Hindi" } as Lang]).map((l) => (
              <option key={l.code} value={l.code}>{l.native} · {l.name}</option>
            ))}
          </select>
          <select className="select" style={{ width: 190 }} value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
            <option value="">State: auto-detect</option>
            {states.filter((s) => s.code !== "IN").map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
          <input className="input" style={{ width: 160 }} placeholder="District (optional)" value={district} onChange={(e) => setDistrict(e.target.value)} />
          {busy && <button className="btn sm danger" onClick={() => abortRef.current?.abort()}>Stop</button>}
        </div>
        <div className="row" style={{ alignItems: "flex-end", flexWrap: "nowrap" }}>
          <button className={`btn mic ${listening ? "on" : ""}`} onClick={toggleMic} disabled={!speechOk} title={speechOk ? `Speak (${speechLang})` : "Voice input needs Chrome/Edge (Web Speech API)"} aria-pressed={listening} aria-label="Voice input">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </button>
          <textarea className="textarea" style={{ minHeight: 52 }} placeholder={listening ? "Listening… बोलिए" : "Type or speak your question… e.g. 'PM-KISAN ki agli kist kab aayegi?'"} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
          <button className="btn primary" style={{ height: 52 }} onClick={() => ask()} disabled={busy || !text.trim()}>
            {busy ? "Working…" : "Ask"}
          </button>
        </div>
      </section>
    </div>
  );
}

function AgentPanel({ run, onOtp }: { run: AgentRun; onOtp?: () => void }) {
  const r = run.result ?? {};
  const inst = Array.isArray(r.installments) ? (r.installments as Record<string, string | null>[]) : [];
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="note">{run.running ? `TinyFish agent working… step ${run.steps} · ${fmtUsd(run.cost_usd ?? 0)} so far` : run.error ? "agent finished with an issue" : "agent finished"}</span>
        <span className="row" style={{ gap: 6 }}>
          {run.streaming_url && run.running && <a className="btn sm" href={run.streaming_url} target="_blank" rel="noreferrer noopener">▶ Watch live ↗</a>}
          {run.video_url && !run.running && <a className="btn sm" href={run.video_url} target="_blank" rel="noreferrer noopener">▶ Run video ↗</a>}
        </span>
      </div>
      {run.streaming_url && run.running && <iframe className="live-frame" src={run.streaming_url} title="Live TinyFish agent browser" sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" />}
      <div className="stage-list" style={{ maxHeight: 140, overflow: "auto" }}>{run.stages.map((s, i) => <span key={i}>{s}</span>)}</div>
      {run.result && (
        <div className="section-card">
          {Array.isArray(r.verified_facts) && (r.verified_facts as { label?: string; value?: string }[]).filter((f) => f?.label && f?.value).slice(0, 8).map((f, n) => (
            <div key={`vf${n}`} className="pf-field"><span className="k">{f.label}</span><b>{f.value}</b></div>
          ))}
          {["page_title", "benefit", "deadline", "latest_notice", "helpline", "status_page_url"].filter((k) => typeof r[k] === "string" && r[k]).map((k) => (
            <div key={k} className="pf-field"><span className="k">{k.replace(/_/g, " ")}</span><b>{String(r[k])}</b></div>
          ))}
          {["found", "blocked_by", "registration_status", "ekyc_status", "land_seeding", "aadhaar_bank_linked", "khasra_or_survey_no", "area", "land_type", "encumbrance_or_remarks", "raw_message"].filter((k) => r[k] !== undefined && r[k] !== null && r[k] !== "").map((k) => (
            <div key={k} className="pf-field"><span className="k">{k.replace(/_/g, " ")}</span><b>{String(r[k])}</b></div>
          ))}
          {Array.isArray(r.owner_names) && (r.owner_names as string[]).length > 0 && <div className="note">Owners: {(r.owner_names as string[]).join(", ")}</div>}
          {inst.length > 0 && (
            <div className="table-wrap"><table className="tbl"><thead><tr><th>Instalment</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{inst.map((i, n) => <tr key={n}><td>{i.label}</td><td>{i.date ?? "—"}</td><td>{i.amount ?? "—"}</td><td>{i.status ?? "—"}</td></tr>)}</tbody></table></div>
          )}
          {Array.isArray(r.pending_actions) && (r.pending_actions as string[]).map((p) => <div key={p} className="note ok"><Icon name="arrow" /> {p}</div>)}
        </div>
      )}
      {run.error && <p className="note err"><Icon name="alert" /> {run.error}</p>}
      {(run.needs_otp || run.needs_captcha) && onOtp && (
        <div className="row">
          <span className="note">{run.needs_otp ? "This portal needs an OTP on your registered mobile." : "A CAPTCHA blocked the agent — you can type it yourself."}</span>
          <button className="btn sm paid" onClick={onOtp}><Icon name="lock" /> {run.needs_otp ? "Log in with OTP relay" : "Solve CAPTCHA via relay"}</button>
        </div>
      )}
      {run.relay_id && !run.running && <span className="note ok"><Icon name="check" /> used your saved login session — no second paid login</span>}
    </div>
  );
}
