"use client";
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TickerItem } from "@/lib/deck-types";
import { stateName } from "@/lib/classify";
import { Icon } from "./Icon";

/** server sends semantic icon keys (legacy emoji values are mapped too) */
const TICK_ICON: Record<string, string> = { zap: "zap", agent: "bot", fail: "alert", search: "search", fetch: "file", wave: "wave", "⚡": "zap", "🐟": "bot", "⚠": "alert", "🔎": "search", "📄": "file", "🌊": "wave" };

/** px / second — calm mode halves it (still moving, just gentler) */
const SPEED = 55;
const CALM_SPEED = 26;

/**
 * Stable (module-level) track. Previously `Track` was declared inside the render body, so every
 * telemetry poll (6–15 s) produced a *new component type* → React remounted both tracks → the
 * CSS marquee snapped back to 0 and looked frozen / cut off. Keeping it at module scope + memo
 * means a poll only patches text nodes; the scroll position lives in a ref and never resets.
 */
const TickerTrack = memo(function TickerTrack({ list, hidden, trackRef }: { list: TickerItem[]; hidden?: boolean; trackRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div className="ticker-track" ref={trackRef} aria-hidden={hidden || undefined}>
      {list.map((t, i) => (
        <Fragment key={`${t.at ?? "na"}-${t.kind}-${i}`}>
          <span className={`tick-item ${t.kind}`}>
            <span className="ic" aria-hidden="true">
              <Icon name={TICK_ICON[t.icon] ?? t.icon} size={13} />
            </span>
            <span>{t.text}</span>
            <span className="where">· {stateName(t.state).split(" · ")[0]}</span>
          </span>
          <span className="tick-sep" aria-hidden="true" />
        </Fragment>
      ))}
    </div>
  );
});

export function ImpactTicker({ items, configured }: { items: TickerItem[]; configured: boolean }) {
  const list: TickerItem[] = items.length
    ? items
    : [
        {
          kind: "free",
          icon: "wave",
          text: configured ? "Deck is live — dispatch a Search, Fetch or Agent mission above and impact will stream here" : "Connect TINYFISH_API_KEY to start streaming real impact events",
          state: "DL",
          sector: null,
          at: null,
        },
      ];

  const viewportRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const firstTrackRef = useRef<HTMLDivElement>(null);
  const offset = useRef(0); // current translateX (≤ 0), survives every data refresh
  const trackW = useRef(0);
  const hover = useRef(false);
  const [paused, setPaused] = useState(false); // explicit user pause (WCAG 2.2.2)
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const [copies, setCopies] = useState(2); // enough copies to always overfill the viewport

  // measure track vs viewport → decide how many copies are needed for a seamless loop
  const measure = useCallback(() => {
    const vp = viewportRef.current;
    const tr = firstTrackRef.current;
    if (!vp || !tr) return;
    const w = tr.scrollWidth;
    trackW.current = w;
    if (w > 0) {
      const need = Math.max(2, Math.ceil(vp.clientWidth / w) + 1);
      setCopies((c) => (c === need ? c : need));
      if (-offset.current >= w) offset.current = -((-offset.current) % w);
    }
  }, []);

  useLayoutEffect(measure);
  useEffect(() => {
    const ro = new ResizeObserver(measure);
    if (viewportRef.current) ro.observe(viewportRef.current);
    if (firstTrackRef.current) ro.observe(firstTrackRef.current);
    // web fonts can change widths after first paint
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [measure]);

  // requestAnimationFrame marquee — independent of CSS animations, so Calm Mode's global
  // `animation-*: !important` overrides can no longer freeze it, and polls never reset it.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - last) / 1000; // clamp: no huge jump after a background tab
      last = now;
      const rail = railRef.current;
      const w = trackW.current;
      if (rail && w > 0 && !hover.current && !pausedRef.current) {
        const calm = document.documentElement.classList.contains("calm");
        offset.current -= (calm ? CALM_SPEED : SPEED) * dt;
        if (-offset.current >= w) offset.current += w; // seamless wrap: copy N+1 sits where copy N was
        rail.style.transform = `translate3d(${offset.current.toFixed(2)}px,0,0)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="ticker-wrap">
      <div
        className="ticker"
        ref={viewportRef}
        role="marquee"
        aria-label="Impact ticker — live TinyFish run log"
        aria-live="off"
        onMouseEnter={() => (hover.current = true)}
        onMouseLeave={() => (hover.current = false)}
        onFocus={() => (hover.current = true)}
        onBlur={() => (hover.current = false)}
        onTouchStart={() => (hover.current = true)}
        onTouchEnd={() => (hover.current = false)}
        tabIndex={0}
      >
        <div className="ticker-rail" ref={railRef}>
          {Array.from({ length: copies }, (_, i) => (
            <TickerTrack key={i} list={list} hidden={i > 0} trackRef={i === 0 ? firstTrackRef : undefined} />
          ))}
        </div>
      </div>
      <button
        type="button"
        className="ticker-ctl icon-btn"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? "Resume ticker scrolling" : "Pause ticker scrolling"}
        title={paused ? "Resume" : "Pause (hover also pauses)"}
      >
        {paused ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
        )}
      </button>
    </div>
  );
}
