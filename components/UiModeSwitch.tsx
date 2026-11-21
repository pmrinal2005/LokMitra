"use client";
import { useRef } from "react";
import { useUiMode } from "@/hooks/useUiMode";
import { UI_MODES, type UiMode } from "@/lib/ui-mode";

const OPTIONS: Record<UiMode, { label: string; tip: string; icon: React.ReactNode }> = {
  casual: {
    label: "Casual",
    tip: "Simplified view for everyday use",
    icon: <path d="M12 3.5l1.7 4.4 4.4 1.7-4.4 1.7L12 15.7l-1.7-4.4-4.4-1.7 4.4-1.7L12 3.5zM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />,
  },
  developer: {
    label: "Developer",
    tip: "Full view with live agent steps, sources, and logs",
    icon: <path d="M4 5h16v14H4zM7.5 9.5l3 2.5-3 2.5M12.5 15h4" />,
  },
};

/**
 * Casual | Developer segmented pill (top navbar + mobile bar). The highlighted segment and the
 * sliding thumb are driven by CSS on html[data-ui-mode] so the correct state shows on the first
 * paint; React state only drives ARIA + roving focus. Arrow keys move between the two options.
 */
export function UiModeSwitch({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const { mode, setMode } = useUiMode();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next: UiMode = e.key === "Home" ? "casual" : e.key === "End" ? "developer" : mode === "casual" ? "developer" : "casual";
    setMode(next);
    refs.current[next]?.focus();
  };

  return (
    <div className={`ui-mode-switch ${compact ? "is-compact" : ""} ${className}`} role="radiogroup" aria-label="Interface mode" onKeyDown={onKey}>
      <span className="ui-mode-thumb" aria-hidden="true" />
      {UI_MODES.map((id) => {
        const o = OPTIONS[id];
        const on = mode === id;
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className="ui-mode-opt"
            data-opt={id}
            data-tip={o.tip}
            aria-label={`${o.label} mode: ${o.tip}`}
            onClick={() => setMode(id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {o.icon}
            </svg>
            <span className="ui-mode-label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
