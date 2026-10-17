/**
 * Shared (client + server) heuristics that map live TinyFish activity
 * (agent goals, search queries, fetched URLs) onto LokMitra's domain model:
 * Indian states (map nodes) and citizen-service sectors (bento tiles).
 */
import { STATE_NODES } from "./geo-data";

export type SectorId = "agriculture" | "health" | "education" | "land" | "welfare" | "legal";

export const SECTORS: { id: SectorId; label: string; hindi: string; accent: string; keywords: RegExp }[] = [
  {
    id: "agriculture",
    label: "Agriculture",
    hindi: "कृषि",
    accent: "#6EF2A0",
    keywords: /\b(agri|kisan|farmer|farm|crop|mandi|msp|fasal|seed|fertili[sz]er|soil|enam|horticulture|irrigation|pm-?kisan|krishi)\w*/i,
  },
  {
    id: "health",
    label: "Health",
    hindi: "स्वास्थ्य",
    accent: "#4FD9FF",
    keywords: /\b(health|hospital|ayushman|pmjay|abha|clinic|medic|vaccine|cowin|doctor|esanjeevani|nhm|aiims|disease)\w*/i,
  },
  {
    id: "education",
    label: "Education",
    hindi: "शिक्षा",
    accent: "#2EF2C3",
    keywords: /\b(educat|school|scholarship|nsp|exam|result|university|college|student|cbse|ugc|diksha|swayam|admission)\w*/i,
  },
  {
    id: "land",
    label: "Land",
    hindi: "भूमि",
    accent: "#FFB44F",
    keywords: /\b(land|bhulekh|bhoomi|khasra|khatauni|jamabandi|mutation|record|property|registry|igrs|dharani|patta|7\/12|satbara|cadastr)\w*/i,
  },
  {
    id: "welfare",
    label: "Welfare",
    hindi: "कल्याण",
    accent: "#B892FF",
    keywords: /\b(welfare|pension|ration|pds|nfsa|aadhaar|scheme|yojana|subsidy|ujjwala|awas|mgnrega|nrega|jan ?dhan|benefit|dbt|myscheme)\w*/i,
  },
  {
    id: "legal",
    label: "Legal",
    hindi: "विधिक",
    accent: "#FF8FA3",
    keywords: /\b(legal|court|ecourts|case|nalsa|law|judgment|fir|police|rti|consumer|tribunal|gazette|act)\w*/i,
  },
];

const STATE_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "JK", re: /\b(jammu|kashmir|j&k|jk\.gov|ladakh)\b/i },
  { id: "PB", re: /\b(punjab|pb\.gov|punjab\.gov)\b/i },
  { id: "HP", re: /\b(himachal|hp\.gov|hpgov)\b/i },
  { id: "UK", re: /\b(uttarakhand|uk\.gov|dehradun)\b/i },
  { id: "HR", re: /\b(haryana|hr\.gov|jamabandi)\b/i },
  { id: "RJ", re: /\b(rajasthan|rajasthan\.gov|jaipur|apnakhata)\b/i },
  { id: "UP", re: /\b(uttar pradesh|up\.gov|upbhulekh|lucknow|\bup\b)\b/i },
  { id: "BR", re: /\b(bihar|bihar\.gov|patna|biharbhumi)\b/i },
  { id: "WB", re: /\b(west bengal|wb\.gov|kolkata|banglarbhumi)\b/i },
  { id: "AS", re: /\b(assam|assam\.gov|guwahati)\b/i },
  { id: "AR", re: /\b(arunachal)\b/i },
  { id: "MN", re: /\b(manipur|imphal)\b/i },
  { id: "JH", re: /\b(jharkhand|jharbhoomi|ranchi)\b/i },
  { id: "OD", re: /\b(odisha|orissa|bhulekh\.ori|bhubaneswar)\b/i },
  { id: "CG", re: /\b(chhattisgarh|cg\.gov|raipur|bhuiyan)\b/i },
  { id: "MP", re: /\b(madhya pradesh|mp\.gov|mpbhulekh|bhopal)\b/i },
  { id: "GJ", re: /\b(gujarat|gujarat\.gov|anyror|ahmedabad|gandhinagar)\b/i },
  { id: "MH", re: /\b(maharashtra|mahabhumi|mahaonline|mumbai|pune|nashik|nagpur|marathi)\b/i },
  { id: "TG", re: /\b(telangana|dharani|hyderabad)\b/i },
  { id: "AP", re: /\b(andhra|meebhoomi|ap\.gov|vijayawada|amaravati)\b/i },
  { id: "KA", re: /\b(karnataka|bhoomi|bengaluru|bangalore|kannada)\b/i },
  { id: "GA", re: /\b(goa\.gov|\bgoa\b|panaji)\b/i },
  { id: "KL", re: /\b(kerala|kerala\.gov|thiruvananthapuram|kochi|malayalam)\b/i },
  { id: "TN", re: /\b(tamil nadu|tn\.gov|tnreginet|chennai|tamil)\b/i },
  { id: "DL", re: /\b(delhi|india\.gov|gov\.in|nic\.in|national)\b/i },
];

export function classifySector(text: string): SectorId | null {
  for (const s of SECTORS) if (s.keywords.test(text)) return s.id;
  return null;
}

/** Returns a state node id; falls back to the national hub (DL). */
export function classifyState(text: string): string {
  for (const p of STATE_PATTERNS) if (p.re.test(text)) return p.id;
  return "DL";
}

export function stateName(id: string) {
  return STATE_NODES.find((s) => s.id === id)?.name ?? id;
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
