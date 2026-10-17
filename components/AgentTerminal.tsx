"use client";
import { memo, useEffect, useRef, useState } from "react";
import type { LogLine, RecentRun } from "@/lib/deck-types";
import type { MissionMode, MissionState } from "@/hooks/useMission";
import { isCalm } from "@/hooks/useCalm";

const PRESETS: { label: string; hindi: string; mode: MissionMode; url?: string; goal?: string; query?: string }[] = [
  {
    label: "PM-KISAN eligibility",
    hindi: "पीएम-किसान",
    mode: "agent",
    url: "https://pmkisan.gov.in/",
    goal: "Find the eligibility criteria and the list of excluded categories for the PM-KISAN scheme. Return JSON: {\"eligibility\": string[], \"exclusions\": string[], \"helpline\": string}. If blocked by a captcha, return {\"error\": \"captcha\"}.",
  },
  {
    label: "Mandi prices (Agmarknet)",
    hindi: "मंडी भाव",
    mode: "search",
    query: "Agmarknet today onion mandi price Nashik Lasalgaon",
  },
  {
    label: "Ayushman Bharat",
    hindi: "आयुष्मान भारत",
    mode: "fetch",
    url: "https://nha.gov.in/PM-JAY",
  },
  {
    label: "NSP scholarships",
    hindi: "छात्रवृत्ति",
    mode: "search",
    query: "National Scholarship Portal 2026 last date to apply Bihar",
  },
  {
    label: "myScheme search",
    hindi: "योजना खोज",
    mode: "agent",
    url: "https://www.myscheme.gov.in/",
    goal: "Search for schemes for women farmers and return the first 3 scheme names with a one-line benefit each as JSON {\"schemes\":[{\"name\":string,\"benefit\":string}]}.",
  },
  {
    label: "eCourts services",
    hindi: "ई-कोर्ट",
    mode: "fetch",
    url: "https://services.ecourts.gov.in/ecourtindia_v6/",
  },
];

/* ---------- JSON viewer (on-brand syntax colours) ---------- */
function highlight(json: unknown) {
  let s: string;
  try {
    s = JSON.stringify(json, null, 2) ?? "null";
  } catch {
    s = String(json);
  }
  if (s.length > 12000) s = s.slice(0, 12000) + "\n… (truncated)";
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, (m) => {
    if (/^"/.test(m)) return /:$/.test(m) ? `<span class="k">${m}</span>` : `<span class="s">${m}</span>`;
    if (/true|false/.test(m)) return `<span class="b">${m}</span>`;
    if (/null/.test(m)) return `<span class="z">${m}</span>`;
    return `<span class="n">${m}</span>`;
  });
}

/* ---------- typewriter line ---------- */
const Line = memo(function Line({ line, animate, onDone }: { line: LogLine; animate: boolean; onDone?: () => void }) {
  const [shown, setShown] = useState(animate && !isCalm() ? 0 : line.text.length);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (shown >= line.text.length) {
      onDone?.();
      return;
    }
    // ~ 90-220 chars/sec depending on length so long lines don't stall the stream
    const step = Math.max(1, Math.round(line.text.length / 60));
    const t = setTimeout(() => setShown((n) => Math.min(line.text.length, n + step)), 14);
    return () => clearTimeout(t);
  }, [shown, line.text.length, onDone]);
  const time = new Date(line.at).toLocaleTimeString([], { hour12: false });
  const clickable = line.json !== undefined;
  return (
    <>
      <div
        className={`log-line tone-${line.tone} ${clickable ? "clickable" : ""}`}
        onClick={clickable ? () => setOpen((o) => !o) : undefined}
        onKeyDown={clickable ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen((o) => !o)) : undefined}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-expanded={clickable ? open : undefined}
      >
        <span className="t">{time}</span>
        <span className="g" aria-hidden="true">
          {line.glyph}
        </span>
        <span className="x">
          {line.text.slice(0, shown)}
          {clickable && shown >= line.text.length && <span style={{ color: "rgba(79,217,255,.6)", marginLeft: 8, fontSize: 10.5 }}>{open ? "[−json]" : "[+json]"}</span>}
        </span>
      </div>
      {open && <pre className="json-view" dangerouslySetInnerHTML={{ __html: highlight(line.json) }} />}
    </>
  );
});

export function AgentTerminal({
  lines,
  state,
  recent,
  onRunAgent,
  onRunSearch,
  onRunFetch,
  onCancel,
  onClear,
  onInspect,
  disabled,
}: {
  lines: LogLine[];
  state: MissionState;
  recent: RecentRun[];
  onRunAgent: (url: string, goal: string) => void;
  onRunSearch: (q: string) => void;
  onRunFetch: (url: string) => void;
  onCancel: () => void;
  onClear: () => void;
  onInspect: (id: string) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<MissionMode>("search");
  const [url, setUrl] = useState("https://pmkisan.gov.in/");
  const [goal, setGoal] = useState("");
  const [query, setQuery] = useState("PM Kisan 21st installment date status check");
  const boxRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const mountedIds = useRef<Set<string> | null>(null);
  if (mountedIds.current === null) mountedIds.current = new Set(lines.map((l) => l.id));

  useEffect(() => {
    const el = boxRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const onScroll = () => {
    const el = boxRef.current!;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (state.running || disabled) return;
    if (mode === "agent") {
      if (!url || !goal) return;
      onRunAgent(url.trim(), goal.trim());
    } else if (mode === "search") {
      if (!query.trim()) return;
      onRunSearch(query.trim());
    } else {
      if (!url) return;
      onRunFetch(url.trim());
    }
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setMode(p.mode);
    if (p.url) setUrl(p.url);
    if (p.goal) setGoal(p.goal);
    if (p.query) setQuery(p.query);
  };

  const lastIdx = lines.length - 1;

  return (
    <>
      <form className="launcher" onSubmit={submit} aria-label="Mission launcher">
        <div className="mode-switch" role="group" aria-label="TinyFish API">
          <button type="button" className="mode-btn" aria-pressed={mode === "search"} onClick={() => setMode("search")}>
            SEARCH · free
          </button>
          <button type="button" className="mode-btn" aria-pressed={mode === "fetch"} onClick={() => setMode("fetch")}>
            FETCH · free
          </button>
          <button type="button" className="mode-btn paid" aria-pressed={mode === "agent"} onClick={() => setMode("agent")}>
            AGENT · paid
          </button>
        </div>
        {mode === "search" ? (
          <input className="field" style={{ gridColumn: "span 2" }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="citizen query, e.g. “राशन कार्ड स्टेटस उत्तर प्रदेश”" aria-label="Search query" lang="hi-Latn" />
        ) : (
          <>
            <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://portal.gov.in/…" aria-label="Target portal URL" inputMode="url" style={mode === "fetch" ? { gridColumn: "span 2" } : undefined} />
            {mode === "agent" && <input className="field" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="goal: what should the agent extract? (return JSON)" aria-label="Agent goal" />}
          </>
        )}
        {state.running && mode === "agent" ? (
          <button type="button" className="cta danger" onClick={onCancel}>
            ■ Cancel run
          </button>
        ) : (
          <button type="submit" className="cta" disabled={state.running || disabled}>
            {state.running ? (
              <span className="school" style={{ width: 20, height: 20 }} aria-label="working">
                <span />
                <span />
                <span />
              </span>
            ) : (
              "▶"
            )}{" "}
            Dispatch
          </button>
        )}
      </form>
      <div className="presets" aria-label="Preset citizen queries">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="preset" onClick={() => applyPreset(p)}>
            {p.label}
            <span className="deva" lang="hi">
              {p.hindi}
            </span>
          </button>
        ))}
      </div>

      <div className="terminal" ref={boxRef} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions" aria-label="Live agent reasoning log">
        <div className="scanlines" aria-hidden="true" />
        <div className="sonar-sweep" aria-hidden="true" />
        {lines.map((l, i) => (
          <Line key={l.id} line={l} animate={!mountedIds.current!.has(l.id)} />
        ))}
        <div className="log-line" aria-hidden="true" style={{ gridTemplateColumns: lastIdx >= 0 ? undefined : "1fr" }}>
          <span className="t" />
          <span className="g" />
          <span className="x">
            <span className="caret" />
          </span>
        </div>
      </div>

      <div className="term-foot">
        <span>
          {state.runId ? (
            <>
              run_id <span style={{ color: "var(--teal)" }}>{state.runId}</span> · step {state.step}
            </>
          ) : (
            "SSE ← /api/tinyfish/agent/run-sse · click any line with [+json] to inspect"
          )}
        </span>
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {recent.length > 0 && (
            <select
              className="field"
              style={{ width: "auto", padding: "5px 10px", fontSize: 11 }}
              aria-label="Replay a recent run's step log"
              value=""
              onChange={(e) => e.target.value && onInspect(e.target.value)}
            >
              <option value="">replay recent run…</option>
              {recent.slice(0, 15).map((r) => (
                <option key={r.run_id} value={r.run_id}>
                  {r.status === "COMPLETED" ? "✓" : r.status === "FAILED" ? "✕" : r.status === "RUNNING" ? "▶" : "·"} {r.goal.slice(0, 60)}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="preset" onClick={onClear}>
            clear
          </button>
        </span>
      </div>
    </>
  );
}
