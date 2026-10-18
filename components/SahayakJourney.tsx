"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useJourney, STAGES, type ConsentReq, type StageId, type JourneyReport } from "@/hooks/useJourney";
import { useT, speak, ttsSupported, relTime } from "@/lib/i18n/client";
import { citizenId, fmtUsd } from "@/lib/client";
import { langByCode } from "@/lib/lokmitra/languages";
import { mdToHtml } from "@/lib/md";
import { ReportView } from "./ReportView";
import type { IconName } from "./Icon";
import { RelayPanel } from "./RelayPanel";
import type { UiKey } from "@/lib/i18n/ui-strings";
import type { StructuredReport } from "@/lib/lokmitra/report-shape";
import { Icon } from "./Icon";
import { SahayakMascot } from "./SahayakMascot";

const STAGE_KEY: Record<StageId, UiKey> = { listen: "st_listen", understand: "st_understand", search: "st_search", fetch: "st_fetch", consent: "st_consent", agent: "st_agent", report: "st_report" };
const STAGE_ICON: Record<StageId, IconName> = { listen: "mic", understand: "brain", search: "search", fetch: "file", consent: "lock", agent: "bot", report: "clipboard" };

const EXAMPLES: { t: string; l: string }[] = [
  { t: "Main Nashik ka kisan hoon, PM-KISAN ki eligibility aur aaj gehu ka bhaav kya hai?", l: "hi" },
  { t: "मेरे बेटे की नेशनल स्कॉलरशिप की अंतिम तिथि क्या है? हम बिहार से हैं।", l: "hi" },
  { t: "I am a daily wage worker in Lucknow. What are e-Shram card benefits?", l: "en" },
  { t: "Check my PM-KISAN status", l: "en" },
];

type SR = { new (): { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null } };

const IDLE_COLLAPSE_MS = 120_000;

/**
 * SahayakJourney — the citizen's journey card on the Command Deck.
 *  track   : 7-stage progress rail (question → understanding → portal search → page read → consent → live agent → report)
 *  chip    : localised status chip (ready / working / waiting for you / done / problem)
 *  bubble  : chat bubbles — the question, a live "what I'm doing now" bubble, then the structured report
 *  modal   : consent dialog for any paid Agent check (fields, cost estimate, allow / not now / do it myself)
 *  OTP     : OTP relay panel (citizen logs in with own OTP → Browser Context Profile → agent re-runs)
 *  TTS     : read the answer aloud in the citizen's language (browser SpeechSynthesis, $0)
 *  collapse: manual collapse + auto-collapse after 2 min idle once a journey is done
 *  idle    : greeting + examples; resumes the last report after a reload (no new TinyFish call)
 */
export function SahayakJourney() {
  const { t, lang, setLang, languages } = useT();
  const j = useJourney({ lang });
  const { s } = j;
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showEn, setShowEn] = useState(false);
  const [ids, setIds] = useState<Record<string, Record<string, string>>>({});
  const [resumed, setResumed] = useState(false);
  const recRef = useRef<InstanceType<SR> | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const lastTouch = useRef(Date.now());
  const modalRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  const speechOk = typeof window !== "undefined" && !!((window as unknown as { SpeechRecognition?: SR }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: SR }).webkitSpeechRecognition);
  const pendingConsent = s.consents.find((c) => c.decision === "pending") ?? null;
  const busy = s.phase === "working";

  /* resume the last finished report after a reload */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const last = JSON.parse(localStorage.getItem(j.lastKey) || "null") as { report_id: string; question: string; at: number } | null;
        if (!last || Date.now() - last.at > 6 * 3600_000) return;
        const r = await fetch(`/api/lokmitra/session-summary?user_id=${encodeURIComponent(citizenId())}&limit=1`, { cache: "no-store" });
        const sum = await r.json();
        const l = sum?.latest as (JourneyReport & { query: string; created_at: string }) | null;
        if (!alive || !l || l.report_id !== last.report_id) return;
        j.resume({ report_id: l.report_id, summary_local: l.summary_local, summary_en: l.summary_en, language: l.language, structured: (l.structured as StructuredReport) ?? null }, last.question);
        setResumed(true);
      } catch {}
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* idle auto-collapse */
  useEffect(() => {
    const touch = () => (lastTouch.current = Date.now());
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    const timer = setInterval(() => {
      if (s.phase === "done" && !speaking && Date.now() - lastTouch.current > IDLE_COLLAPSE_MS) setCollapsed(true);
    }, 10_000);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      clearInterval(timer);
    };
  }, [s.phase, speaking]);

  /* auto-expand when the journey needs the citizen */
  useEffect(() => {
    if (s.phase === "waiting" || s.phase === "working") setCollapsed(false);
  }, [s.phase]);

  /* focus the consent dialog + Esc = "not now" */
  useEffect(() => {
    if (!pendingConsent) return;
    modalRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && j.deny(pendingConsent.confirm_id);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingConsent, j]);

  useEffect(() => () => stopRef.current?.(), []);

  /* suggestion chips: vertical wheel → smooth horizontal glide (accumulating rAF target, non-passive listener) */
  const chipsVisible = s.phase === "idle" && !s.report && !collapsed;
  useEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    let target = el.scrollLeft;
    let raf = 0;
    const step = () => {
      const d = target - el.scrollLeft;
      if (Math.abs(d) < 0.5) {
        el.scrollLeft = target;
        raf = 0;
        return;
      }
      el.scrollLeft += d * 0.2;
      raf = requestAnimationFrame(step);
    };
    const onWheel = (e: WheelEvent) => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // native horizontal / trackpad swipe
      const next = Math.max(0, Math.min(max, (raf ? target : el.scrollLeft) + e.deltaY));
      if (next === target && (next === 0 || next === max)) return; // at an edge: let the page scroll
      e.preventDefault();
      target = next;
      if (!raf) raf = requestAnimationFrame(step);
    };
    const onScroll = () => {
      if (!raf) target = el.scrollLeft;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
    };
  }, [chipsVisible]);

  const toggleMic = () => {
    const W = window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR };
    const Rec = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Rec) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const r = new Rec();
    r.lang = langByCode(lang).speech;
    r.interimResults = true;
    r.continuous = false;
    const base = text ? `${text.trim()} ` : "";
    r.onresult = (e) => {
      let out = "";
      for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript;
      setText(base + out);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    setListening(true);
    r.start();
  };

  const submit = (q?: string, l?: string) => {
    const query = (q ?? text).trim();
    if (!query || busy) return;
    if (l && l !== lang) setLang(l);
    stopRef.current?.();
    setResumed(false);
    setShowEn(false);
    setText("");
    setCollapsed(false);
    void j.ask(query, l || lang);
  };

  const toggleSpeak = () => {
    if (speaking) {
      stopRef.current?.();
      setSpeaking(false);
      return;
    }
    const r = s.report;
    if (!r) return;
    setSpeaking(true);
    stopRef.current = speak(showEn ? r.summary_en : r.summary_local || r.summary_en, showEn ? "en" : r.language, { onEnd: () => setSpeaking(false) });
  };

  const chip = useMemo(() => {
    const map = { idle: ["chip_idle", ""], working: ["chip_working", "live"], waiting: ["chip_waiting", "miss"], done: ["chip_done", "hit"], error: ["chip_error", "err"] } as const;
    const [k, cls] = map[s.phase];
    return { label: t(k), cls };
  }, [s.phase, t]);

  const liveLine = useMemo(() => {
    if (s.phase === "error") return s.error ?? t("error_generic");
    const running = Object.values(s.agents).find((a) => a.running);
    if (running) return t("agent_running", { host: running.host });
    if (j.activeStage) return `${t(STAGE_KEY[j.activeStage])}…`;
    return s.messages[s.messages.length - 1] ?? "";
  }, [s, j.activeStage, t]);

  return (
    <section id="sahayak-journey" className={`panel journey-panel area-journey ${collapsed ? "is-collapsed" : ""}`} style={{ ["--i" as string]: 0 }} aria-labelledby="journey-title">
      <header className="panel-head journey-head">
        <div className="journey-brand">
          <SahayakMascot size={collapsed ? 44 : 64} mood={s.phase} />
          <div className="journey-titles">
            <h2 className="panel-title" id="journey-title">
              <span className="glyph" style={{ background: "var(--saffron)", boxShadow: "0 0 10px var(--saffron)" }} /> {t("journey_title")}
            </h2>
            <p className={`journey-sub ${collapsed ? "is-hidden" : ""}`} aria-hidden={collapsed}>{t("journey_sub")}</p>
          </div>
        </div>
        <div className="row journey-controls" style={{ gap: 8 }}>
          <span className={`journey-chip ${chip.cls}`} role="status" aria-live="polite">
            <span className={`live-dot ${s.phase === "working" ? "pulse" : ""}`} />
            {chip.label}
          </span>
          <select className="select journey-lang" value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t("lang_label")}>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>{l.native}</option>
            ))}
          </select>
          <button
            type="button"
            className={`icon-btn journey-toggle ${collapsed ? "is-collapsed" : ""}`}
            onClick={() => {
              lastTouch.current = Date.now();
              setCollapsed((c) => !c);
            }}
            aria-expanded={!collapsed}
            aria-controls="journey-body"
            aria-label={collapsed ? t("expand") : t("collapse")}
            title={collapsed ? t("expand") : t("collapse")}
          >
            {/* one chevron that rotates — the icon always reflects the real state */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
          </button>
        </div>
      </header>

      {/* ---------- TRACK ---------- */}
      <ol className="journey-track" aria-label="Journey progress">
        {STAGES.map((k, i) => (
          <li key={k} className={`jt-step ${s.stages[k]}`} aria-current={j.activeStage === k ? "step" : undefined}>
            <span className="jt-dot" aria-hidden="true">{s.stages[k] === "done" ? <Icon name="check" /> : s.stages[k] === "error" ? <Icon name="alert" /> : s.stages[k] === "skipped" ? "–" : <Icon name={STAGE_ICON[k]} />}</span>
            <span className="jt-label">{t(STAGE_KEY[k])}</span>
            {i < STAGES.length - 1 && <span className="jt-bar" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      {collapsed && (
        <button type="button" className="journey-collapsed-line" onClick={() => setCollapsed(false)}>
          {s.question ? <b>“{s.question.slice(0, 90)}{s.question.length > 90 ? "…" : ""}”</b> : t("idle_title")} <span className="fog">· {liveLine || t("show_report")}</span>
        </button>
      )}
      <div className={`journey-collapsible ${collapsed ? "" : "open"}`} {...(collapsed ? { inert: true } : {})}>
        <div id="journey-body" className="journey-body">
          {/* ---------- IDLE ---------- */}
          {s.phase === "idle" && !s.report && (
            <div className="journey-idle">
              <div className="bubble bot">
                <b>{t("idle_title")}</b>
                <p>{t("idle_sub")}</p>
              </div>
              <div className="presets presets-scroll" role="list" aria-label="Suggestions" tabIndex={0} ref={chipsRef}>
                {EXAMPLES.map((e) => (
                  <button key={e.t} type="button" role="listitem" className="preset" onClick={() => submit(e.t, e.l)} disabled={busy} title={e.t} lang={e.l}>
                    {e.t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ---------- CONVERSATION ---------- */}
          {s.question && (
            <div className="journey-chat" aria-live="polite">
              <div className="bubble me">{s.question}</div>
              {resumed && <div className="note"><Icon name="refresh" /> {t("idle_resumed")}</div>}

              {(s.phase === "working" || s.phase === "error" || (s.phase === "waiting" && !s.report)) && (
                <div className={`bubble bot live ${s.phase === "error" ? "err" : ""}`}>
                  <div className="row" style={{ gap: 8 }}>
                    {s.phase === "working" && <span className="school" aria-hidden="true"><span /><span /><span /></span>}
                    <b>{liveLine}</b>
                  </div>
                  {s.searches.length > 0 && (
                    <div className="row journey-mini">
                      {s.searches.map((x, i) => (
                        <span key={i} className={`chip ${x.error ? "miss" : "live"}`}><Icon name="search" /> {x.scheme} · {x.results}{x.host ? ` · ${x.host}` : ""}</span>
                      ))}
                    </div>
                  )}
                  {s.pages.length > 0 && (
                    <div className="row journey-mini">
                      {s.pages.map((p) => (
                        <span key={p.url} className={`chip ${p.ok ? "hit" : "miss"}`} title={p.title ?? p.url}><Icon name="file" /> {p.host} {p.ok ? <Icon name="check" size={11} /> : <Icon name="x" size={11} />}{p.latency_ms ? ` ${(p.latency_ms / 1000).toFixed(1)}s` : ""}</span>
                      ))}
                    </div>
                  )}
                  {s.phase === "error" && (
                    <button className="btn sm" onClick={() => submit(s.question)}>{t("try_again")}</button>
                  )}
                </div>
              )}

              {/* consent decisions + agent runs */}
              {s.consents.map((c) => (
                <ConsentCard key={c.confirm_id} c={c} run={s.agents[c.confirm_id]} t={t} onOtp={() => j.otpStart(c.confirm_id)} otpOpen={s.otpFor === c.confirm_id} />
              ))}

              {s.otpFor && (() => {
                const c = s.consents.find((x) => x.confirm_id === s.otpFor);
                if (!c) return null;
                return (
                  <div className="bubble bot otp">
                    <b><Icon name="lock" /> {t("otp_title")}</b>
                    <p className="note">{t("otp_body")}</p>
                    <RelayPanel
                      key={j.relaySeed(c.confirm_id)}
                      confirmId={j.relaySeed(c.confirm_id)}
                      identifiers={ids[c.confirm_id]}
                      schemeName={c.scheme_name}
                      compact
                      onSaved={(relayId) => j.otpSaved(c.confirm_id, relayId, ids[c.confirm_id] ?? {})}
                      onClosed={j.otpClose}
                    />
                  </div>
                );
              })()}

              {/* ---------- REPORT BUBBLE ---------- */}
              {s.report && (
                <div className="bubble bot report">
                  <div className="row journey-report-bar">
                    {ttsSupported() && (
                      <button className={`btn sm ${speaking ? "primary" : ""}`} onClick={toggleSpeak} aria-pressed={speaking}>
                        {speaking ? <><Icon name="stop" /> {t("speak_stop")}</> : <><Icon name="volume" /> {t("speak")}</>}
                      </button>
                    )}
                    {s.report.language !== "en" && (
                      <button className="btn sm" aria-pressed={showEn} onClick={() => setShowEn((v) => !v)}>
                        {showEn ? langByCode(s.report.language).native : `EN ${t("english")}`}
                      </button>
                    )}
                    <a className="btn sm" href={`/report/${s.report.report_id}`} target="_blank" rel="noreferrer"><Icon name="printer" /> Slip + QR</a>
                    {s.report.live_calls && (
                      <span className="note">● {s.report.live_calls.search} Search · {s.report.live_calls.fetch_ok}/{s.report.live_calls.fetch_urls} Fetch{s.report.elapsed_ms ? ` · ${(s.report.elapsed_ms / 1000).toFixed(1)}s` : ""}</span>
                    )}
                    {s.finishedAt && <span className="note">{relTime(new Date(s.finishedAt).toISOString(), lang)}</span>}
                  </div>
                  {s.report.structured && !s.report.follow_up ? (
                    <ReportView r={s.report.structured} lang={s.report.language} showEnglish={showEn} />
                  ) : (
                    <div className="md-body" dangerouslySetInnerHTML={{ __html: mdToHtml(showEn ? s.report.summary_en : s.report.summary_local) }} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---------- INPUT ---------- */}
          <form
            className="journey-input"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <textarea
              className="textarea"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={t("ask_placeholder")}
              aria-label={t("ask_placeholder")}
              lang={lang}
            />
            <div className="journey-input-actions">
              <button type="button" className={`btn mic-btn ${listening ? "paid is-listening" : ""}`} onClick={toggleMic} disabled={!speechOk} title={speechOk ? (listening ? t("mic_stop") : t("mic_start")) : t("mic_unsupported")} aria-label={speechOk ? (listening ? t("mic_stop") : t("mic_start")) : t("mic_unsupported")} aria-pressed={listening}>
                <Icon name={listening ? "record" : "mic"} />
              </button>
              {busy ? (
                <button type="button" className="btn danger" onClick={j.cancel}>{t("cancel")}</button>
              ) : (
                <button type="submit" className="btn primary" disabled={!text.trim()}>{t("ask_btn")} →</button>
              )}
              {(s.report || s.phase === "error") && !busy && (
                <button type="button" className="btn sm" onClick={() => { stopRef.current?.(); j.reset(); setResumed(false); }}>{t("new_q")}</button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* ---------- CONSENT MODAL ---------- */}
      {pendingConsent && !collapsed && typeof document !== "undefined" && createPortal(
        <div className="consent-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && j.deny(pendingConsent.confirm_id)}>
          <div className="consent-modal" role="dialog" aria-modal="true" aria-labelledby="consent-title" tabIndex={-1} ref={modalRef}>
            <h3 id="consent-title"><Icon name="lock" /> {t("consent_title")}</h3>
            <p className="consent-scheme"><b>{pendingConsent.scheme_name}</b> · {pendingConsent.task} · <span className="mono">{pendingConsent.host}</span></p>
            <p>{t("consent_body", { host: pendingConsent.host, scheme: pendingConsent.scheme_name })}</p>
            {pendingConsent.requires_otp && <p className="note"><Icon name="phone" /> {t("consent_otp_note")}</p>}
            {pendingConsent.fields.length > 0 && (
              <fieldset className="consent-fields">
                <legend className="label">{t("consent_fields")}</legend>
                {pendingConsent.fields.map((f) => (
                  <label key={f.key}>
                    <span className="label">{f.label}{f.provided ? <> <Icon name="check" size={11} /></> : null}</span>
                    <input
                      className="input"
                      autoComplete="off"
                      placeholder={f.provided ? "(provided)" : f.label}
                      value={ids[pendingConsent.confirm_id]?.[f.key] ?? ""}
                      onChange={(e) => setIds((m) => ({ ...m, [pendingConsent.confirm_id]: { ...(m[pendingConsent.confirm_id] ?? {}), [f.key]: e.target.value } }))}
                    />
                  </label>
                ))}
              </fieldset>
            )}
            <p className="note" title="Informational estimate — no step limit or budget cap">● {t("consent_cost", { steps: pendingConsent.est_steps, cost: fmtUsd(pendingConsent.est_cost_usd) })}</p>
            <div className="row consent-actions">
              <button className="btn paid" onClick={() => j.allow(pendingConsent.confirm_id, ids[pendingConsent.confirm_id] ?? {})}><Icon name="check-circle" /> {t("consent_allow")}</button>
              {pendingConsent.requires_otp && <button className="btn" onClick={() => j.otpStart(pendingConsent.confirm_id)}><Icon name="phone" /> {t("otp_start")}</button>}
              <button className="btn" onClick={() => j.deny(pendingConsent.confirm_id)}>{t("consent_deny")}</button>
              <a className="btn sm" href={pendingConsent.entry_url} target="_blank" rel="noreferrer noopener">{t("consent_diy")} ↗</a>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}

function ConsentCard({ c, run, t, onOtp, otpOpen }: { c: ConsentReq; run?: import("@/hooks/useJourney").AgentRun; t: ReturnType<typeof useT>["t"]; onOtp: () => void; otpOpen: boolean }) {
  if (c.decision === "pending") return null;
  if (c.decision === "denied")
    return (
      <div className="bubble bot muted">
        <Icon name="lock" /> <b>{c.scheme_name}</b> — {t("consent_skipped")} <a href={c.entry_url} target="_blank" rel="noreferrer noopener">{t("consent_diy")} ↗</a>
      </div>
    );
  if (!run) return null;
  const res = run.result ?? {};
  const reg = (res.registration_status as string) ?? (res.status as string) ?? null;
  const ok = !run.running && run.status === "COMPLETED" && !run.needs_otp && !run.needs_captcha;
  return (
    <div className={`bubble bot agent ${run.running ? "live" : ok ? "ok" : "warn"}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b><Icon name="bot" /> {run.running ? t("agent_running", { host: run.host }) : ok ? t("agent_done") : run.needs_otp ? t("agent_blocked_otp") : t("agent_failed")}</b>
        <span className="note mono">{run.steps} {t("steps")}{run.cost_usd ? ` · ${fmtUsd(run.cost_usd)}` : ""}</span>
      </div>
      {run.streaming_url && run.running && (
        <a className="btn sm" href={run.streaming_url} target="_blank" rel="noreferrer noopener">▶ {t("watch_live")}</a>
      )}
      {run.log.length > 0 && (
        <details open={run.running}>
          <summary className="note">{run.log[run.log.length - 1]}</summary>
          <ol className="agent-log">{run.log.map((l, i) => <li key={i}>{l}</li>)}</ol>
        </details>
      )}
      {!run.running && reg && <p><b>{c.scheme_name}:</b> {reg}</p>}
      {!run.running && run.error && <p className="note err"><Icon name="alert" /> {run.error}</p>}
      {!run.running && (run.needs_otp || run.needs_captcha) && !otpOpen && (
        <button className="btn sm paid" onClick={onOtp}><Icon name="phone" /> {t("otp_start")}</button>
      )}
    </div>
  );
}
