import { body, json } from "@/lib/lokmitra/http";
import { LANG_CODES, langByCode } from "@/lib/lokmitra/languages";
import { translateBatch } from "@/lib/lokmitra/groq";
import { hasNativeUi, uiLang, UI_KEYS, UI_STRINGS, type UiKey } from "@/lib/i18n/ui-strings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET  /api/lokmitra/localize?lang=xx
 *   → the full UI string table for `lang`. 7 languages are served from the offline table ($0, instant);
 *     the other 16 scheduled languages are machine-translated from English via Groq
 *     (qwen/qwen3-8b-27b chain). Without GROQ_API_KEY the script fallback table is returned.
 * POST /api/lokmitra/localize { lang, texts: string[] }  (max 40 strings, 600 chars each)
 *   → { texts, via } — free-text localisation for journey bubbles / snapshot items.
 * No Bhashini / IndicTrans: Groq only.
 */
export async function GET(req: Request) {
  const lang = new URL(req.url).searchParams.get("lang") ?? "en";
  if (!LANG_CODES.includes(lang)) return json({ error: { code: "BAD_REQUEST", message: "unknown lang" } }, 400);
  if (hasNativeUi(lang)) return json({ lang, via: "offline", fallback: null, strings: UI_STRINGS[uiLang(lang)] });
  const keys = UI_KEYS;
  const src = keys.map((k) => UI_STRINGS.en[k]);
  const out = await translateBatch(src, lang, { purpose: "ui_localize" });
  if (out.via !== "groq") return json({ lang, via: "offline", fallback: uiLang(lang), strings: UI_STRINGS[uiLang(lang)] });
  const strings = Object.fromEntries(keys.map((k, i) => [k, keepPlaceholders(UI_STRINGS.en[k], out.texts[i])])) as Record<UiKey, string>;
  return json({ lang, via: "groq", model: out.model ?? null, fallback: null, strings, native: langByCode(lang).native });
}

export async function POST(req: Request) {
  const b = await body<{ lang?: string; texts?: unknown[] }>(req);
  const lang = typeof b.lang === "string" && LANG_CODES.includes(b.lang) ? b.lang : null;
  if (!lang) return json({ error: { code: "BAD_REQUEST", message: "valid `lang` required" } }, 400);
  const texts = (Array.isArray(b.texts) ? b.texts : []).slice(0, 40).map((t) => String(t ?? "").slice(0, 600));
  if (!texts.length) return json({ lang, via: "none", texts: [] });
  if (lang === "en") return json({ lang, via: "none", texts });
  const out = await translateBatch(texts, lang, { purpose: "journey_localize" });
  return json({ lang, via: out.via, model: out.model ?? null, texts: out.texts });
}

/** If the model dropped a {placeholder}, fall back to English for that string so fmt() still works. */
function keepPlaceholders(en: string, tr: string) {
  const need = en.match(/\{\w+\}/g) ?? [];
  return need.every((p) => tr.includes(p)) ? tr : en;
}
