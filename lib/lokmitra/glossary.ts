/**
 * Offline glossary — UI / report labels for the priority rollout languages
 * (Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati) + English.
 * Shared client/server, zero API cost: report headings, sector names, verdicts and
 * statuses are always localised even when GROQ_API_KEY is missing or Groq is down.
 * Free-text (facts, reasons, next steps) goes through the Groq translation chain.
 * Languages outside this table fall back to Hindi for Devanagari-script languages,
 * otherwise English.
 */

export type GlossKey =
  | "title" | "greeting" | "question" | "summary"
  | "agriculture" | "health" | "education" | "land" | "labour" | "msme" | "welfare"
  | "next_steps" | "also_eligible" | "contradictions" | "sources" | "benefit" | "eligibility" | "deadline"
  | "helpline" | "status" | "diy" | "documents" | "price" | "sentinel" | "fact_check"
  | "v_likely" | "v_check" | "v_unlikely" | "v_na"
  | "s_ok" | "s_partial" | "s_needs_confirmation" | "s_needs_otp" | "s_error" | "s_skipped"
  | "from_cache" | "fresh" | "confirmed" | "contradiction" | "not_stated"
  | "scan_verify" | "slip_token" | "report_qr" | "why" | "no_contradictions" | "cost" | "verified";

type Table = Record<GlossKey, string>;

const en: Table = {
  title: "Citizen Benefit Report", greeting: "Namaste 🙏 Here is what LokMitra found for you", question: "Question", summary: "Summary",
  agriculture: "Agriculture", health: "Health", education: "Education", land: "Land records", labour: "Labour & workers", msme: "MSME & business", welfare: "Social welfare",
  next_steps: "Next steps", also_eligible: "You may also be eligible for", contradictions: "Contradictions to check", sources: "Official sources",
  benefit: "Benefit", eligibility: "Eligibility", deadline: "Last date", helpline: "Helpline", status: "Status", diy: "Do it yourself", documents: "Documents",
  price: "Mandi price", sentinel: "Latest official updates (Sentinel)", fact_check: "Guideline fact-check",
  v_likely: "Likely eligible", v_check: "Check eligibility", v_unlikely: "Probably not eligible", v_na: "Information",
  s_ok: "Found", s_partial: "Partly found", s_needs_confirmation: "Needs your consent", s_needs_otp: "Needs OTP", s_error: "Portal not reachable", s_skipped: "Skipped",
  from_cache: "from LokMitra cache", fresh: "fresh lookup", confirmed: "matches guideline", contradiction: "differs from guideline", not_stated: "not stated on page",
  scan_verify: "Scan to verify on the official portal", slip_token: "Slip token", report_qr: "This report", why: "Why", no_contradictions: "No guideline-vs-portal contradictions found", cost: "Cost", verified: "Token verified",
};

const hi: Table = {
  title: "नागरिक लाभ रिपोर्ट", greeting: "नमस्ते 🙏 लोकमित्र को आपके लिए यह जानकारी मिली", question: "प्रश्न", summary: "सारांश",
  agriculture: "कृषि", health: "स्वास्थ्य", education: "शिक्षा", land: "भूमि अभिलेख", labour: "श्रमिक", msme: "उद्यम / व्यवसाय", welfare: "समाज कल्याण",
  next_steps: "अगले कदम", also_eligible: "आप इनके लिए भी पात्र हो सकते हैं", contradictions: "जाँचने योग्य विरोधाभास", sources: "आधिकारिक स्रोत",
  benefit: "लाभ", eligibility: "पात्रता", deadline: "अंतिम तिथि", helpline: "हेल्पलाइन", status: "स्थिति", diy: "खुद करें", documents: "दस्तावेज़",
  price: "मंडी भाव", sentinel: "ताज़ा आधिकारिक अपडेट (सेंटिनल)", fact_check: "दिशानिर्देश तथ्य-जाँच",
  v_likely: "संभवतः पात्र", v_check: "पात्रता जाँचें", v_unlikely: "संभवतः पात्र नहीं", v_na: "जानकारी",
  s_ok: "मिला", s_partial: "आंशिक रूप से मिला", s_needs_confirmation: "आपकी सहमति चाहिए", s_needs_otp: "OTP चाहिए", s_error: "पोर्टल उपलब्ध नहीं", s_skipped: "छोड़ा गया",
  from_cache: "लोकमित्र कैश से", fresh: "नई खोज", confirmed: "दिशानिर्देश से मेल खाता है", contradiction: "दिशानिर्देश से अलग", not_stated: "पेज पर नहीं लिखा",
  scan_verify: "आधिकारिक पोर्टल पर जाँचने के लिए स्कैन करें", slip_token: "पर्ची टोकन", report_qr: "यह रिपोर्ट", why: "कारण", no_contradictions: "दिशानिर्देश और पोर्टल में कोई विरोधाभास नहीं मिला", cost: "खर्च", verified: "टोकन सत्यापित",
};

const mr: Table = {
  title: "नागरिक लाभ अहवाल", greeting: "नमस्कार 🙏 लोकमित्रला तुमच्यासाठी ही माहिती मिळाली", question: "प्रश्न", summary: "सारांश",
  agriculture: "शेती", health: "आरोग्य", education: "शिक्षण", land: "जमीन अभिलेख", labour: "कामगार", msme: "उद्योग / व्यवसाय", welfare: "समाज कल्याण",
  next_steps: "पुढील पावले", also_eligible: "तुम्ही यासाठीही पात्र असू शकता", contradictions: "तपासण्याजोगे विरोधाभास", sources: "अधिकृत स्रोत",
  benefit: "लाभ", eligibility: "पात्रता", deadline: "शेवटची तारीख", helpline: "हेल्पलाइन", status: "स्थिती", diy: "स्वतः करा", documents: "कागदपत्रे",
  price: "बाजारभाव", sentinel: "ताजे अधिकृत अपडेट (सेंटिनल)", fact_check: "मार्गदर्शक तत्त्व तथ्य-तपासणी",
  v_likely: "बहुधा पात्र", v_check: "पात्रता तपासा", v_unlikely: "बहुधा पात्र नाही", v_na: "माहिती",
  s_ok: "मिळाले", s_partial: "अंशतः मिळाले", s_needs_confirmation: "तुमची संमती हवी", s_needs_otp: "OTP हवा", s_error: "पोर्टल उपलब्ध नाही", s_skipped: "वगळले",
  from_cache: "लोकमित्र कॅशमधून", fresh: "नवीन शोध", confirmed: "मार्गदर्शक तत्त्वाशी जुळते", contradiction: "मार्गदर्शक तत्त्वापेक्षा वेगळे", not_stated: "पानावर नमूद नाही",
  scan_verify: "अधिकृत पोर्टलवर तपासण्यासाठी स्कॅन करा", slip_token: "पावती टोकन", report_qr: "हा अहवाल", why: "कारण", no_contradictions: "मार्गदर्शक तत्त्व आणि पोर्टलमध्ये विरोधाभास आढळला नाही", cost: "खर्च", verified: "टोकन पडताळले",
};

const ta: Table = {
  title: "குடிமக்கள் நலன் அறிக்கை", greeting: "வணக்கம் 🙏 லோக்மித்ரா உங்களுக்காகக் கண்டறிந்தவை", question: "கேள்வி", summary: "சுருக்கம்",
  agriculture: "விவசாயம்", health: "சுகாதாரம்", education: "கல்வி", land: "நில ஆவணங்கள்", labour: "தொழிலாளர்", msme: "சிறு தொழில்", welfare: "சமூக நலன்",
  next_steps: "அடுத்த படிகள்", also_eligible: "நீங்கள் இவற்றுக்கும் தகுதி பெறலாம்", contradictions: "சரிபார்க்க வேண்டிய முரண்பாடுகள்", sources: "அதிகாரப்பூர்வ ஆதாரங்கள்",
  benefit: "பயன்", eligibility: "தகுதி", deadline: "கடைசி தேதி", helpline: "உதவி எண்", status: "நிலை", diy: "நீங்களே செய்யுங்கள்", documents: "ஆவணங்கள்",
  price: "சந்தை விலை", sentinel: "சமீபத்திய அதிகாரப்பூர்வ அறிவிப்புகள் (சென்டினல்)", fact_check: "வழிகாட்டு உண்மை சரிபார்ப்பு",
  v_likely: "தகுதி இருக்கலாம்", v_check: "தகுதியைச் சரிபார்க்கவும்", v_unlikely: "தகுதி இல்லாமல் இருக்கலாம்", v_na: "தகவல்",
  s_ok: "கிடைத்தது", s_partial: "பகுதியாகக் கிடைத்தது", s_needs_confirmation: "உங்கள் ஒப்புதல் தேவை", s_needs_otp: "OTP தேவை", s_error: "இணையதளம் கிடைக்கவில்லை", s_skipped: "தவிர்க்கப்பட்டது",
  from_cache: "லோக்மித்ரா கேஷிலிருந்து", fresh: "புதிய தேடல்", confirmed: "வழிகாட்டுதலுடன் ஒத்துப்போகிறது", contradiction: "வழிகாட்டுதலில் இருந்து வேறுபடுகிறது", not_stated: "பக்கத்தில் குறிப்பிடப்படவில்லை",
  scan_verify: "அதிகாரப்பூர்வ இணையதளத்தில் சரிபார்க்க ஸ்கேன் செய்யவும்", slip_token: "சீட்டு டோக்கன்", report_qr: "இந்த அறிக்கை", why: "காரணம்", no_contradictions: "முரண்பாடுகள் எதுவும் இல்லை", cost: "செலவு", verified: "டோக்கன் சரிபார்க்கப்பட்டது",
};

const te: Table = {
  title: "పౌర ప్రయోజన నివేదిక", greeting: "నమస్తే 🙏 లోక్‌మిత్ర మీ కోసం కనుగొన్నది", question: "ప్రశ్న", summary: "సారాంశం",
  agriculture: "వ్యవసాయం", health: "ఆరోగ్యం", education: "విద్య", land: "భూ రికార్డులు", labour: "కార్మికులు", msme: "చిన్న పరిశ్రమలు", welfare: "సామాజిక సంక్షేమం",
  next_steps: "తదుపరి చర్యలు", also_eligible: "మీరు వీటికి కూడా అర్హులు కావచ్చు", contradictions: "తనిఖీ చేయాల్సిన వైరుధ్యాలు", sources: "అధికారిక మూలాలు",
  benefit: "ప్రయోజనం", eligibility: "అర్హత", deadline: "చివరి తేదీ", helpline: "హెల్ప్‌లైన్", status: "స్థితి", diy: "మీరే చేయండి", documents: "పత్రాలు",
  price: "మార్కెట్ ధర", sentinel: "తాజా అధికారిక అప్‌డేట్‌లు (సెంటినెల్)", fact_check: "మార్గదర్శక వాస్తవ తనిఖీ",
  v_likely: "అర్హులు కావచ్చు", v_check: "అర్హతను తనిఖీ చేయండి", v_unlikely: "అర్హులు కాకపోవచ్చు", v_na: "సమాచారం",
  s_ok: "లభించింది", s_partial: "పాక్షికంగా లభించింది", s_needs_confirmation: "మీ అనుమతి అవసరం", s_needs_otp: "OTP అవసరం", s_error: "పోర్టల్ అందుబాటులో లేదు", s_skipped: "దాటవేయబడింది",
  from_cache: "లోక్‌మిత్ర కాష్ నుండి", fresh: "కొత్త శోధన", confirmed: "మార్గదర్శకానికి సరిపోతుంది", contradiction: "మార్గదర్శకానికి భిన్నం", not_stated: "పేజీలో పేర్కొనలేదు",
  scan_verify: "అధికారిక పోర్టల్‌లో ధృవీకరించడానికి స్కాన్ చేయండి", slip_token: "స్లిప్ టోకెన్", report_qr: "ఈ నివేదిక", why: "కారణం", no_contradictions: "వైరుధ్యాలు ఏవీ కనుగొనబడలేదు", cost: "ఖర్చు", verified: "టోకెన్ ధృవీకరించబడింది",
};

const bn: Table = {
  title: "নাগরিক সুবিধা প্রতিবেদন", greeting: "নমস্কার 🙏 লোকমিত্র আপনার জন্য যা পেয়েছে", question: "প্রশ্ন", summary: "সারসংক্ষেপ",
  agriculture: "কৃষি", health: "স্বাস্থ্য", education: "শিক্ষা", land: "ভূমি রেকর্ড", labour: "শ্রমিক", msme: "ক্ষুদ্র ব্যবসা", welfare: "সমাজকল্যাণ",
  next_steps: "পরবর্তী পদক্ষেপ", also_eligible: "আপনি এগুলির জন্যও যোগ্য হতে পারেন", contradictions: "যাচাই করার মতো অসঙ্গতি", sources: "সরকারি সূত্র",
  benefit: "সুবিধা", eligibility: "যোগ্যতা", deadline: "শেষ তারিখ", helpline: "হেল্পলাইন", status: "অবস্থা", diy: "নিজে করুন", documents: "নথিপত্র",
  price: "মান্ডি দর", sentinel: "সর্বশেষ সরকারি আপডেট (সেন্টিনেল)", fact_check: "নির্দেশিকা তথ্য-যাচাই",
  v_likely: "সম্ভবত যোগ্য", v_check: "যোগ্যতা যাচাই করুন", v_unlikely: "সম্ভবত যোগ্য নন", v_na: "তথ্য",
  s_ok: "পাওয়া গেছে", s_partial: "আংশিক পাওয়া গেছে", s_needs_confirmation: "আপনার সম্মতি প্রয়োজন", s_needs_otp: "OTP প্রয়োজন", s_error: "পোর্টাল পাওয়া যাচ্ছে না", s_skipped: "বাদ দেওয়া হয়েছে",
  from_cache: "লোকমিত্র ক্যাশ থেকে", fresh: "নতুন অনুসন্ধান", confirmed: "নির্দেশিকার সাথে মেলে", contradiction: "নির্দেশিকা থেকে আলাদা", not_stated: "পৃষ্ঠায় উল্লেখ নেই",
  scan_verify: "সরকারি পোর্টালে যাচাই করতে স্ক্যান করুন", slip_token: "স্লিপ টোকেন", report_qr: "এই প্রতিবেদন", why: "কারণ", no_contradictions: "কোনো অসঙ্গতি পাওয়া যায়নি", cost: "খরচ", verified: "টোকেন যাচাই করা হয়েছে",
};

const gu: Table = {
  title: "નાગરિક લાભ અહેવાલ", greeting: "નમસ્તે 🙏 લોકમિત્રને તમારા માટે આ માહિતી મળી", question: "પ્રશ્ન", summary: "સારાંશ",
  agriculture: "ખેતી", health: "આરોગ્ય", education: "શિક્ષણ", land: "જમીન રેકર્ડ", labour: "શ્રમિક", msme: "ઉદ્યોગ / વ્યવસાય", welfare: "સમાજ કલ્યાણ",
  next_steps: "આગળનાં પગલાં", also_eligible: "તમે આ માટે પણ પાત્ર હોઈ શકો", contradictions: "તપાસવા જેવા વિરોધાભાસ", sources: "સત્તાવાર સ્ત્રોત",
  benefit: "લાભ", eligibility: "પાત્રતા", deadline: "છેલ્લી તારીખ", helpline: "હેલ્પલાઇન", status: "સ્થિતિ", diy: "જાતે કરો", documents: "દસ્તાવેજો",
  price: "બજાર ભાવ", sentinel: "તાજા સત્તાવાર અપડેટ (સેન્ટિનલ)", fact_check: "માર્ગદર્શિકા હકીકત-ચકાસણી",
  v_likely: "સંભવતઃ પાત્ર", v_check: "પાત્રતા તપાસો", v_unlikely: "સંભવતઃ પાત્ર નથી", v_na: "માહિતી",
  s_ok: "મળ્યું", s_partial: "આંશિક મળ્યું", s_needs_confirmation: "તમારી સંમતિ જરૂરી", s_needs_otp: "OTP જરૂરી", s_error: "પોર્ટલ ઉપલબ્ધ નથી", s_skipped: "છોડી દીધું",
  from_cache: "લોકમિત્ર કેશમાંથી", fresh: "નવી શોધ", confirmed: "માર્ગદર્શિકા સાથે મેળ ખાય છે", contradiction: "માર્ગદર્શિકાથી અલગ", not_stated: "પેજ પર ઉલ્લેખ નથી",
  scan_verify: "સત્તાવાર પોર્ટલ પર ચકાસવા સ્કેન કરો", slip_token: "સ્લિપ ટોકન", report_qr: "આ અહેવાલ", why: "કારણ", no_contradictions: "કોઈ વિરોધાભાસ મળ્યો નથી", cost: "ખર્ચ", verified: "ટોકન ચકાસાયું",
};

export const GLOSSARY: Record<string, Table> = { en, hi, mr, ta, te, bn, gu };
export const GLOSSARY_LANGS = Object.keys(GLOSSARY);

const DEVANAGARI_FALLBACK = new Set(["ne", "kok", "mai", "doi", "sa", "brx"]);

/** Which glossary table serves a language (exact, Devanagari→Hindi, Assamese→Bengali, else English). */
export function glossaryLang(lang: string | null | undefined): string {
  const l = String(lang ?? "en");
  if (GLOSSARY[l]) return l;
  if (DEVANAGARI_FALLBACK.has(l)) return "hi";
  if (l === "as") return "bn";
  return "en";
}

/** Localised label (offline, free). */
export function L(key: GlossKey, lang: string | null | undefined): string {
  return GLOSSARY[glossaryLang(lang)][key] ?? en[key];
}

/** True when the language has a native glossary table (not a fallback). */
export function hasNativeGlossary(lang: string | null | undefined) {
  return !!GLOSSARY[String(lang ?? "")];
}
