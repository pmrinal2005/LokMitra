/**
 * Professional inline SVG icon set (stroke icons, 24×24 grid, currentColor).
 * Replaces every emoji in the UI — no icon font, no extra dependency, works in server
 * and client components. Usage: <Icon name="search" /> · <Icon name="check" size={12} />
 */
import type { CSSProperties } from "react";

const P: Record<string, string> = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  bot: "M12 3v3M7 8h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM9.5 13h.01M14.5 13h.01M3 13v2M21 13v2",
  agent: "M12 2l2.4 4.8L20 8l-4 4 1 6-5-2.7L7 18l1-6-4-4 5.6-1.2z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8",
  brain: "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1",
  clipboard: "M9 4h6v3H9zM9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3M8 12h8M8 16h5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  "check-circle": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l2.8 2.8L16 10",
  x: "M6 6l12 12M18 6L6 18",
  "x-circle": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6M15 9l-6 6",
  alert: "M12 3L2 20h20zM12 10v4M12 17h.01",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  printer: "M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z",
  landmark: "M3 21h18M5 21V10M9.5 21V10M14.5 21V10M19 21V10M2 10l10-6 10 6z",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  volume: "M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  stop: "M7 7h10v10H7z",
  record: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
  play: "M8 5v14l11-7z",
  pause: "M8 5v14M16 5v14",
  save: "M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 3v5h8V3M7 21v-7h10v7",
  keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  timer: "M10 2h4M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 10v4",
  arrow: "M5 12h14M13 6l6 6-6 6",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  user: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21a8 8 0 0 1 16 0",
  store: "M3 9l2-5h14l2 5M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8M10 21v-5h4v5",
  shuffle: "M16 4h4v4M4 20L20 4M20 16v4h-4M15 15l5 5M4 4l5 5",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  megaphone: "M3 11v3l11 5V6L3 11zM14 8h3a4 4 0 0 1 0 8h-3M6 15l1.5 5h3L9 16",
  star: "M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z",
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  zap: "M13 2L4 14h7l-1 8 9-12h-7z",
  wave: "M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1M2 17c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  wheat: "M12 22V8M12 8c-2-1-3-3-3-5 2 0 3 2 3 5zM12 8c2-1 3-3 3-5-2 0-3 2-3 5zM12 13c-2.5-.5-4-2.5-4-4.5 2.5 0 4 2 4 4.5zM12 13c2.5-.5 4-2.5 4-4.5-2.5 0-4 2-4 4.5zM12 18c-2.5-.5-4-2.5-4-4.5 2.5 0 4 2 4 4.5zM12 18c2.5-.5 4-2.5 4-4.5-2.5 0-4 2-4 4.5z",
  hospital: "M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M2 21h20M12 7v6M9 10h6M10 21v-4h4v4",
  graduation: "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6",
  handshake: "M2 11l4-4 4 2 3-2 4 1 5 3M6 7v7l5 5 2-2M13 17l2 2 3-3-5-5M10 14l2 2",
  rupee: "M6 4h12M6 9h12M9 4c4 0 6 2 6 5s-2 5-6 5H6l8 7",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  refresh: "M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01",
  hourglass: "M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9",
  plus: "M12 5v14M5 12h14",
  dollar: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  wallet: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M16 13.5h.01",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  activity: "M3 12h4l3 8 4-16 3 8h4",
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 14, className, style, title, strokeWidth = 1.8 }: { name: IconName | string; size?: number; className?: string; style?: CSSProperties; title?: string; strokeWidth?: number }) {
  const d = P[name] ?? P.info;
  const filled = name === "play" || name === "record" || name === "stop";
  return (
    <svg
      className={`ic ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ display: "inline-block", verticalAlign: "-0.15em", flex: "none", ...style }}
    >
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  );
}

/** Sector id → icon name (replaces the old emoji SECTOR_ICON map in the UI). */
export const SECTOR_ICON_NAME: Record<string, IconName> = {
  agriculture: "wheat",
  health: "hospital",
  education: "graduation",
  land: "map",
  labour: "wrench",
  msme: "store",
  welfare: "handshake",
};

export function SectorIcon({ id, size = 14 }: { id: string; size?: number }) {
  return <Icon name={SECTOR_ICON_NAME[id] ?? "layers"} size={size} />;
}
