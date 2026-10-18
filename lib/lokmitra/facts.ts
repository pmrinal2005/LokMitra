/**
 * Deterministic compliance fact-check (no LLM, no API cost).
 * ------------------------------------------------------------------
 * Canonical "guideline facts" for each flagship scheme (benefit amounts, instalment
 * structure, helplines, premium rates) are checked against the text of the LIVE
 * official page LokMitra just fetched (Fetch API) or that a Monitor re-fetched.
 *   confirmed     → the page states the guideline value
 *   contradiction → the page talks about the topic with a DIFFERENT value and never
 *                   states the guideline value (conservative: avoids false alarms)
 *   not_stated    → the page is silent on this fact
 * Shared client/server (pure functions).
 */

export type FactStatus = "confirmed" | "contradiction" | "not_stated";

export interface FactDef {
  id: string;
  scheme_id: string;
  label: string;
  canonical: string; // guideline value (human readable)
  expect: RegExp; // a match confirms the guideline value
  topic?: RegExp; // sentences about this fact
  conflict?: RegExp; // capture group 1 = the value stated on the page
  isConflict?: (found: string) => boolean;
}

export interface FactResult {
  fact_id: string;
  scheme_id: string;
  label: string;
  canonical: string;
  status: FactStatus;
  found?: string | null;
  snippet?: string | null;
  source?: string | null;
}

const RS = String.raw`(?:₹|rs\.?|inr|rupees?)\s*`;

export const FACTS: FactDef[] = [
  // PM-KISAN — Operational Guidelines: ₹6,000/year in 3 equal instalments of ₹2,000
  {
    id: "pmkisan_amount", scheme_id: "pm-kisan", label: "Annual benefit", canonical: "₹6,000 per year",
    expect: new RegExp(`${RS}6000\\b|\\b6000\\s*(?:/-|rupees|per\\s+(?:year|annum))`, "i"),
    topic: /per\s+(?:year|annum)|annual|yearly|income support|financial benefit/i,
    conflict: new RegExp(`${RS}(\\d{4,5})\\s*(?:/-\\s*)?(?:per\\s+(?:year|annum)|annually|yearly|a year)`, "i"),
    isConflict: (v) => v !== "6000",
  },
  {
    id: "pmkisan_instalments", scheme_id: "pm-kisan", label: "Instalments", canonical: "3 instalments of ₹2,000",
    expect: new RegExp(`(?:three|3)\\s+(?:equal\\s+)?(?:four[- ]monthly\\s+)?instal?l?ments|${RS}2000\\b[^.\\n]{0,60}instal`, "i"),
    topic: /instal?l?ment/i,
    conflict: new RegExp(`${RS}(\\d{4})\\s*(?:each|per\\s+instal)`, "i"),
    isConflict: (v) => v !== "2000",
  },
  { id: "pmkisan_helpline", scheme_id: "pm-kisan", label: "Helpline", canonical: "155261 / 1800-115-526", expect: /155261|1800[-\s]?115[-\s]?526|011[-\s]?2430\s?0606|011[-\s]?2338\s?1092/ },
  // Ayushman Bharat PM-JAY — ₹5 lakh per family per year; NHA helpline 14555
  {
    id: "pmjay_cover", scheme_id: "ayushman", label: "Health cover", canonical: "₹5 lakh per family per year",
    expect: new RegExp(`${RS}5\\s*(?:lakh|lac)|\\b500000\\b|5\\s*lakh\\s*(?:per|health|cover)`, "i"),
    topic: /cover|per family|health insurance|hospitali[sz]ation/i,
    conflict: new RegExp(`${RS}(\\d{1,2})\\s*(?:lakh|lac)\\s*(?:per\\s+family|health\\s+cover|cover)`, "i"),
    isConflict: (v) => v !== "5" && v !== "10",
  },
  { id: "pmjay_helpline", scheme_id: "ayushman", label: "Helpline", canonical: "14555", expect: /\b14555\b|1800[-\s]?11[-\s]?4477/ },
  // PMFBY — farmer premium 2% Kharif / 1.5% Rabi / 5% commercial; helpline 14447
  { id: "pmfby_premium", scheme_id: "pmfby", label: "Farmer premium", canonical: "2% Kharif · 1.5% Rabi · 5% commercial", expect: /\b1\.5\s*%|\b2\s*%[^.\n]{0,40}kharif|kharif[^.\n]{0,40}\b2\s*%/i },
  { id: "pmfby_helpline", scheme_id: "pmfby", label: "Helpline", canonical: "14447", expect: /\b14447\b/ },
  // e-Shram — ₹2 lakh accident cover (PMSBY); helpline 14434
  {
    id: "eshram_accident", scheme_id: "eshram", label: "Accident cover", canonical: "₹2 lakh (death / permanent disability)",
    expect: new RegExp(`${RS}2\\s*(?:lakh|lac)|\\b200000\\b|2\\s*lakh`, "i"),
    topic: /accident|insurance|disability/i,
    conflict: new RegExp(`${RS}(\\d{1,2})\\s*(?:lakh|lac)\\s*(?:accident|insurance|cover)`, "i"),
    isConflict: (v) => v !== "2" && v !== "1",
  },
  { id: "eshram_helpline", scheme_id: "eshram", label: "Helpline", canonical: "14434", expect: /\b14434\b/ },
  // NSP helpline
  { id: "nsp_helpline", scheme_id: "nsp", label: "Helpline", canonical: "0120-6619540", expect: /0120[-\s]?661\s?9540/ },
  // PMAY-G — ₹1.20 lakh (plain) / ₹1.30 lakh (hilly / difficult areas)
  { id: "pmayg_assistance", scheme_id: "pmay", label: "House assistance", canonical: "₹1.20 lakh plains · ₹1.30 lakh hilly", expect: /1[.,]2\d?\s*(?:lakh|lac)|\b120000\b|1[.,]3\d?\s*(?:lakh|lac)|\b130000\b/i },
  // MGNREGA — 100 days guaranteed wage employment
  {
    id: "nrega_days", scheme_id: "mgnrega", label: "Guaranteed work", canonical: "100 days per household per year",
    expect: /\b100\s*days|hundred days/i,
    topic: /guarantee|days of (?:wage )?employment/i,
    conflict: /\b(\d{2,3})\s*days\s*of\s*(?:guaranteed\s*)?(?:wage\s*)?employment/i,
    isConflict: (v) => v !== "100" && v !== "150",
  },
  // Udyam — registration is free
  { id: "udyam_free", scheme_id: "udyam", label: "Registration fee", canonical: "Free (no fee)", expect: /free of cost|\bfree\b|no fee|without any (?:fee|charge)/i },
];

/** Thousands separators out ("6,000" → "6000") so patterns stay simple. */
export function normaliseText(t: string) {
  return String(t ?? "").replace(/(\d),(?=\d{2,3}\b)/g, "$1").replace(/(\d),(?=\d)/g, "$1").replace(/\u00a0/g, " ");
}

function snippetAround(text: string, idx: number, len: number) {
  const s = Math.max(0, idx - 70);
  const e = Math.min(text.length, idx + len + 70);
  return `${s > 0 ? "…" : ""}${text.slice(s, e).replace(/\s+/g, " ").trim()}${e < text.length ? "…" : ""}`;
}

export function factsFor(schemeId: string) {
  return FACTS.filter((f) => f.scheme_id === schemeId);
}

/** Check every guideline fact of a scheme against live page text. */
export function factCheck(schemeId: string, rawText: string, source?: string | null): FactResult[] {
  const text = normaliseText(rawText);
  if (!text || text.length < 40) return [];
  const out: FactResult[] = [];
  for (const f of factsFor(schemeId)) {
    const m = f.expect.exec(text);
    if (m) {
      out.push({ fact_id: f.id, scheme_id: f.scheme_id, label: f.label, canonical: f.canonical, status: "confirmed", found: m[0].trim(), snippet: snippetAround(text, m.index, m[0].length), source: source ?? null });
      continue;
    }
    let conflictHit: { v: string; idx: number; len: number } | null = null;
    if (f.conflict) {
      const re = new RegExp(f.conflict.source, f.conflict.flags.includes("g") ? f.conflict.flags : `${f.conflict.flags}g`);
      for (const c of text.matchAll(re)) {
        const v = (c[1] ?? "").trim();
        if (!v) continue;
        const ctx = text.slice(Math.max(0, (c.index ?? 0) - 120), (c.index ?? 0) + c[0].length + 120);
        if (f.topic && !f.topic.test(ctx)) continue;
        if (f.isConflict ? f.isConflict(v) : true) {
          conflictHit = { v, idx: c.index ?? 0, len: c[0].length };
          break;
        }
      }
    }
    if (conflictHit) out.push({ fact_id: f.id, scheme_id: f.scheme_id, label: f.label, canonical: f.canonical, status: "contradiction", found: conflictHit.v, snippet: snippetAround(text, conflictHit.idx, conflictHit.len), source: source ?? null });
    else out.push({ fact_id: f.id, scheme_id: f.scheme_id, label: f.label, canonical: f.canonical, status: "not_stated", found: null, snippet: null, source: source ?? null });
  }
  return out;
}

/** Per-page check, merged: a fact confirmed on ANY page wins; a contradiction is kept only if never confirmed. */
export function factCheckPages(schemeId: string, pages: { url: string; text: string }[]): FactResult[] {
  const merged = new Map<string, FactResult>();
  const rank: Record<FactStatus, number> = { confirmed: 3, contradiction: 2, not_stated: 1 };
  for (const p of pages) {
    for (const r of factCheck(schemeId, p.text, p.url)) {
      const cur = merged.get(r.fact_id);
      if (!cur || rank[r.status] > rank[cur.status]) merged.set(r.fact_id, r);
    }
  }
  return [...merged.values()];
}
