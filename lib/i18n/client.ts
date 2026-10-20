"use client";
/**
 * Client i18n helpers:
 *  - useT()      → { t, lang, setLang, native } — offline tables for 7 languages, Groq-localised
 *                  tables for the other 16 fetched LIVE on every language switch via GET /api/lokmitra/localize
 *                  (translated strings are never cached in localStorage).
 *  - speak()     → browser SpeechSynthesis TTS in the citizen's language (no server, no cost).
 *  - relTime()   → localised "2 min ago" using Intl.RelativeTimeFormat.
 *  - localizeTexts() → POST /api/lokmitra/localize for free text (journey bubbles).
 * The selected language is shared app-wide through localStorage "lm-lang" + a window event.
 */
import { useCallback, useEffect, useState } from "react";
import { fmt, hasNativeUi, uiLang, UI_STRINGS, type UiKey } from "./ui-strings";
import { LANGUAGES, langByCode } from "@/lib/lokmitra/languages";

const LANG_KEY = "lm-lang";
const EVT = "lm-lang-change";

export function getLang(): string {
  try {
    return localStorage.getItem(LANG_KEY) || "hi";
  } catch {
    return "hi";
  }
}

export function setGlobalLang(l: string) {
  try {
    localStorage.setItem(LANG_KEY, l);
    document.documentElement.lang = l;
  } catch {}
  window.dispatchEvent(new CustomEvent(EVT, { detail: l }));
}

type Table = Record<UiKey, string>;

export function useT() {
  const [lang, setLangState] = useState<string>("hi");
  const [table, setTable] = useState<Table>(UI_STRINGS.hi);
  const [via, setVia] = useState<"offline" | "groq" | "loading">("offline");

  useEffect(() => {
    setLangState(getLang());
    const on = (e: Event) => setLangState(String((e as CustomEvent).detail ?? getLang()));
    const onStorage = (e: StorageEvent) => e.key === LANG_KEY && setLangState(getLang());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    // instant offline table (native or script fallback)
    setTable(UI_STRINGS[uiLang(lang)]);
    setVia("offline");
    if (hasNativeUi(lang)) return;
    // drop any translation cache written by older builds so nothing stale can ever be reused
    try {
      localStorage.removeItem(`lm-ui-${lang}-v1`);
    } catch {}
    setVia("loading");
    fetch(`/api/lokmitra/localize?lang=${encodeURIComponent(lang)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { via: string; strings?: Table }) => {
        if (!alive || !j.strings) return;
        setTable({ ...UI_STRINGS.en, ...j.strings });
        setVia(j.via === "groq" ? "groq" : "offline");
      })
      .catch(() => alive && setVia("offline"));
    return () => {
      alive = false;
    };
  }, [lang]);

  const t = useCallback((k: UiKey, vars?: Record<string, string | number | null | undefined>) => fmt(table[k] ?? UI_STRINGS.en[k] ?? k, vars), [table]);
  const setLang = useCallback((l: string) => {
    setLangState(l);
    setGlobalLang(l);
  }, []);
  return { t, lang, setLang, via, native: langByCode(lang).native, languages: LANGUAGES };
}

/* ---------------- TTS ---------------- */
export function ttsSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** Plain-text for speech: strip markdown, URLs, emoji clutter. */
export function speechText(md: string) {
  return md
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#>`|[\]()]/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Speak in the citizen's language; picks the best installed voice for the BCP-47 tag. Returns a stop fn. */
export function speak(text: string, lang: string, opts: { onEnd?: () => void; rate?: number } = {}): () => void {
  if (!ttsSupported()) {
    opts.onEnd?.();
    return () => {};
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const tag = langByCode(lang).speech;
  const voices = synth.getVoices();
  const voice = voices.find((v) => v.lang === tag) ?? voices.find((v) => v.lang?.startsWith(tag.split("-")[0])) ?? null;
  // chunk long text: some engines stop after ~200 chars
  const parts = speechText(text).match(/[^.!?।\n]{1,220}[.!?।]?/g) ?? [];
  let stopped = false;
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p.trim());
    u.lang = voice?.lang ?? tag;
    if (voice) u.voice = voice;
    u.rate = opts.rate ?? 0.95;
    if (i === parts.length - 1) u.onend = () => !stopped && opts.onEnd?.();
    synth.speak(u);
  });
  if (!parts.length) opts.onEnd?.();
  return () => {
    stopped = true;
    synth.cancel();
    opts.onEnd?.();
  };
}

/* ---------------- relative time ---------------- */
export function relTime(iso: string | null | undefined, lang: string): string {
  if (!iso) return "—";
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(s)) return "—";
  const tag = langByCode(lang).speech;
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  } catch {
    rtf = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });
  }
  const a = Math.abs(s);
  if (a < 45) return rtf.format(Math.round(s), "second");
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  return rtf.format(Math.round(s / (86400 * 30)), "month");
}

/** Free-text localisation through Groq (server). Returns originals on failure. */
export async function localizeTexts(texts: string[], lang: string): Promise<string[]> {
  if (lang === "en" || !texts.length) return texts;
  try {
    const r = await fetch("/api/lokmitra/localize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang, texts }) });
    const j = await r.json();
    return Array.isArray(j.texts) && j.texts.length === texts.length ? j.texts : texts;
  } catch {
    return texts;
  }
}
