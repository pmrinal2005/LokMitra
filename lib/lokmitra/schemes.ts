/**
 * LokMitra scheme & portal registry (shared client/server).
 * ------------------------------------------------------------------
 * This is the *seed knowledge*: official domains, search templates and
 * tight `output_schema`s. The live, authoritative URLs are discovered at
 * runtime with TinyFish Search (free) and written to `portal_map` —
 * "Discover Once, Fetch Forever". Schemas follow TinyFish's structured-
 * output subset (no additionalProperties/oneOf/const; nullable instead of
 * type arrays; top-level object).
 */
import type { SectorId } from "../classify";

export type TaskKind = "info" | "status" | "land" | "price" | "deadline";

export interface SchemeDef {
  id: string;
  name: string;
  hindi: string;
  sector: SectorId;
  domains: string[]; // official domains (Search include_domains)
  entry: string; // official entry point
  infoLinks: string[]; // public pages → free Fetch
  searchInfo: string; // template; {state} {district} {commodity}
  statusUrl?: string; // gated status checker (Agent)
  statusIdentifiers?: { key: string; label: string; pattern?: string }[];
  stateSpecific?: boolean;
  keywords: RegExp;
  benefit: string;
  diy: string[]; // "do it yourself" steps, always surfaced
}

/* ------------------------------ schemas ------------------------------ */
export const INFO_SCHEMA = {
  type: "object",
  properties: {
    scheme_name: { type: "string" },
    benefit: { type: "string" },
    eligibility: { type: "array", items: { type: "string" }, maxItems: 12 },
    exclusions: { type: "array", items: { type: "string" }, maxItems: 12 },
    documents_required: { type: "array", items: { type: "string" }, maxItems: 12 },
    how_to_apply: { type: "array", items: { type: "string" }, maxItems: 10 },
    deadline: { type: "string", nullable: true },
    helpline: { type: "string", nullable: true },
    official_url: { type: "string", nullable: true },
  },
  required: ["scheme_name", "eligibility"],
} as const;

export const STATUS_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    blocked_by: { type: "string", enum: ["none", "captcha", "otp", "login", "site_down", "not_found"] },
    registration_status: { type: "string", nullable: true },
    ekyc_status: { type: "string", nullable: true },
    land_seeding: { type: "string", nullable: true },
    aadhaar_bank_linked: { type: "string", nullable: true },
    installments: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          date: { type: "string", nullable: true },
          amount: { type: "string", nullable: true },
          utr: { type: "string", nullable: true },
          status: { type: "string", nullable: true },
        },
        required: ["label"],
      },
    },
    pending_actions: { type: "array", items: { type: "string" }, maxItems: 10 },
    raw_message: { type: "string", nullable: true },
  },
  required: ["found", "blocked_by"],
} as const;

export const DISCOVERY_SCHEMA = {
  type: "object",
  properties: {
    status_page_url: { type: "string", nullable: true },
    input_fields: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        properties: { label: { type: "string" }, kind: { type: "string", enum: ["text", "select", "captcha", "otp", "button", "radio"] } },
        required: ["label", "kind"],
      },
    },
    navigation_steps: { type: "array", items: { type: "string" }, maxItems: 12 },
    requires_otp: { type: "boolean" },
    requires_captcha: { type: "boolean" },
    public_info_urls: { type: "array", items: { type: "string" }, maxItems: 8 },
    notes: { type: "string", nullable: true },
  },
  required: ["navigation_steps", "requires_otp", "requires_captcha"],
} as const;

export const LAND_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    blocked_by: { type: "string", enum: ["none", "captcha", "otp", "login", "site_down", "not_found"] },
    cascade_path: { type: "array", items: { type: "string" }, maxItems: 8 },
    owner_names: { type: "array", items: { type: "string" }, maxItems: 20 },
    khasra_or_survey_no: { type: "string", nullable: true },
    area: { type: "string", nullable: true },
    land_type: { type: "string", nullable: true },
    encumbrance_or_remarks: { type: "string", nullable: true },
    record_url: { type: "string", nullable: true },
  },
  required: ["found", "blocked_by"],
} as const;

export const PRICE_SCHEMA = {
  type: "object",
  properties: {
    commodity: { type: "string" },
    prices: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          market: { type: "string" },
          min_price: { type: "string", nullable: true },
          max_price: { type: "string", nullable: true },
          modal_price: { type: "string", nullable: true },
          unit: { type: "string", nullable: true },
          date: { type: "string", nullable: true },
        },
        required: ["market"],
      },
    },
  },
  required: ["commodity", "prices"],
} as const;

/* ------------------------------ registry ------------------------------ */
export const SCHEMES: SchemeDef[] = [
  {
    id: "pm-kisan",
    name: "PM-KISAN",
    hindi: "पीएम-किसान",
    sector: "agriculture",
    domains: ["pmkisan.gov.in", "myscheme.gov.in", "agriwelfare.gov.in"],
    entry: "https://pmkisan.gov.in/",
    infoLinks: ["https://www.myscheme.gov.in/schemes/pm-kisan"],
    searchInfo: "PM-KISAN beneficiary status eligibility official {state}",
    statusUrl: "https://pmkisan.gov.in/BeneficiaryStatus_New.aspx",
    statusIdentifiers: [{ key: "reg_no", label: "Registration number / Aadhaar-linked mobile", pattern: "^[A-Za-z0-9]{8,14}$" }],
    keywords: /\bpm[\s-]?kisan\b|किसान सम्मान|\bkisan samman\b|पीएम[\s-]?किसान|\binstallment\b|\bkist(?:en)?\b|किस्त/i,
    benefit: "₹6,000/year in three instalments to landholding farmer families",
    diy: ["Open pmkisan.gov.in → Farmers Corner → Know Your Status", "Enter registration number, captcha, then OTP on your Aadhaar-linked mobile", "If eKYC is pending: Farmers Corner → eKYC (OTP) or visit a CSC for biometric eKYC"],
  },
  {
    id: "pmfby",
    name: "PM Fasal Bima Yojana",
    hindi: "फसल बीमा",
    sector: "agriculture",
    domains: ["pmfby.gov.in", "myscheme.gov.in"],
    entry: "https://pmfby.gov.in/",
    infoLinks: ["https://www.myscheme.gov.in/schemes/pmfby", "https://pmfby.gov.in/"],
    searchInfo: "PMFBY crop insurance enrollment last date {state} kharif rabi",
    statusUrl: "https://pmfby.gov.in/",
    statusIdentifiers: [{ key: "application_no", label: "Policy / application number" }],
    keywords: /\bpmfby\b|\bfasal bima\b|\bcrop insurance\b|फसल बीमा|\bbima\b/i,
    benefit: "Crop insurance at 1.5–5% farmer premium against yield loss",
    diy: ["Enroll through your bank, CSC or pmfby.gov.in before the season cut-off", "Report crop loss within 72 hours via the Crop Insurance app or helpline 14447"],
  },
  {
    id: "ayushman",
    name: "Ayushman Bharat PM-JAY",
    hindi: "आयुष्मान भारत",
    sector: "health",
    domains: ["nha.gov.in", "pmjay.gov.in", "beneficiary.nha.gov.in", "myscheme.gov.in"],
    entry: "https://beneficiary.nha.gov.in/",
    infoLinks: ["https://www.myscheme.gov.in/schemes/ab-pmjay"],
    searchInfo: "Ayushman Bharat PM-JAY eligibility check card {state}",
    statusUrl: "https://beneficiary.nha.gov.in/",
    statusIdentifiers: [{ key: "mobile_or_aadhaar", label: "Mobile number / Aadhaar (OTP)" }],
    keywords: /\bayushman\b|\bpm-?jay\b|\bpmjay\b|आयुष्मान|\bhealth card\b|\bhospitals?\b|\babha\b/i,
    benefit: "Cashless hospital cover up to ₹5 lakh per family per year",
    diy: ["Open beneficiary.nha.gov.in → login with mobile OTP", "Search by State + Aadhaar/family ID", "eKYC and download the Ayushman card, or visit an empanelled hospital's Arogya Mitra"],
  },
  {
    id: "eshram",
    name: "e-Shram",
    hindi: "ई-श्रम",
    sector: "welfare",
    domains: ["eshram.gov.in", "myscheme.gov.in", "labour.gov.in"],
    entry: "https://eshram.gov.in/",
    infoLinks: ["https://www.myscheme.gov.in/schemes/e-shram", "https://eshram.gov.in/"],
    searchInfo: "e-Shram card registration benefits unorganised workers {state}",
    statusUrl: "https://register.eshram.gov.in/",
    statusIdentifiers: [{ key: "uan", label: "UAN / Aadhaar-linked mobile (OTP)" }],
    keywords: /\be-?shram\b|ई-?श्रम|\bunorgani[sz]ed\b|\blabour card\b|\bshramik\b|\bmajdoor\b|मजदूर/i,
    benefit: "UAN card, ₹2 lakh accident cover (PMSBY) and access to worker schemes",
    diy: ["Register at eshram.gov.in with Aadhaar-linked mobile + OTP", "Or visit a CSC with Aadhaar, bank passbook and mobile"],
  },
  {
    id: "nsp",
    name: "National Scholarship Portal",
    hindi: "छात्रवृत्ति",
    sector: "education",
    domains: ["scholarships.gov.in", "myscheme.gov.in"],
    entry: "https://scholarships.gov.in/",
    infoLinks: ["https://scholarships.gov.in/"],
    searchInfo: "National Scholarship Portal 2026 last date application status {state}",
    statusUrl: "https://scholarships.gov.in/",
    statusIdentifiers: [{ key: "application_id", label: "NSP Application ID / OTR number" }],
    keywords: /\bscholarships?\b|\bnsp\b|छात्रवृत्ति|\bwazifa\b|\bstudents?\b|\bbeta\b|\bbeti\b|\bpadhai\b|पढ़ाई/i,
    benefit: "Central & state pre/post-matric and merit scholarships via DBT",
    diy: ["Create One-Time Registration (OTR) on scholarships.gov.in with Aadhaar + face auth", "Apply before the portal deadline, then track 'Application Status' in the dashboard"],
  },
  {
    id: "pfms-dbt",
    name: "PFMS DBT payment status",
    hindi: "डीबीटी भुगतान",
    sector: "welfare",
    domains: ["pfms.nic.in"],
    entry: "https://pfms.nic.in/",
    infoLinks: ["https://pfms.nic.in/"],
    searchInfo: "PFMS know your payment DBT status check",
    statusUrl: "https://pfms.nic.in/",
    statusIdentifiers: [{ key: "account_no", label: "Bank name + account number" }],
    keywords: /\bpfms\b|\bdbt\b|\bpayment status\b|भुगतान|\bpaisa aaya\b|\bpaisa nahi\b/i,
    benefit: "Tracks every central DBT credit to your bank account",
    diy: ["pfms.nic.in → Payment Status → DBT Status Tracker", "Choose category, enter application id / account number and OTP"],
  },
  {
    id: "udyam",
    name: "Udyam (MSME) Registration",
    hindi: "उद्यम पंजीकरण",
    sector: "welfare",
    domains: ["udyamregistration.gov.in", "msme.gov.in", "myscheme.gov.in"],
    entry: "https://udyamregistration.gov.in/",
    infoLinks: ["https://udyamregistration.gov.in/"],
    searchInfo: "Udyam registration MSME benefits Mudra loan {state}",
    statusUrl: "https://udyamregistration.gov.in/",
    statusIdentifiers: [{ key: "udyam_no", label: "Udyam registration number" }],
    keywords: /\budyam\b|\bmsme\b|\bmudra\b|\bbusiness loan\b|\bdukaan\b|दुकान|उद्यम|\budyog\b/i,
    benefit: "Free MSME identity — priority lending, Mudra loans up to ₹20 lakh, subsidies",
    diy: ["udyamregistration.gov.in → 'For new entrepreneurs' with Aadhaar + PAN", "Registration is free; ignore paid agents"],
  },
  {
    id: "mgnrega",
    name: "MGNREGA job card",
    hindi: "मनरेगा",
    sector: "welfare",
    domains: ["nrega.nic.in", "nrega.dord.gov.in", "rural.gov.in"],
    entry: "https://nrega.nic.in/",
    infoLinks: ["https://nrega.nic.in/"],
    searchInfo: "MGNREGA job card list {state} {district} wage rate 2026",
    stateSpecific: true,
    keywords: /\bmgnrega\b|\bnrega\b|\bmanrega\b|मनरेगा|\bjob card\b|\brozgar\b/i,
    benefit: "100 days of guaranteed wage employment per rural household",
    diy: ["nrega.nic.in → Reports → Job card → State → District → Block → Panchayat", "Apply at your Gram Panchayat; work must be given within 15 days"],
  },
  {
    id: "pds",
    name: "Ration card / PDS (NFSA)",
    hindi: "राशन कार्ड",
    sector: "welfare",
    domains: ["nfsa.gov.in", "impds.nic.in"],
    entry: "https://nfsa.gov.in/",
    infoLinks: ["https://nfsa.gov.in/"],
    searchInfo: "ration card status {state} NFSA PDS official portal",
    stateSpecific: true,
    keywords: /\bration\b|\bpds\b|\bnfsa\b|राशन|\banaj\b|अनाज/i,
    benefit: "Free/subsidised grain under PMGKAY & NFSA; One Nation One Ration Card",
    diy: ["Check your state food portal or nfsa.gov.in → Ration Card Details on State Portals", "Mera Ration app shows entitlement and nearest fair-price shop"],
  },
  {
    id: "bhulekh",
    name: "Land records (Bhulekh / Bhu-Naksha)",
    hindi: "भूलेख",
    sector: "land",
    domains: ["bhunaksha.nic.in", "upbhulekh.gov.in", "bhulekh.mahabhumi.gov.in", "land.bihar.gov.in", "bhulekh.ori.nic.in", "landrecords.mp.gov.in", "anyror.gujarat.gov.in", "jamabandi.nic.in", "apnakhata.rajasthan.gov.in", "eservices.tn.gov.in", "landrecords.karnataka.gov.in", "meebhoomi.ap.gov.in", "dharani.telangana.gov.in", "banglarbhumi.gov.in"],
    entry: "https://bhunaksha.nic.in/",
    infoLinks: ["https://bhunaksha.nic.in/"],
    searchInfo: "{state} bhulekh land record khatauni 7/12 online official",
    stateSpecific: true,
    keywords: /\bbhulekh\b|\bland record\b|\bkhasra\b|\bkhatauni\b|\bjamabandi\b|\b7\/12\b|\bsatbara\b|सातबारा|भूलेख|\bbhu-?naksha\b|\bzameen\b|ज़मीन|जमीन/i,
    benefit: "Official record of rights for loans, KCC, PM-KISAN land seeding",
    diy: ["Open your state's Bhulekh portal", "Select District → Tehsil → Village, then Khasra/Khata number or owner name", "Download the copy; get a signed copy from the Tehsil/CSC if required for loans"],
  },
  {
    id: "mandi",
    name: "Mandi prices (Agmarknet / e-NAM)",
    hindi: "मंडी भाव",
    sector: "agriculture",
    domains: ["agmarknet.gov.in", "enam.gov.in", "data.gov.in"],
    entry: "https://agmarknet.gov.in/",
    infoLinks: ["https://enam.gov.in/web/dashboard/trade-data"],
    searchInfo: "{commodity} mandi price today {district} {state} agmarknet",
    stateSpecific: true,
    keywords: /\bmandi\b|\bbhaav\b|\bbhav\b|भाव|\bprices?\b|\brates?\b|दाम|\bdaam\b|\bmsp\b|\bagmarknet\b|\be-?nam\b/i,
    benefit: "Same-day modal prices so farmers don't sell below market",
    diy: ["agmarknet.gov.in → Price & Arrivals → commodity + state + market", "e-NAM app lists live bids in integrated mandis"],
  },
  {
    id: "myscheme",
    name: "myScheme discovery",
    hindi: "योजना खोज",
    sector: "welfare",
    domains: ["myscheme.gov.in"],
    entry: "https://www.myscheme.gov.in/",
    infoLinks: ["https://www.myscheme.gov.in/"],
    searchInfo: "myscheme schemes for {persona} {state} 2026",
    keywords: /\bmyscheme\b|\bscheme for me\b|\bkaun si yojana\b|कौन सी योजना|\beligible\b|\bpatra\b|पात्र|\byojana\b|योजना|\bschemes\b/i,
    benefit: "Discovers central + state schemes you qualify for",
    diy: ["myscheme.gov.in → Find schemes for you → answer the eligibility questions"],
  },
  {
    id: "pension",
    name: "Old-age / widow pension (NSAP)",
    hindi: "पेंशन",
    sector: "welfare",
    domains: ["nsap.nic.in", "myscheme.gov.in"],
    entry: "https://nsap.nic.in/",
    infoLinks: ["https://www.myscheme.gov.in/schemes/ignoaps"],
    searchInfo: "old age pension NSAP {state} apply status",
    stateSpecific: true,
    keywords: /\bpension\b|पेंशन|\bvridha\b|\bvriddha\b|\bwidow\b|\bvidhwa\b|विधवा|\bold age\b|बुजुर्ग/i,
    benefit: "Monthly pension for elderly, widows and persons with disability",
    diy: ["Apply at the Block/Gram Panchayat office or your state social-welfare portal", "Track payment on nsap.nic.in or PFMS"],
  },
  {
    id: "pmay",
    name: "PM Awas Yojana (Gramin)",
    hindi: "आवास योजना",
    sector: "welfare",
    domains: ["pmayg.nic.in", "rhreporting.nic.in", "myscheme.gov.in"],
    entry: "https://pmayg.nic.in/",
    infoLinks: ["https://www.myscheme.gov.in/schemes/pmay-g"],
    searchInfo: "PMAY-G beneficiary list {state} {district} status",
    keywords: /\bawas\b|\bpmay\b|आवास|\bghar\b|\bhouses?\b|\bmakaan\b|मकान/i,
    benefit: "₹1.2–1.3 lakh assistance to build a pucca house",
    diy: ["pmayg.nic.in → Awaassoft → Reports → Beneficiary details", "Contact Gram Panchayat / Block office for inclusion"],
  },
];

export const STATES: { code: string; name: string; hindi: string; land?: string; food?: string }[] = [
  { code: "IN", name: "All India (central)", hindi: "केंद्र" },
  { code: "UP", name: "Uttar Pradesh", hindi: "उत्तर प्रदेश", land: "https://upbhulekh.gov.in/", food: "https://fcs.up.gov.in/" },
  { code: "MH", name: "Maharashtra", hindi: "महाराष्ट्र", land: "https://bhulekh.mahabhumi.gov.in/", food: "https://mahafood.gov.in/" },
  { code: "BR", name: "Bihar", hindi: "बिहार", land: "https://land.bihar.gov.in/", food: "https://epds.bihar.gov.in/" },
  { code: "MP", name: "Madhya Pradesh", hindi: "मध्य प्रदेश", land: "https://landrecords.mp.gov.in/" },
  { code: "RJ", name: "Rajasthan", hindi: "राजस्थान", land: "https://apnakhata.rajasthan.gov.in/" },
  { code: "GJ", name: "Gujarat", hindi: "गुजरात", land: "https://anyror.gujarat.gov.in/" },
  { code: "OD", name: "Odisha", hindi: "ओडिशा", land: "https://bhulekh.ori.nic.in/" },
  { code: "HR", name: "Haryana", hindi: "हरियाणा", land: "https://jamabandi.nic.in/" },
  { code: "PB", name: "Punjab", hindi: "पंजाब", land: "https://jamabandi.punjab.gov.in/" },
  { code: "TN", name: "Tamil Nadu", hindi: "तमिलनाडु", land: "https://eservices.tn.gov.in/" },
  { code: "KA", name: "Karnataka", hindi: "कर्नाटक", land: "https://landrecords.karnataka.gov.in/" },
  { code: "AP", name: "Andhra Pradesh", hindi: "आंध्र प्रदेश", land: "https://meebhoomi.ap.gov.in/" },
  { code: "TG", name: "Telangana", hindi: "तेलंगाना", land: "https://dharani.telangana.gov.in/" },
  { code: "WB", name: "West Bengal", hindi: "पश्चिम बंगाल", land: "https://banglarbhumi.gov.in/" },
  { code: "KL", name: "Kerala", hindi: "केरल", land: "https://erekha.kerala.gov.in/" },
  { code: "AS", name: "Assam", hindi: "असम", land: "https://revenueassam.nic.in/" },
  { code: "JH", name: "Jharkhand", hindi: "झारखंड", land: "https://jharbhoomi.jharkhand.gov.in/" },
  { code: "CG", name: "Chhattisgarh", hindi: "छत्तीसगढ़", land: "https://bhuiyan.cg.nic.in/" },
  { code: "UK", name: "Uttarakhand", hindi: "उत्तराखंड", land: "https://bhulekh.uk.gov.in/" },
  { code: "HP", name: "Himachal Pradesh", hindi: "हिमाचल प्रदेश", land: "https://himbhoomi.hp.gov.in/" },
  { code: "PB", name: "Punjab", hindi: "पंजाब" },
  { code: "GA", name: "Goa", hindi: "गोवा", land: "https://egov.goa.nic.in/" },
  { code: "JK", name: "Jammu & Kashmir", hindi: "जम्मू-कश्मीर", land: "https://landrecords.jk.gov.in/" },
  { code: "DL", name: "Delhi", hindi: "दिल्ली", land: "https://dlrc.delhigovt.nic.in/" },
].filter((s, i, a) => a.findIndex((x) => x.code === s.code) === i);

export const COMMODITIES: { en: string; re: RegExp }[] = [
  { en: "wheat", re: /wheat|gehu|gehun|गेहूं|गेहूँ|गहू/i },
  { en: "paddy", re: /paddy|rice|dhan|धान|chawal|चावल|tandul/i },
  { en: "onion", re: /onion|pyaz|pyaaz|प्याज|kanda|कांदा/i },
  { en: "tomato", re: /tomato|tamatar|टमाटर/i },
  { en: "potato", re: /potato|aloo|आलू|batata/i },
  { en: "soybean", re: /soybean|soyabean|सोयाबीन/i },
  { en: "cotton", re: /cotton|kapas|कपास/i },
  { en: "mustard", re: /mustard|sarson|सरसों/i },
  { en: "maize", re: /maize|makka|मक्का|corn/i },
  { en: "gram", re: /chana|चना|gram\b/i },
  { en: "sugarcane", re: /sugarcane|ganna|गन्ना|ऊस/i },
  { en: "turmeric", re: /turmeric|haldi|हल्दी/i },
];

/** City/district → state hints (heuristic NLU fallback). */
export const DISTRICT_HINTS: { re: RegExp; state: string; district: string }[] = [
  { re: /nashik|नाशिक|नासिक/i, state: "MH", district: "Nashik" },
  { re: /pune|पुणे/i, state: "MH", district: "Pune" },
  { re: /nagpur|नागपुर/i, state: "MH", district: "Nagpur" },
  { re: /lasalgaon/i, state: "MH", district: "Nashik" },
  { re: /lucknow|लखनऊ/i, state: "UP", district: "Lucknow" },
  { re: /varanasi|वाराणसी|banaras/i, state: "UP", district: "Varanasi" },
  { re: /agra|आगरा/i, state: "UP", district: "Agra" },
  { re: /patna|पटना/i, state: "BR", district: "Patna" },
  { re: /gaya|गया/i, state: "BR", district: "Gaya" },
  { re: /indore|इंदौर/i, state: "MP", district: "Indore" },
  { re: /bhopal|भोपाल/i, state: "MP", district: "Bhopal" },
  { re: /jaipur|जयपुर/i, state: "RJ", district: "Jaipur" },
  { re: /ahmedabad|अहमदाबाद/i, state: "GJ", district: "Ahmedabad" },
  { re: /rajkot/i, state: "GJ", district: "Rajkot" },
  { re: /ludhiana/i, state: "PB", district: "Ludhiana" },
  { re: /karnal/i, state: "HR", district: "Karnal" },
  { re: /madurai|மதுரை/i, state: "TN", district: "Madurai" },
  { re: /chennai|சென்னை/i, state: "TN", district: "Chennai" },
  { re: /guntur/i, state: "AP", district: "Guntur" },
  { re: /warangal/i, state: "TG", district: "Warangal" },
  { re: /mysuru|mysore/i, state: "KA", district: "Mysuru" },
  { re: /cuttack/i, state: "OD", district: "Cuttack" },
  { re: /murshidabad|কলকাতা|kolkata/i, state: "WB", district: "Kolkata" },
];

export const STATE_NAME_HINTS: { re: RegExp; state: string }[] = [
  { re: /uttar pradesh|\bup\b|उत्तर प्रदेश|यूपी/i, state: "UP" },
  { re: /maharashtra|महाराष्ट्र/i, state: "MH" },
  { re: /bihar|बिहार/i, state: "BR" },
  { re: /madhya pradesh|\bmp\b|मध्य प्रदेश/i, state: "MP" },
  { re: /rajasthan|राजस्थान/i, state: "RJ" },
  { re: /gujarat|गुजरात|ગુજરાત/i, state: "GJ" },
  { re: /odisha|orissa|ओडिशा|ଓଡ଼ିଶା/i, state: "OD" },
  { re: /haryana|हरियाणा/i, state: "HR" },
  { re: /punjab|पंजाब|ਪੰਜਾਬ/i, state: "PB" },
  { re: /tamil ?nadu|தமிழ்நாடு/i, state: "TN" },
  { re: /karnataka|ಕರ್ನಾಟಕ/i, state: "KA" },
  { re: /andhra|ఆంధ్ర/i, state: "AP" },
  { re: /telangana|తెలంగాణ/i, state: "TG" },
  { re: /west bengal|bengal|পশ্চিমবঙ্গ/i, state: "WB" },
  { re: /kerala|കേരളം/i, state: "KL" },
  { re: /assam|অসম/i, state: "AS" },
  { re: /jharkhand|झारखंड/i, state: "JH" },
  { re: /chhattisgarh|छत्तीसगढ़/i, state: "CG" },
  { re: /uttarakhand|उत्तराखंड/i, state: "UK" },
  { re: /himachal|हिमाचल/i, state: "HP" },
  { re: /delhi|दिल्ली/i, state: "DL" },
];

export function schemeById(id: string) {
  return SCHEMES.find((s) => s.id === id) ?? null;
}
export function stateByCode(code: string | null | undefined) {
  return STATES.find((s) => s.code === code) ?? STATES[0];
}

/** Rough Agent step budget for the confirmation gate (shown to citizen before any paid run). */
export function estimateSteps(task: TaskKind, cached: boolean): number {
  if (task === "status") return cached ? 8 : 12;
  if (task === "land") return cached ? 10 : 14;
  return cached ? 4 : 6; // discovery of a public info path
}

export function fill(tpl: string, v: Record<string, string | undefined | null>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "").replace(/\s+/g, " ").trim();
}
