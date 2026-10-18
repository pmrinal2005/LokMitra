import "server-only";


/**
 * Deterministic (LLM-free) extraction helpers.
 * Used when Groq is not configured / down, and as a cross-check on LLM output.
 * All functions are pure — unit-testable without network.
 */

export interface PriceRow {
  market: string;
  variety?: string | null;
  min_price: string | null;
  max_price: string | null;
  modal_price: string | null;
  unit: string | null;
  date: string | null;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const money = (s: string | undefined) => {
  if (!s) return null;
  const m = s.replace(/\s+/g, " ").match(/(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)/i);
  return m ? `₹${m[1]}` : null;
};

/** Parse markdown tables that look like mandi price boards (Agmarknet, e-NAM, aggregators). */
export function parsePriceTable(md: string, commodity?: string | null, fallbackMarket?: string | null): PriceRow[] {
  const lines = String(md ?? "").split("\n");
  const out: PriceRow[] = [];
  const com = (commodity ?? "").toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim().startsWith("|") || !/modal/i.test(l)) continue;
    const head = cells(l).map((h) => h.toLowerCase());
    const idx = (re: RegExp) => head.findIndex((h) => re.test(h));
    const iModal = idx(/modal/);
    const iMin = idx(/min/);
    const iMax = idx(/max/);
    const iMarket = idx(/market|mandi|apmc|centre|center/);
    const iDate = idx(/date/);
    const iVar = idx(/variety|grade/);
    const iCom = idx(/commodity|crop/);
    const unitHint = /quintal|qtl/i.test(l) ? "₹/quintal" : /kg/i.test(l) ? "₹/kg" : null;
    for (let j = i + 1; j < lines.length && lines[j].trim().startsWith("|"); j++) {
      if (/^\|?\s*:?-{2,}/.test(lines[j].trim())) continue;
      const c = cells(lines[j]);
      if (c.length < head.length - 1) continue;
      if (com && iCom >= 0 && c[iCom] && !c[iCom].toLowerCase().includes(com)) continue;
      const modal = money(c[iModal]);
      if (!modal) continue;
      const n = Number(modal.replace(/[₹,]/g, ""));
      out.push({
        market: (iMarket >= 0 ? c[iMarket] : fallbackMarket) || "—",
        variety: iVar >= 0 ? c[iVar] || null : null,
        min_price: iMin >= 0 ? money(c[iMin]) : null,
        max_price: iMax >= 0 ? money(c[iMax]) : null,
        modal_price: modal,
        unit: unitHint ?? (n >= 400 ? "₹/quintal" : "₹/kg"),
        date: iDate >= 0 ? c[iDate] || null : null,
      });
      if (out.length >= 12) return out;
    }
  }
  return out;
}

const KEY_RE = /eligib|not eligible|exclu|benefit|₹|rs\.?\s?\d|lakh|instal|document|apply|registration|last date|deadline|helpline|toll.?free|ekyc|aadhaar|premium|cover|pension|scholarship|पात्र|लाभ|दस्तावेज|अंतिम/gi;

/** Portal footer / helpdesk / contact noise (e.g. myScheme's "support-myscheme[at]digitalindia[dot]gov[dot]in (011) 2430…"). */
export function isBoilerplate(s: string): boolean {
  return /\[at\]|\[dot\]|@[a-z0-9-]+\.(gov|nic|in|com)|\(0\d{2,4}\)\s*\d|helpdesk|contact us|last updated|visitor(s)? count|screen reader|skip to (main )?content|terms (and|&) conditions|privacy policy|website (is )?(designed|developed|hosted)|content owned/i.test(s);
}

/** Pick the most informative sentences (eligibility / benefit / documents / deadline) in reading order. */
export function highlights(md: string, max = 5, extra?: RegExp): string[] {
  const text = String(md ?? "")
    // PDF/OCR text is hard-wrapped: re-join a line with the next when it does not end a sentence
    .replace(/([^\n.?!:;|।])\n(?=[a-z(₹\d"'])/g, "$1 ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]+/g, " ");
  const raw = text
    .split(/\n+|(?<=[.?!।])\s+(?=[A-Z0-9(])/)
    .map((s) => s.replace(/^[#>*\-\s\d.)]+/, "").trim())
    .filter((s) => s.length >= 40 && s.length <= 320 && !s.includes("|") && !/^source\b/i.test(s) && !/cookie|sign out|javascript|copyright|©|all rights reserved|retrieved \d|^↑|^\^/i.test(s) && !isBoilerplate(s));
  const seen = new Set<string>();
  const scored = raw
    .map((s, i) => {
      const k = s.toLowerCase().slice(0, 80);
      if (seen.has(k)) return null;
      seen.add(k);
      const hits = (s.match(KEY_RE) ?? []).length + (extra ? (s.match(new RegExp(extra.source, "gi")) ?? []).length : 0);
      return { s, i, score: hits };
    })
    .filter((x): x is { s: string; i: number; score: number } => !!x && x.score > 0);
  const words = (x: string) => new Set(x.toLowerCase().replace(/[^a-z0-9\u0900-\u097f ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const picked: { s: string; i: number; score: number; w: Set<string> }[] = [];
  for (const c of scored.sort((a, b) => b.score - a.score || a.i - b.i)) {
    const w = words(c.s);
    // skip near-duplicates (e.g. the same OCR'd PDF sentence twice)
    if (picked.some((p) => [...w].filter((x) => p.w.has(x)).length / Math.max(1, Math.min(w.size, p.w.size)) > 0.6)) continue;
    picked.push({ ...c, w });
    if (picked.length >= max) break;
  }
  return picked
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
}

/** Is the fetched text a real content page (not a JS shell / footer-only / error page)? */
export function usefulText(t: string | null | undefined, min = 600): boolean {
  const s = String(t ?? "")
    .split("\n")
    .filter((l) => l.trim() && !/^\s*(!?\[[^\]]*\]\([^)]*\)\s*)+$/.test(l) && !/^\s*ad\s*$/i.test(l))
    .join("\n");
  if (s.length < min) return false;
  if (/access denied|request blocked|captcha required|enable javascript to/i.test(s.slice(0, 400))) return false;
  return true;
}

/** Hosts that are never useful as citizen sources (marketplaces, social). */
export const JUNK_HOSTS = /(^|\.)(indiamart\.com|tradeindia\.com|amazon\.in|flipkart\.com|youtube\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|quora\.com|justdial\.com|pinterest\.com)$/i;

export const isIpHost = (u: string | null | undefined) => {
  try {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(new URL(String(u)).hostname);
  } catch {
    return false;
  }
};
