/**
 * UI mode — "casual" (simplified citizen view) vs "developer" (full command deck).
 *
 * Pure presentation-layer switch: both modes share the exact same hooks, state, API calls,
 * voice/text handlers, language and journey/session history. Only what is SHOWN changes.
 *
 * Shared by the server (root layout boot script) and the client (hooks/useUiMode.ts),
 * so this file must stay free of "use client" and browser-only code at module scope.
 */
export type UiMode = "casual" | "developer";

/** localStorage key that persists the chosen mode. */
export const UI_MODE_KEY = "lokmitra_ui_mode";

/** Attribute written on <html> — every mode-specific CSS rule keys off it. */
export const UI_MODE_ATTR = "data-ui-mode";

/** Mode used for first-time visitors (change here to make Developer the default). */
export const DEFAULT_UI_MODE: UiMode = "casual";

export const UI_MODES: readonly UiMode[] = ["casual", "developer"] as const;

export function isUiMode(v: unknown): v is UiMode {
  return v === "casual" || v === "developer";
}

/**
 * Inline boot snippet (runs before paint from app/layout.tsx): restores the persisted mode
 * onto <html data-ui-mode> so the correct layout renders on the very first frame (no flash).
 */
export const UI_MODE_BOOT = `try{var m=localStorage.getItem(${JSON.stringify(UI_MODE_KEY)});if(m!=='casual'&&m!=='developer'){m=${JSON.stringify(DEFAULT_UI_MODE)}}document.documentElement.setAttribute(${JSON.stringify(UI_MODE_ATTR)},m)}catch(e){document.documentElement.setAttribute(${JSON.stringify(UI_MODE_ATTR)},${JSON.stringify(DEFAULT_UI_MODE)})}`;
