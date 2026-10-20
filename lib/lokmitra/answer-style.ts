/**
 * Query-constraint analysis (shared client/server, pure, zero cost).
 * ------------------------------------------------------------------
 * Reads the citizen's OWN instructions out of the question so the answer adapts to them:
 *   style  — binary ("just yes or no"), brief ("in one line"), normal, detailed ("tell everything
 *            in depth"), list ("steps", "documents list")
 *   focus  — what they actually asked about (eligibility / documents / apply / benefit / deadline /
 *            status / price / general) — drives the live Search query, the extraction question
 *            and the Groq answer
 *   persona — detected from the question with scheme NAMES removed first, so "pm-KISAN" never
 *            turns a student into a "farmer"
 * Works for English, Hinglish and Devanagari (Hindi / Marathi) phrasing.
 */
import { SCHEMES } from "./schemes";

export type AnswerStyle = "binary" | "brief" | "normal" | "detailed" | "list";
export type AnswerFocus = "eligibility" | "documents" | "apply" | "benefit" | "deadline" | "status" | "price" | "general";

export interface QueryConstraints {
  style: AnswerStyle;
  focus: AnswerFocus[];
  max_words: number;
  persona: string | null;
  /** the question asks about the citizen's own eligibility ("am I / are students eligible …") */
  asks_eligibility: boolean;
  /** free-text modifiers the LLM must obey verbatim (e.g. "just answer yes or no") */
  instructions: string[];
}

const BINARY = /\b(?:yes\s*(?:or|\/)\s*no|no\s*(?:or|\/)\s*yes|only\s+(?:say|answer|reply)\s+(?:yes|no)|(?:just|only|simply)\s+(?:say|answer|reply|tell(?:\s+me)?)\s+(?:in\s+)?(?:yes|no|one\s+word)|in\s+one\s+word|one[-\s]word\s+answer|haa?n?\s+(?:ya|or)\s+(?:na|nahi|nahin)|ha\s+ki\s+na)\b|हाँ\s*या\s*(?:ना|नहीं)|हां\s*या\s*(?:ना|नहीं)|होय\s*की\s*नाही/i;
const BRIEF = /\b(?:brief(?:ly)?|short(?:ly)?|in\s+short|concise(?:ly)?|quick(?:ly)?|one\s+line|single\s+line|in\s+(?:a\s+)?(?:line|sentence)|tl;?dr|summar(?:y|ise|ize)|sirf|bas\s+itna|jaldi)\b|संक्षेप|छोटा\s+जवाब|थोड़े\s+में/i;
const DETAILED = /\b(?:in[-\s]?depth|in\s+detail|detailed|details?|everything|all\s+about|full\s+(?:details|info(?:rmation)?)|complete\s+(?:details|info(?:rmation)?|guide)|explain|elaborate|thorough(?:ly)?|comprehensive|step[-\s]by[-\s]step\s+guide|vistar|poori\s+jaankari|puri\s+jankari|sab\s+kuch)\b|विस्तार|पूरी\s+जानकारी|सब\s+कुछ|सविस्तर/i;
const LIST = /\b(?:list|steps?|checklist|bullet|points?|kya\s+kya|kaun\s+kaun)\b|सूची|क्या\s+क्या|कौन\s+कौन/i;

const FOCUS_RE: [AnswerFocus, RegExp][] = [
  ["eligibility", /eligib|qualif|who\s+can|can\s+(?:i|a|an|students?|we)\b|am\s+i\b|is\s+(?:a|an|my)\b|are\s+(?:students?|we|women|workers?)\b|patra|paatr|पात्र|योग्य|milega|मिलेगा|मिलेगी|apply\s+or\s+not/i],
  ["documents", /document|papers?|kagaz|kaagaz|दस्तावेज|कागज|proof|certificate|प्रमाण/i],
  ["apply", /how\s+(?:to|do|can)\s+(?:i\s+)?(?:apply|register|enrol|enroll|get)|apply|registration|register|enrol|aavedan|avedan|आवेदन|पंजीकरण|nondani|नोंदणी|kaise\s+(?:kare|karein|karu|milega)|कैसे/i],
  ["benefit", /benefit|amount|how\s+much|kitna|kitne|paisa|labh|लाभ|राशि|कितना|फायदा|fayda|rs\.?\s*\d|₹/i],
  ["deadline", /last\s+date|deadline|due\s+date|kab\s+tak|antim\s+tithi|अंतिम\s+तिथि|until\s+when|closing/i],
  ["status", /status|स्थिति|installment|instalment|kist|किस्त|हप्ता|paisa\s+aaya|credited/i],
  ["price", /price|rate|bhaav|bhav|भाव|दाम|mandi|मंडी/i],
];

/** Remove scheme names/keywords so "PM-KISAN" / "kisan samman" can't be mistaken for a persona. */
export function stripSchemeNames(text: string) {
  let t = ` ${text || ""} `;
  t = t.replace(/\bpm[\s-]?kisan\b|kisan\s+samman(?:\s+nidhi)?|किसान\s+सम्मान(?:\s+निधि)?|पीएम[\s-]?किसान|kisan\s+credit\s+card|\bkcc\b/gi, " ");
  for (const s of SCHEMES) t = t.split(s.name).join(" ");
  return t.replace(/\s+/g, " ").trim();
}

/** Persona from the citizen's own words, scheme names removed first. Student is checked before farmer. */
export function personaFromText(text: string): string | null {
  const t = stripSchemeNames(text);
  if (/\b(?:i\s*a?m|i'm|main|mai|hum|we\s+are)?\s*(?:a\s+)?(?:students?|scholars?|studying|college|school|class\s+\d+|graduat\w*|vidyarthi|padhai)\b|छात्र|छात्रा|विद्यार्थी|पढ़ाई/i.test(t)) return "student";
  if (/\b(?:farmers?|kisan|kisaan|kheti|krishak|cultivator|agricultur\w*)\b|किसान|शेतकरी|खेती|कृषक/i.test(t)) return "farmer";
  if (/\b(?:majdoor|mazdoor|worker|shramik|labou?r(?:er)?|daily\s+wage|gig)\b|मजदूर|श्रमिक/i.test(t)) return "worker";
  if (/\b(?:pension|senior\s+citizen|old\s+age|elderly|budhapa)\b|बुजुर्ग|वृद्ध/i.test(t)) return "elderly";
  if (/\b(?:widow|vidhwa|mahila|woman|women|housewife)\b|महिला|विधवा/i.test(t)) return "woman";
  if (/\b(?:dukaan|shop|business|msme|udyam|enterprise|startup)\b|दुकान|व्यापार/i.test(t)) return "msme";
  return null;
}

export function analyzeQuery(text: string, opts: { persona?: string | null } = {}): QueryConstraints {
  const t = text || "";
  const instructions: string[] = [];
  let style: AnswerStyle = "normal";
  if (BINARY.test(t)) style = "binary";
  else if (DETAILED.test(t)) style = "detailed";
  else if (BRIEF.test(t)) style = "brief";
  else if (LIST.test(t)) style = "list";
  const m = t.match(BINARY) ?? t.match(DETAILED) ?? t.match(BRIEF) ?? t.match(LIST);
  if (m && style !== "normal") instructions.push(m[0].trim());
  const wordLimit = t.match(/\b(?:in|under|within|max(?:imum)?)\s+(\d{1,3})\s+words?\b/i);
  if (wordLimit) instructions.push(wordLimit[0]);
  if (/\b(?:in\s+)?(?:hindi|english|marathi|tamil|telugu|bengali|gujarati)\b/i.test(t)) instructions.push((t.match(/\b(?:in\s+)?(?:hindi|english|marathi|tamil|telugu|bengali|gujarati)\b/i) as RegExpMatchArray)[0]);
  const focus = FOCUS_RE.filter(([, re]) => re.test(t)).map(([f]) => f);
  if (style === "detailed" && (!focus.length || /everything|all about|full|complete|sab kuch|पूरी|सब कुछ|in[-\s]?depth|in detail/i.test(t))) focus.push("eligibility", "benefit", "documents", "apply");
  const base: Record<AnswerStyle, number> = { binary: 3, brief: 35, normal: 80, list: 110, detailed: 170 };
  let max_words = base[style];
  if (wordLimit) max_words = Math.max(1, Math.min(200, Number(wordLimit[1])));
  const persona = personaFromText(t) ?? opts.persona ?? null;
  return { style, focus: focus.length ? [...new Set(focus)] : ["general"], max_words, persona, asks_eligibility: focus.includes("eligibility"), instructions };
}

/** Hard cap: trim to max words at a sentence boundary where possible (never cuts a binary answer). */
export function capWords(s: string, max: number) {
  const words = s.trim().split(/\s+/);
  if (words.length <= max) return s.trim();
  const cut = words.slice(0, max).join(" ");
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("।"), cut.lastIndexOf("\n"));
  return (lastStop > cut.length * 0.5 ? cut.slice(0, lastStop + 1) : `${cut}…`).trim();
}

/** Extra Search keywords so the live TinyFish Search is shaped by what the citizen actually asked. */
export function focusSearchTerms(c: QueryConstraints) {
  const map: Record<AnswerFocus, string> = { eligibility: "eligibility", documents: "documents required", apply: "how to apply", benefit: "benefits", deadline: "last date", status: "", price: "", general: "" };
  const terms = c.focus.map((f) => map[f]).filter(Boolean);
  if (c.persona && c.persona !== "general") terms.push(c.persona === "student" ? "students" : c.persona);
  return [...new Set(terms)].join(" ");
}

/** First short clause of a sentence (no mid-word truncation) — for one-line yes/no reasons. */
export function shortClause(s: string, maxWords = 14) {
  const first = (s || "").split(/\s+[—–-]\s+|;\s+|\.\s+/)[0].replace(/[.;,\s]+$/, "");
  const w = first.split(/\s+/);
  return w.length <= maxWords ? `${first}.` : `${w.slice(0, maxWords).join(" ")}.`;
}
