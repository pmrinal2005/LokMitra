"use client";
import { useCallback, useEffect, useState } from "react";

/** Calm Mode — disables ambient animation/particles; persisted in localStorage. */
export function useCalm() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    setCalm(document.documentElement.classList.contains("calm"));
    const obs = new MutationObserver(() => setCalm(document.documentElement.classList.contains("calm")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("calm");
    document.documentElement.classList.toggle("calm", next);
    try {
      localStorage.setItem("lm-calm", next ? "1" : "0");
    } catch {}
  }, []);
  return { calm, toggle };
}

export function isCalm() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("calm");
}
