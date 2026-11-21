"use client";
import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_UI_MODE, UI_MODE_ATTR, UI_MODE_KEY, isUiMode, type UiMode } from "@/lib/ui-mode";

const EVT = "lm-ui-mode-change";
let animTimer: ReturnType<typeof setTimeout> | undefined;

function read(): UiMode {
  if (typeof document === "undefined") return DEFAULT_UI_MODE;
  const attr = document.documentElement.getAttribute(UI_MODE_ATTR);
  if (isUiMode(attr)) return attr;
  try {
    const saved = localStorage.getItem(UI_MODE_KEY);
    if (isUiMode(saved)) return saved;
  } catch {}
  return DEFAULT_UI_MODE;
}

/**
 * Applies a UI mode: <html data-ui-mode>, localStorage ("lokmitra_ui_mode") and a window event
 * so every subscriber re-renders. Adds a short-lived `ui-mode-anim` class for a subtle layout
 * transition (skipped under Calm Mode / prefers-reduced-motion). Never touches app state.
 */
export function applyUiMode(next: UiMode, opts: { animate?: boolean } = {}) {
  const root = document.documentElement;
  try {
    localStorage.setItem(UI_MODE_KEY, next);
  } catch {}
  if (root.getAttribute(UI_MODE_ATTR) === next) return;
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (opts.animate !== false && !reduce && !root.classList.contains("calm")) {
    root.classList.remove("ui-mode-anim");
    void root.offsetWidth; // restart the transition if the user toggles quickly
    root.classList.add("ui-mode-anim");
    clearTimeout(animTimer);
    animTimer = setTimeout(() => root.classList.remove("ui-mode-anim"), 520);
  }
  root.setAttribute(UI_MODE_ATTR, next);
  window.dispatchEvent(new Event(EVT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === UI_MODE_KEY && isUiMode(e.newValue)) applyUiMode(e.newValue, { animate: false });
  };
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Global UI-mode store (external store + useSyncExternalStore — one source of truth shared by
 * every component, no provider needed). Persisted in localStorage, restored before paint by the
 * boot script in app/layout.tsx, synced across tabs. Switching modes is presentation-only:
 * chat, input, running queries and the selected language are untouched.
 */
export function useUiMode() {
  const mode = useSyncExternalStore(subscribe, read, () => DEFAULT_UI_MODE);
  const setMode = useCallback((m: UiMode) => applyUiMode(m), []);
  const toggle = useCallback(() => applyUiMode(read() === "casual" ? "developer" : "casual"), []);
  return { mode, setMode, toggle, isCasual: mode === "casual", isDeveloper: mode === "developer" };
}
