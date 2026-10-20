/**
 * Persona eligibility rules + "also eligible" discovery (deterministic, shared client/server).
 * These encode the published headline criteria of each scheme so a citizen gets an
 * instant, explainable verdict ("likely / check / probably not") without any paid call.
 * The verdict is advisory only — the official portal / CSC remains the authority.
 */
import { SCHEMES, type SchemeDef } from "./schemes";
import { stripSchemeNames } from "./answer-style";

export type Verdict = "likely" | "check" | "unlikely" | "na";
export type ReportSector = "agriculture" | "health" | "education" | "land" | "labour" | "msme" | "welfare";

export const SECTOR_ORDER: ReportSector[] = ["agriculture", "health", "education", "land", "labour", "msme", "welfare"];
/** semantic icon keys (rendered as SVG in the UI by components/Icon; plain text channels omit them) */
export const SECTOR_ICON: Record<ReportSector, string> = { agriculture: "wheat", health: "hospital", education: "graduation", land: "map", labour: "wrench", msme: "store", welfare: "handshake" };

/** Report sector for a scheme (finer than the deck's 6 sectors: labour + MSME are split out). */
export function reportSector(schemeId: string): ReportSector {
  switch (schemeId) {
    case "pm-kisan": case "pmfby": case "mandi": return "agriculture";
    case "ayushman": return "health";
    case "nsp": return "education";
    case "bhulekh": return "land";
    case "eshram": case "mgnrega": return "labour";
    case "udyam": return "msme";
    default: return "welfare";
  }
}

export interface Profile {
  persona: string | null; // farmer | worker | student | woman | elderly | msme | general
  age?: number | null;
  rural?: boolean | null;
  landholder?: boolean | null;
  widow?: boolean | null;
  income_tax_payer?: boolean | null;
  govt_employee?: boolean | null;
  epfo_member?: boolean | null;
}

/** Cheap profile hints from the citizen's own words (no PII is stored). */
export function profileFromText(text: string, persona: string | null): Profile {
  // scheme names ("PM-KISAN", "Kisan Samman") are removed first so they never imply farmer / rural / landholder
  const t = stripSchemeNames(text || "");
  const ageM = t.match(/\b(\d{2})\s*(?:saal|sal|years?|yrs?|varsh|वर्ष|साल|वर्षे)\b/i) || t.match(/\bage\s*[:=-]?\s*(\d{2})\b/i);
  const age = ageM ? Number(ageM[1]) : null;
  return {
    persona,
    age: age && age >= 5 && age <= 110 ? age : null,
    rural: /gaon|gaanv|village|गांव|गाँव|गाव|rural|panchayat|kisan|farmer|शेतकरी|किसान/i.test(t) || null,
    landholder: /\b(?:meri|apni|my|own)\s+(?:zameen|jameen|land|khet)|land ?holder|acre|bigha|hectare|खेत|ज़मीन|जमीन|शेती/i.test(t) || (persona === "farmer" ? true : null),
    widow: /widow|vidhwa|विधवा/i.test(t) || null,
    income_tax_payer: /income ?tax|आयकर/i.test(t) || null,
    govt_employee: /govt\.? (?:job|employee|naukri)|sarkari naukri|सरकारी नौकरी/i.test(t) || null,
    epfo_member: /\bepf|pf account|esic\b/i.test(t) || null,
  };
}

export interface EligibilityResult {
  verdict: Verdict;
  reasons: string[]; // English, short, factual
}

type Rule = (p: Profile) => EligibilityResult;

const RULES: Record<string, Rule> = {
  "pm-kisan": (p) => {
    if (p.income_tax_payer || p.govt_employee) return { verdict: "unlikely", reasons: ["Income-tax payers and serving/retired government employees are excluded."] };
    if (p.persona === "farmer" || p.landholder) return { verdict: "likely", reasons: ["For landholding farmer families with cultivable land in their name.", "Land must be seeded in PM-KISAN and eKYC completed."] };
    if (p.persona === "student" || p.persona === "worker" || p.persona === "msme") return { verdict: "unlikely", reasons: [`A ${p.persona} qualifies only if their family owns cultivable land recorded in their name — being a ${p.persona} alone does not qualify.`, "Only landholding farmer families qualify."] };
    return { verdict: "check", reasons: ["Only families that own cultivable land qualify."] };
  },
  pmfby: (p) => (p.persona === "farmer" || p.landholder ? { verdict: "likely", reasons: ["All farmers growing notified crops in notified areas, incl. tenants/sharecroppers.", "Enrol before the season cut-off date."] } : { verdict: "check", reasons: ["Only for farmers growing notified crops."] }),
  ayushman: (p) => {
    if ((p.age ?? 0) >= 70) return { verdict: "likely", reasons: ["Every senior citizen aged 70+ is covered regardless of income (Ayushman Vay Vandana)."] };
    if (p.persona === "worker" || p.persona === "farmer" || p.rural) return { verdict: "check", reasons: ["Covers SECC-2011 deprived rural families, listed occupational categories of urban workers and state-added families.", "Check your name on beneficiary.nha.gov.in."] };
    return { verdict: "check", reasons: ["Eligibility depends on SECC-2011 / state lists — check with mobile OTP."] };
  },
  eshram: (p) => {
    if (p.epfo_member || p.income_tax_payer) return { verdict: "unlikely", reasons: ["EPFO/ESIC members and income-tax payers cannot register."] };
    if (p.age && (p.age < 16 || p.age > 59)) return { verdict: "unlikely", reasons: ["Registration is for workers aged 16–59."] };
    if (p.persona === "worker" || p.persona === "farmer" || p.persona === "woman") return { verdict: "likely", reasons: ["For unorganised workers aged 16–59 (incl. farm labour, gig, domestic and construction workers)."] };
    return { verdict: "check", reasons: ["For unorganised-sector workers aged 16–59 not in EPFO/ESIC."] };
  },
  nsp: (p) => (p.persona === "student" ? { verdict: "likely", reasons: ["Pre/post-matric and merit scholarships for students meeting income and marks criteria (usually family income ≤ ₹2.5 lakh)."] } : { verdict: "check", reasons: ["For students; criteria vary by scholarship (income, marks, category)."] }),
  "pfms-dbt": () => ({ verdict: "na", reasons: ["Tracker for any DBT payment to your bank account."] }),
  udyam: (p) => (p.persona === "msme" ? { verdict: "likely", reasons: ["Any micro/small/medium enterprise can register free with Aadhaar + PAN."] } : { verdict: "check", reasons: ["For anyone running (or starting) a business."] }),
  mgnrega: (p) => {
    if (p.age && p.age < 18) return { verdict: "unlikely", reasons: ["Adult (18+) members of rural households only."] };
    if (p.rural || p.persona === "worker" || p.persona === "farmer" || p.persona === "woman") return { verdict: "likely", reasons: ["Any adult member of a rural household willing to do unskilled manual work."] };
    return { verdict: "check", reasons: ["Only for rural households."] };
  },
  pds: (p) => (p.persona && ["worker", "farmer", "woman", "elderly"].includes(p.persona) ? { verdict: "check", reasons: ["Priority / Antyodaya households under NFSA as identified by your state."] } : { verdict: "check", reasons: ["State-identified priority households under NFSA."] }),
  bhulekh: () => ({ verdict: "na", reasons: ["Official record of rights — free to view for any landowner."] }),
  mandi: () => ({ verdict: "na", reasons: ["Public price information."] }),
  myscheme: () => ({ verdict: "na", reasons: ["Discovery of central + state schemes."] }),
  pension: (p) => {
    if ((p.age ?? 0) >= 60 || p.persona === "elderly") return { verdict: "likely", reasons: ["IGNOAPS: BPL citizens aged 60+ get a monthly pension (state top-ups vary)."] };
    if (p.widow || p.persona === "woman") return { verdict: p.widow ? "likely" : "check", reasons: ["IGNWPS: BPL widows aged 40–79 are eligible."] };
    return { verdict: "unlikely", reasons: ["For BPL elderly (60+), widows (40+) or persons with severe disability."] };
  },
  pmay: (p) => (p.rural ? { verdict: "check", reasons: ["Houseless / kutcha-house rural families on the Awaas+ / SECC list."] } : { verdict: "check", reasons: ["Rural houseless families (PMAY-G); urban families see PMAY-U."] }),
};

export function eligibility(schemeId: string, p: Profile): EligibilityResult {
  return (RULES[schemeId] ?? (() => ({ verdict: "na" as Verdict, reasons: [] })))(p);
}

/** Persona → schemes worth surfacing even if the citizen did not ask (myScheme-style discovery). */
const PERSONA_PACK: Record<string, string[]> = {
  farmer: ["pm-kisan", "pmfby", "ayushman", "eshram", "mgnrega", "pds"],
  worker: ["eshram", "mgnrega", "ayushman", "pds", "pmay"],
  student: ["nsp", "ayushman", "pds"],
  woman: ["pension", "eshram", "mgnrega", "pmay", "ayushman"],
  elderly: ["pension", "ayushman", "pds"],
  msme: ["udyam", "eshram", "ayushman"],
  general: ["ayushman", "pds", "eshram"],
};

export interface AlsoEligible {
  scheme_id: string;
  name: string;
  sector: ReportSector;
  benefit: string;
  verdict: Verdict;
  reasons: string[];
  entry: string;
}

export function alsoEligible(askedIds: string[], p: Profile, max = 4): AlsoEligible[] {
  const pack = PERSONA_PACK[p.persona ?? ""] ?? PERSONA_PACK.general;
  const asked = new Set(askedIds);
  const out: AlsoEligible[] = [];
  for (const id of pack) {
    if (asked.has(id)) continue;
    const s = SCHEMES.find((x) => x.id === id) as SchemeDef | undefined;
    if (!s) continue;
    const e = eligibility(id, p);
    if (e.verdict === "unlikely" || e.verdict === "na") continue;
    out.push({ scheme_id: id, name: s.name, sector: reportSector(id), benefit: s.benefit, verdict: e.verdict, reasons: e.reasons.slice(0, 2), entry: s.entry });
    if (out.length >= max) break;
  }
  return out.sort((a, b) => (a.verdict === "likely" ? 0 : 1) - (b.verdict === "likely" ? 0 : 1));
}
