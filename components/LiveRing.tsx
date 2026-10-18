"use client";
import { useEffect, useState } from "react";
import type { DeckOverview } from "@/lib/deck-types";
import { bus } from "@/lib/bus";
import { isCalm } from "@/hooks/useCalm";

const R_OUT = 88;
const R_IN = 68;
const C_OUT = 2 * Math.PI * R_OUT;
const C_IN = 2 * Math.PI * R_IN;

/** Live Execution ring — share of live Search+Fetch vs live Agent calls. Nothing is cached anywhere. */
export function LiveRing({ data }: { data: DeckOverview | null }) {
  const free = data?.live.open_web_calls ?? 0;
  const paid = data?.live.agent_calls ?? 0;
  const total = free + paid;
  const pct = data?.live.open_web_pct ?? 0;
  const outerFrac = total ? free / total : 0;
  const innerFrac = total ? paid / total : 0;

  const [sparks, setSparks] = useState<number[]>([]);
  useEffect(() => {
    let n = 0;
    const off = bus.on("spark", ({ count }) => {
      if (isCalm()) return;
      for (let i = 0; i < count; i++) {
        const id = Date.now() + n++;
        setTimeout(() => setSparks((s) => [...s, id]), i * 350);
        setTimeout(() => setSparks((s) => s.filter((x) => x !== id)), i * 350 + 2600);
      }
    });
    // ambient: occasionally release a spark representing live Search/Fetch traffic
    const iv = setInterval(() => {
      if (!isCalm() && document.visibilityState === "visible" && outerFrac > 0.5 && Math.random() < 0.5) bus.emit("spark", { count: 1 });
    }, 9000);
    return () => {
      off();
      clearInterval(iv);
    };
  }, [outerFrac]);

  return (
    <div className="ring-body">
      <div className="ring-wrap">
        <svg viewBox="0 0 210 210" aria-hidden="true">
          <defs>
            <linearGradient id="gOuter" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2EF2C3" />
              <stop offset="100%" stopColor="#4FD9FF" />
            </linearGradient>
            <linearGradient id="gInner" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFB44F" />
              <stop offset="100%" stopColor="#FF8F6B" />
            </linearGradient>
            <filter id="ringGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g transform="rotate(-90 105 105)">
            <circle className="ring-track" cx="105" cy="105" r={R_OUT} strokeWidth="10" />
            <circle className="ring-track" cx="105" cy="105" r={R_IN} strokeWidth="7" />
            <circle className="ring-arc" cx="105" cy="105" r={R_OUT} stroke="url(#gOuter)" strokeWidth="10" strokeDasharray={`${C_OUT * outerFrac} ${C_OUT}`} />
            <circle className="ring-arc" cx="105" cy="105" r={R_IN} stroke="url(#gInner)" strokeWidth="7" strokeDasharray={`${C_IN * innerFrac} ${C_IN}`} />
          </g>
          {Array.from({ length: 60 }, (_, i) => {
            const a = (i / 60) * Math.PI * 2;
            const r1 = 100,
              r2 = i % 5 ? 102 : 105;
            return <line key={i} x1={105 + Math.cos(a) * r1} y1={105 + Math.sin(a) * r1} x2={105 + Math.cos(a) * r2} y2={105 + Math.sin(a) * r2} stroke="rgba(141,160,179,.25)" strokeWidth="1" />;
          })}
        </svg>
        {sparks.map((id) => (
          <span key={id} className="spark-orbit" aria-hidden="true" />
        ))}
        <div className="ring-center" aria-live="polite" aria-atomic="true">
          <div className="ring-pct">
            {total ? Math.round(pct) : "—"}
            <small>%</small>
          </div>
          <div className="ring-cap">live search / fetch</div>
          <div className="ring-mono">100% live · 0% cached</div>
        </div>
      </div>
      <div className="ring-legend">
        <div className="item">
          <span className="sw" style={{ background: "linear-gradient(135deg,#2EF2C3,#4FD9FF)", boxShadow: "0 0 8px #2EF2C3" }} />
          <span>Live Search + Fetch</span>
          <span className="num">{free.toLocaleString()}</span>
        </div>
        <div className="item">
          <span className="sw" style={{ background: "linear-gradient(135deg,#FFB44F,#FF8F6B)", boxShadow: "0 0 8px #FFB44F" }} />
          <span>Live Agent runs</span>
          <span className="num">{paid.toLocaleString()}</span>
        </div>
        <div className="item">
          <span className="sw" style={{ background: "var(--jade)", boxShadow: "0 0 8px var(--jade)" }} />
          <span>Cached answers</span>
          <span className="num">0</span>
        </div>
        <div className="item">
          <span className="sw" style={{ background: "var(--aqua)", boxShadow: "0 0 8px var(--aqua)" }} />
          <span>Monitors watching</span>
          <span className="num">{(data?.monitors.active ?? 0).toLocaleString()}</span>
        </div>
        {(data?.errors.search_usage || data?.errors.fetch_usage) && (
          <span className="err-note">usage feed: {(data.errors.search_usage ?? data.errors.fetch_usage)!.message}</span>
        )}
      </div>
    </div>
  );
}
