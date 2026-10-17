"use client";
import { Fragment } from "react";
import type { TickerItem } from "@/lib/deck-types";
import { stateName } from "@/lib/classify";

export function ImpactTicker({ items, configured }: { items: TickerItem[]; configured: boolean }) {
  const list: TickerItem[] = items.length
    ? items
    : [
        {
          kind: "free",
          icon: "🌊",
          text: configured ? "Deck is live — dispatch a Search, Fetch or Agent mission above and impact will stream here" : "Connect TINYFISH_API_KEY to start streaming real impact events",
          state: "DL",
          sector: null,
          at: null,
        },
      ];
  const dur = Math.max(30, list.length * 7);
  const Track = ({ hidden }: { hidden?: boolean }) => (
    <div className="ticker-track" style={{ ["--dur" as string]: `${dur}s` }} aria-hidden={hidden}>
      {list.map((t, i) => (
        <Fragment key={i}>
          <span className={`tick-item ${t.kind}`}>
            <span className="ic" aria-hidden="true">
              {t.icon}
            </span>
            <span>{t.text}</span>
            <span className="where">· {stateName(t.state).split(" · ")[0]}</span>
          </span>
          <span className="tick-sep" aria-hidden="true" />
        </Fragment>
      ))}
    </div>
  );
  return (
    <div className="ticker" role="marquee" aria-label="Impact ticker">
      <Track />
      <Track hidden />
    </div>
  );
}
