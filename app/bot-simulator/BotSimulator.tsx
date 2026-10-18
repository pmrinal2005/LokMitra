"use client";
import { useEffect, useRef, useState } from "react";
import { PageHead, Panel } from "@/components/ui";
import { api } from "@/lib/client";

type Kb = { text: string; callback_data?: string; url?: string }[][];
interface SimCall { method: string; at: string; text?: string; keyboard?: Kb; photo?: string | null; caption?: string; callback_text?: string }
interface SimRes { ok: boolean; chat_id: string; elapsed_ms: number; calls: SimCall[]; telegram_configured: boolean; base_url: string | null }
interface Msg { id: string; from: "user" | "bot" | "sys"; html?: string; text?: string; keyboard?: Kb; photo?: string | null; at: number; ms?: number }

const PAID = /^(cf:|rl:go|rl:save|mk:)/;
const PRESETS = [
  "/start",
  "/lang",
  "/state",
  "Main Nashik ka kisan hoon, PM-KISAN status aur aaj gehu ka bhaav kya hai?",
  "Ayushman Bharat eligibility aur NSP scholarship last date",
  "/report",
  "/alerts",
  "/email",
];

/** Telegram HTML subset → safe HTML (keep b/i/a/code/pre only). */
function tgHtml(s: string) {
  const esc = s.replace(/&(?!(amp|lt|gt|quot|#39);)/g, "&amp;");
  return esc
    .replace(/<(?!\/?(b|i|u|s|code|pre)>|a href="https?:\/\/[^"]+"|\/a>)/g, "&lt;")
    .replace(/<a href="(https?:\/\/[^"]+)">/g, '<a href="$1" target="_blank" rel="noreferrer noopener">')
    .replace(/\n/g, "<br/>");
}

/**
 * Bot Simulator — a phone-style Telegram chat that drives the REAL bot code path
 * (lib/lokmitra/bot.ts → pipeline → TinyFish Search/Fetch) through /api/lokmitra/simulator.
 * Every inline keyboard is clickable; buttons that would spend Wallet credits are marked 💲.
 */
export function BotSimulator() {
  const [chat, setChat] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ tg: boolean; base: string | null } | null>(null);
  const [log, setLog] = useState<SimCall[]>([]);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let c = "";
    try {
      c = localStorage.getItem("lm-sim-chat") || "";
      if (!c) {
        c = Math.random().toString(36).slice(2, 10);
        localStorage.setItem("lm-sim-chat", c);
      }
    } catch {
      c = "demo";
    }
    setChat(c);
  }, []);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs]);

  const push = (m: Omit<Msg, "id" | "at">) => setMsgs((x) => [...x, { ...m, id: `${Date.now()}${Math.random()}`, at: Date.now() }]);

  async function send(payload: { text?: string; callback_data?: string }, label?: string) {
    if (!chat || busy) return;
    if (payload.callback_data && PAID.test(payload.callback_data) && !confirm("This button spends TinyFish Wallet credits (Agent / Browser / Monitor). Continue?")) return;
    push({ from: "user", text: label ?? payload.text ?? "" });
    setBusy(true);
    try {
      const r = await api<SimRes>("/api/lokmitra/simulator", { body: { chat_id: chat, ...payload } });
      setInfo({ tg: r.telegram_configured, base: r.base_url });
      setLog((l) => [...r.calls, ...l].slice(0, 80));
      const out = r.calls.filter((c) => c.method === "sendMessage" || c.method === "sendPhoto");
      const toast = r.calls.find((c) => c.method === "answerCallbackQuery" && c.callback_text);
      if (toast) push({ from: "sys", text: toast.callback_text });
      out.forEach((c, i) => push({ from: "bot", html: tgHtml(c.text ?? c.caption ?? ""), keyboard: c.keyboard, photo: c.photo, ms: i === out.length - 1 ? r.elapsed_ms : undefined }));
      if (!out.length) push({ from: "sys", text: `(no reply · ${r.elapsed_ms} ms)` });
    } catch (e) {
      push({ from: "sys", text: `⚠ ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  const reset = () => {
    const c = Math.random().toString(36).slice(2, 10);
    try {
      localStorage.setItem("lm-sim-chat", c);
    } catch {}
    setChat(c);
    setMsgs([]);
    setLog([]);
  };

  return (
    <div className="page">
      <PageHead
        title="Bot Simulator"
        sub={<>A Telegram chat running the <b>real</b> LokMitra bot code (commands, language/state keyboards, quick intents, alerts, e-mail, /report) against live TinyFish Search + Fetch. No bot token is needed and nothing goes to Telegram: the simulator captures every Bot API call.</>}
      >
        <span className={`chip ${info?.tg ? "hit" : ""}`}>{info ? (info.tg ? "TELEGRAM_BOT_TOKEN set" : "no bot token · simulator only") : "simulator"}</span>
        <span className="chip">chat sim{chat}</span>
        <button className="btn sm" onClick={reset}>↺ New chat</button>
      </PageHead>

      <div className="sim-grid">
        <section className="sim-phone" aria-label="Simulated Telegram chat">
          <header className="sim-top">
            <span className="sim-avatar" aria-hidden="true">🐟</span>
            <div>
              <b>LokMitra Bot</b>
              <small>{busy ? "typing…" : "bot · online"}</small>
            </div>
          </header>
          <div className="sim-body" aria-live="polite">
            {!msgs.length && <p className="sim-sys">Tap <b>/start</b> below or type a question in any language.</p>}
            {msgs.map((m) =>
              m.from === "sys" ? (
                <p key={m.id} className="sim-sys">{m.text}</p>
              ) : (
                <div key={m.id} className={`sim-msg ${m.from}`}>
                  {m.photo && <img src={m.photo} alt="portal screenshot" className="sim-photo" />}
                  {m.html !== undefined ? <div dangerouslySetInnerHTML={{ __html: m.html }} /> : <div>{m.text}</div>}
                  <span className="sim-time">{new Date(m.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}{m.ms !== undefined ? ` · ${(m.ms / 1000).toFixed(1)}s` : ""}</span>
                  {m.keyboard && m.keyboard.length > 0 && (
                    <div className="sim-kb">
                      {m.keyboard.map((row, ri) => (
                        <div key={ri} className="sim-kb-row">
                          {row.map((b, bi) =>
                            b.url ? (
                              <a key={bi} className="sim-kb-btn" href={b.url} target="_blank" rel="noreferrer noopener">{b.text} ↗</a>
                            ) : (
                              <button key={bi} className={`sim-kb-btn ${b.callback_data && PAID.test(b.callback_data) ? "paid" : ""}`} disabled={busy} onClick={() => send({ callback_data: b.callback_data }, `[${b.text}]`)} title={b.callback_data}>
                                {b.callback_data && PAID.test(b.callback_data) ? "💲 " : ""}
                                {b.text}
                              </button>
                            ),
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && <p className="sim-sys">🔎 LokMitra is working… (Search + Fetch are free; first-time portals may take ~20–60 s)</p>}
            <div ref={end} />
          </div>
          <div className="sim-presets">
            {PRESETS.map((p) => (
              <button key={p} className="chip sim-preset" disabled={busy} onClick={() => send({ text: p })}>{p.length > 34 ? `${p.slice(0, 32)}…` : p}</button>
            ))}
          </div>
          <form
            className="sim-input"
            onSubmit={(e) => {
              e.preventDefault();
              const t = input.trim();
              if (!t) return;
              setInput("");
              void send({ text: t });
            }}
          >
            <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message LokMitra…" aria-label="Message" disabled={busy} />
            <button className="btn primary" disabled={busy || !input.trim()}>Send</button>
          </form>
        </section>

        <Panel title="Bot API calls" sub="What the bot sent, captured by the simulator sink (newest first)">
          <div className="stack" style={{ gap: 6, maxHeight: 640, overflow: "auto" }}>
            {!log.length && <p className="note">// nothing yet</p>}
            {log.map((c, i) => (
              <div key={i} className="sim-log">
                <span className={`chip ${c.method === "sendMessage" ? "hit" : ""}`}>{c.method}</span>
                <span className="note mono">{new Date(c.at).toLocaleTimeString("en-IN")}</span>
                {c.keyboard && <span className="chip">⌨ {c.keyboard.flat().length} buttons</span>}
                {(c.text || c.caption || c.callback_text) && <div className="note mono sim-log-text">{(c.text || c.caption || c.callback_text || "").replace(/<[^>]+>/g, "").slice(0, 220)}</div>}
              </div>
            ))}
          </div>
          <hr className="hr" />
          <p className="note">
            To go live on Telegram: set <code>TELEGRAM_BOT_TOKEN</code> (and optionally <code>TELEGRAM_WEBHOOK_SECRET</code>, <code>PUBLIC_BASE_URL</code>), then press <b>Register webhook</b> in Settings. The same code then answers real chats.
          </p>
        </Panel>
      </div>
    </div>
  );
}
