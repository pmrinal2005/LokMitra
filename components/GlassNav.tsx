"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useT } from "@/lib/i18n/client";
import { ThemeToggle } from "./ThemeToggle";
import type { UiKey } from "@/lib/i18n/ui-strings";

/** In-page pills. "Wallet" is operator-only and deep-links to Settings → Usage & Infrastructure. */
export const NAV_ITEMS: { id: string; key: UiKey; href?: string; operatorOnly?: boolean }[] = [
  { id: "sahayak-journey", key: "nav_journey" },
  { id: "mission-deck", key: "nav_network" },
  { id: "agent-logs", key: "nav_logs" },
  { id: "sectors", key: "nav_sectors" },
  { id: "wallet", key: "nav_wallet", href: "/settings#usage", operatorOnly: true },
];

function Logomark() {
  // single-line fish swimming an infinite figure-8 inside its own bounding box (pure SVG/CSS)
  return (
    <svg className="logomark" viewBox="0 0 38 26" aria-hidden="true">
      <path className="track" d="M19 13 C 27 3, 35 3, 35 13 C 35 23, 27 23, 19 13 C 11 3, 3 3, 3 13 C 3 23, 11 23, 19 13 Z" fill="none" strokeWidth="0.8" />
      <g className="fish">
        <path d="M-6 0 C -3 -3.4, 3 -3.4, 5 0 C 3 3.4, -3 3.4, -6 0 Z M-6 0 L -9 -2.6 L -9 2.6 Z" fill="none" stroke="#2EF2C3" strokeWidth="1.1" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 3px #2EF2C3)" }} />
        <circle cx="2.2" cy="-0.6" r="0.7" fill="#FFB44F" />
      </g>
    </svg>
  );
}

export function GlassNav({
  soundOn,
  onSound,
  calm,
  onCalm,
  isOperator = false,
}: {
  soundOn: boolean;
  onSound: () => void;
  calm: boolean;
  onCalm: () => void;
  isOperator?: boolean;
}) {
  const { t } = useT();
  const items = NAV_ITEMS.filter((n) => !n.operatorOnly || isOperator);
  const [hidden, setHidden] = useState(false);
  const [active, setActive] = useState<string>(NAV_ITEMS[0].id);
  const [drop, setDrop] = useState({ left: 3, width: 0 });
  const pillsRef = useRef<HTMLDivElement>(null);
  const clickLock = useRef(0);

  // auto-hide on scroll-down, reveal on scroll-up
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 6) return;
      setHidden(y > last && y > 120);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // scroll-spy
  useEffect(() => {
    const els = NAV_ITEMS.filter((n) => !n.href).map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        if (Date.now() < clickLock.current) return;
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis) setActive(vis.target.id);
      },
      { threshold: [0.25, 0.5, 0.75], rootMargin: "-80px 0px -30% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  // liquid droplet slides between pills
  useLayoutEffect(() => {
    const wrap = pillsRef.current;
    const btn = wrap?.querySelector<HTMLButtonElement>(`[data-id="${active}"]`);
    if (wrap && btn) setDrop({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [active, items.length, t]);

  const go = (id: string) => {
    const item = NAV_ITEMS.find((n) => n.id === id);
    if (item?.href) {
      window.location.href = item.href;
      return;
    }
    setActive(id);
    clickLock.current = Date.now() + 900;
    document.getElementById(id)?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  };

  return (
    <nav className={`glass-nav ${hidden ? "is-hidden" : ""}`} aria-label="Primary">
      <div className="brand">
        <Logomark />
        <div className="brand-word">
          LokMitra
          <small>× TinyFish command deck</small>
        </div>
      </div>

      <div className="nav-pills" ref={pillsRef} role="tablist">
        <span className="nav-droplet" style={{ left: drop.left, width: drop.width }} aria-hidden="true" />
        {items.map((n) => (
          <button key={n.id} data-id={n.id} className={`nav-pill ${n.href ? "nav-pill-ext" : ""}`} aria-current={active === n.id} role="tab" onClick={() => go(n.id)} title={n.href ? "Operator · Settings → Usage & Infrastructure" : undefined}>
            {t(n.key)}{n.href ? " ↗" : ""}
          </button>
        ))}
      </div>

      <div className="nav-right">
        <ThemeToggle />
        <button className="icon-btn" onClick={onSound} aria-pressed={soundOn} aria-label={soundOn ? "Mute ambient sound" : "Enable ambient sound"} title="Ambient sonar audio">
          {soundOn ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>
          )}
        </button>
        <button className="icon-btn" onClick={onCalm} aria-pressed={calm} aria-label={calm ? "Disable Calm Mode" : "Enable Calm Mode (reduce motion)"} title="Calm Mode">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 12c2.5-3 5.5-3 8 0s5.5 3 8 0" /><path d="M3 17c2.5-3 5.5-3 8 0s5.5 3 8 0" opacity=".5" /><path d="M3 7c2.5-3 5.5-3 8 0s5.5 3 8 0" opacity=".5" /></svg>
        </button>
      </div>
    </nav>
  );
}
