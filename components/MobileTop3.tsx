"use client";
import { useEffect, useState } from "react";
import type { NodeStat } from "@/lib/deck-types";
import { stateName } from "@/lib/classify";

/** Low-end-device friendly map: rotating highlight of the top 3 active states. */
export function MobileTop3({ nodes }: { nodes: NodeStat[] }) {
  const top = [...nodes].sort((a, b) => b.active * 1000 + b.volume - (a.active * 1000 + a.volume)).slice(0, 3);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (top.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % top.length), 4200);
    return () => clearInterval(t);
  }, [top.length]);
  if (!top.length)
    return (
      <div className="map-mobile">
        <div className="top3">
          <div className="top3-card on">
            <span className="tag">dormant</span>
            <h4>Awaiting traffic</h4>
            <span className="panel-sub">// awaiting next citizen query...</span>
          </div>
        </div>
      </div>
    );
  return (
    <div className="map-mobile">
      <div className="top3" aria-live="polite">
        {top.map((n, k) => (
          <div key={n.id} className={`top3-card ${k === i ? "on" : ""}`} aria-hidden={k !== i}>
            <span className={`tag ${n.active ? "teal" : !n.agentic ? "jade" : "amber"}`}>#{k + 1} · {n.active ? "agent swimming" : !n.agentic ? "live search / fetch" : "live agent"}</span>
            <h4>{stateName(n.id)}</h4>
            <span className="panel-sub">
              {n.volume} queries · {n.open_web} search/fetch · {n.agentic} agent
            </span>
            <span style={{ fontSize: 13, color: "var(--pearl)" }}>{n.top_label ?? ""}</span>
          </div>
        ))}
      </div>
      <div className="top3-dots" aria-hidden="true">
        {top.map((n, k) => (
          <i key={n.id} className={k === i ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}
