"use client";
import { SECTORS, type SectorId } from "@/lib/classify";
import type { DeckOverview } from "@/lib/deck-types";

/** Custom single-line glowing SVG illustrations (no icon packs). */
function SectorIcon({ id }: { id: SectorId }) {
  const common = { viewBox: "0 0 48 48", className: `sector-icon ic-${id}`, "aria-hidden": true } as const;
  switch (id) {
    case "agriculture": // one continuous line → wheat stalk
      return (
        <svg {...common}>
          <path className="anim" d="M24 44 V16 M24 30 C 18 28 16 24 16 20 C 21 21 24 24 24 30 C 24 24 27 21 32 20 C 32 24 30 28 24 30 M24 22 C 19 20 18 16 18 12 C 22 13 24 16 24 22 C 24 16 26 13 30 12 C 30 16 29 20 24 22 M24 16 C 22 12 22 8 24 4 C 26 8 26 12 24 16" />
        </svg>
      );
    case "health": // stethoscope + pulse
      return (
        <svg {...common}>
          <path d="M14 6 V18 C 14 24 18 28 22 28 C 26 28 30 24 30 18 V6 M22 28 V34 C 22 40 27 42 31 42 C 35 42 38 39 38 35 V30" />
          <circle className="anim" cx="38" cy="27" r="3" />
          <path d="M6 22 H10 L12 18 L15 26 L17 22" opacity=".6" />
        </svg>
      );
    case "education": // open book + spark
      return (
        <svg {...common}>
          <path className="anim" d="M24 14 C 18 10 10 10 6 12 V38 C 10 36 18 36 24 40 C 30 36 38 36 42 38 V12 C 38 10 30 10 24 14 V40" />
          <path d="M34 4 L35.5 7.5 L39 9 L35.5 10.5 L34 14 L32.5 10.5 L29 9 L32.5 7.5 Z" />
        </svg>
      );
    case "land": // surveyed plot / contour
      return (
        <svg {...common}>
          <path d="M6 34 L18 26 L30 32 L42 22" opacity=".5" />
          <path className="anim" d="M8 40 L20 30 L34 36 L42 28 M12 18 C 18 12 30 12 36 18 C 30 22 18 22 12 18 Z" />
          <circle cx="24" cy="17" r="2" />
          <path d="M24 19 V26" />
        </svg>
      );
    case "welfare": // hands cradling a diya flame
      return (
        <svg {...common}>
          <path d="M4 30 C 10 30 14 34 18 38 H34 C 38 38 42 34 44 30 M10 30 C 12 26 16 26 20 30 H30" />
          <path className="anim" d="M24 26 C 19 22 20 16 24 8 C 28 16 29 22 24 26 Z" />
        </svg>
      );
    case "legal": // scales of justice
      return (
        <svg {...common}>
          <path d="M24 6 V42 M16 42 H32" />
          <g className="anim">
            <path d="M10 14 H38" />
            <path d="M10 14 L5 26 C 7 29 13 29 15 26 Z M38 14 L33 26 C 35 29 41 29 43 26 Z" />
          </g>
          <circle cx="24" cy="8" r="2" />
        </svg>
      );
  }
}

const NOUN: Record<SectorId, string> = {
  agriculture: "farmers served",
  health: "patients guided",
  education: "students served",
  land: "records surfaced",
  welfare: "citizens served",
  legal: "cases tracked",
};

export function SectorTiles({ data }: { data: DeckOverview | null }) {
  const byId = new Map((data?.sectors ?? []).map((s) => [s.id, s]));
  const max = Math.max(1, ...(data?.sectors ?? []).map((s) => s.served));
  return (
    <div className="sector-grid">
      {SECTORS.map((s) => {
        const st = byId.get(s.id);
        const served = st?.served ?? 0;
        return (
          <article key={s.id} className="sector-tile" tabIndex={0} style={{ ["--acc" as string]: s.accent }} aria-label={`${s.label}: ${served} ${NOUN[s.id]}, ${st?.states ?? 0} states live`}>
            <SectorIcon id={s.id} />
            <div className="sector-name">
              {s.label}
              <span className="deva" lang="hi">
                {s.hindi}
              </span>
            </div>
            <div className="sector-stat">
              <b>{served.toLocaleString()}</b> {NOUN[s.id]} · <b>{st?.states ?? 0}</b> state{(st?.states ?? 0) === 1 ? "" : "s"} live
            </div>
            <div className="sector-bar" aria-hidden="true">
              <i style={{ width: `${(served / max) * 100}%` }} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
