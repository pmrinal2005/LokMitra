"use client";
import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";
export const THEME_KEY = "lm-theme";
const THEME_COLOR: Record<Theme, string> = { dark: "#06090F", light: "#F4F7FB" };

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/** Applies a theme to <html data-theme>, the browser chrome colour and localStorage. */
export function applyTheme(next: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", next);
  root.style.colorScheme = next;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLOR[next]));
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {}
}

/**
 * Light / dark theme — persisted in localStorage ("lm-theme") and restored before paint by the
 * boot script in app/layout.tsx. Every toggle instance stays in sync through a MutationObserver
 * on <html data-theme>, and other tabs follow via the storage event.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    setTheme(readTheme());
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY && (e.newValue === "light" || e.newValue === "dark")) applyTheme(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      obs.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const toggle = useCallback(() => applyTheme(readTheme() === "light" ? "dark" : "light"), []);
  return { theme, toggle, setTheme: applyTheme };
}
