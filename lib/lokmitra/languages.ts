/** 22 Scheduled Languages of India (8th Schedule) + English. Shared client/server. */
export interface Lang {
  code: string; // short code used across the app
  name: string; // English name
  native: string; // endonym
  speech: string; // BCP-47 tag for Web Speech API (falls back to hi-IN where browsers lack support)
  script: RegExp | null; // detection hint
  priority?: boolean; // priority rollout (Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati)
}

export const LANGUAGES: Lang[] = [
  { code: "en", name: "English", native: "English", speech: "en-IN", script: null },
  { code: "hi", name: "Hindi", native: "हिन्दी", speech: "hi-IN", script: /[\u0900-\u097F]/, priority: true },
  { code: "mr", name: "Marathi", native: "मराठी", speech: "mr-IN", script: /[\u0900-\u097F]/, priority: true },
  { code: "ta", name: "Tamil", native: "தமிழ்", speech: "ta-IN", script: /[\u0B80-\u0BFF]/, priority: true },
  { code: "te", name: "Telugu", native: "తెలుగు", speech: "te-IN", script: /[\u0C00-\u0C7F]/, priority: true },
  { code: "bn", name: "Bengali", native: "বাংলা", speech: "bn-IN", script: /[\u0980-\u09FF]/, priority: true },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", speech: "gu-IN", script: /[\u0A80-\u0AFF]/, priority: true },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", speech: "kn-IN", script: /[\u0C80-\u0CFF]/ },
  { code: "ml", name: "Malayalam", native: "മലയാളം", speech: "ml-IN", script: /[\u0D00-\u0D7F]/ },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", speech: "pa-IN", script: /[\u0A00-\u0A7F]/ },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", speech: "or-IN", script: /[\u0B00-\u0B7F]/ },
  { code: "as", name: "Assamese", native: "অসমীয়া", speech: "as-IN", script: /[\u0980-\u09FF]/ },
  { code: "ur", name: "Urdu", native: "اردو", speech: "ur-IN", script: /[\u0600-\u06FF]/ },
  { code: "ne", name: "Nepali", native: "नेपाली", speech: "ne-NP", script: /[\u0900-\u097F]/ },
  { code: "kok", name: "Konkani", native: "कोंकणी", speech: "hi-IN", script: /[\u0900-\u097F]/ },
  { code: "mai", name: "Maithili", native: "मैथिली", speech: "hi-IN", script: /[\u0900-\u097F]/ },
  { code: "doi", name: "Dogri", native: "डोगरी", speech: "hi-IN", script: /[\u0900-\u097F]/ },
  { code: "sa", name: "Sanskrit", native: "संस्कृतम्", speech: "hi-IN", script: /[\u0900-\u097F]/ },
  { code: "brx", name: "Bodo", native: "बड़ो", speech: "hi-IN", script: /[\u0900-\u097F]/ },
  { code: "ks", name: "Kashmiri", native: "कॉशुर / کٲشُر", speech: "ur-IN", script: /[\u0600-\u06FF]/ },
  { code: "sd", name: "Sindhi", native: "سنڌي", speech: "ur-IN", script: /[\u0600-\u06FF]/ },
  { code: "mni", name: "Manipuri (Meitei)", native: "ꯃꯤꯇꯩꯂꯣꯟ", speech: "bn-IN", script: /[\uABC0-\uABFF]/ },
  { code: "sat", name: "Santali", native: "ᱥᱟᱱᱛᱟᱲᱤ", speech: "hi-IN", script: /[\u1C50-\u1C7F]/ },
];

export const LANG_CODES = LANGUAGES.map((l) => l.code);

export function langByCode(code: string | null | undefined): Lang {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** Cheap script-based language guess (used when the LLM is unavailable). */
export function guessLanguage(text: string, fallback = "en"): string {
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta";
  if (/[\u0C00-\u0C7F]/.test(text)) return "te";
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu";
  if (/[\u0C80-\u0CFF]/.test(text)) return "kn";
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml";
  if (/[\u0A00-\u0A7F]/.test(text)) return "pa";
  if (/[\u0B00-\u0B7F]/.test(text)) return "or";
  if (/[\uABC0-\uABFF]/.test(text)) return "mni";
  if (/[\u1C50-\u1C7F]/.test(text)) return "sat";
  if (/[\u0980-\u09FF]/.test(text)) return /[ৰৱ]/.test(text) ? "as" : "bn";
  if (/[\u0600-\u06FF]/.test(text)) return "ur";
  if (/[\u0900-\u097F]/.test(text)) {
    // Marathi markers (ळ, common words) vs Hindi
    if (/ळ|आहे|मला|माझ|काय आहे|करायचे|शेतकरी/.test(text)) return "mr";
    return "hi";
  }
  // Romanised Hindi ("Hinglish")
  if (/\b(main|mujhe|mera|meri|hai|hoon|kya|kaise|aaj|bhaav|bhav|kisan|beta|beti|chahiye|batao|karein)\b/i.test(text)) return "hi";
  return fallback;
}
