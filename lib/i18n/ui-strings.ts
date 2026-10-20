/**
 * Offline UI strings for the citizen-facing deck — 7 native tables
 * (English, Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati). Shared client/server, zero API cost.
 * Other Indian languages fall back like the report glossary: Devanagari-script → Hindi,
 * Assamese → Bengali, everything else → English. Free text (questions, reports) is
 * localised by Groq via POST /api/lokmitra/localize. No Bhashini / IndicTrans anywhere.
 *
 * Placeholders use {name} and are filled by `fmt()`.
 */

export const UI_LANGS = ["en", "hi", "mr", "ta", "te", "bn", "gu"] as const;
export type UiLang = (typeof UI_LANGS)[number];

export type UiKey =
  | "nav_journey" | "nav_network" | "nav_logs" | "nav_wallet" | "nav_sectors"
  | "journey_title" | "journey_sub" | "idle_title" | "idle_sub"
  | "ask_placeholder" | "ask_btn" | "mic_start" | "mic_stop" | "mic_unsupported" | "new_q" | "cancel"
  | "st_listen" | "st_understand" | "st_search" | "st_fetch" | "st_agent" | "st_report"
  | "chip_idle" | "chip_working" | "chip_waiting" | "chip_done" | "chip_error"
  | "task_title" | "task_body" | "task_otp_note" | "task_run" | "task_diy" | "task_fields" | "task_cost" | "video_rec"
  | "otp_title" | "otp_body" | "otp_start" | "otp_saved"
  | "agent_running" | "agent_done" | "agent_failed" | "agent_blocked_otp" | "watch_live" | "steps"
  | "speak" | "speak_stop" | "collapse" | "expand" | "show_report" | "english"
  | "snap_title" | "snap_sub" | "snap_schemes" | "snap_likely" | "snap_deadlines" | "snap_actions" | "snap_empty" | "snap_reports"
  | "src_title" | "src_sub" | "src_official" | "src_other" | "src_empty" | "src_read_live" | "src_seen"
  | "role_citizen" | "role_operator" | "role_switch_operator" | "role_switch_citizen" | "role_needed" | "role_needed_body"
  | "tab_integrations" | "tab_usage" | "run_log" | "live_sources" | "error_generic" | "try_again" | "lang_label";

type Table = Record<UiKey, string>;

const en: Table = {
  nav_journey: "Sahayak", nav_network: "Network", nav_logs: "Agent Logs", nav_wallet: "Wallet", nav_sectors: "Sectors",
  journey_title: "Your Sahayak Journey", journey_sub: "Ask once — LokMitra finds the official portal, reads it live and explains it in your language.",
  idle_title: "Namaste How can I help you today?", idle_sub: "Ask about PM-KISAN, Ayushman, scholarships, ration, pension, land records or mandi prices — by voice or text.",
  ask_placeholder: "Type or speak your question…", ask_btn: "Ask", mic_start: "Speak", mic_stop: "Stop", mic_unsupported: "Voice input is not supported in this browser", new_q: "New question", cancel: "Cancel",
  st_listen: "Question", st_understand: "Understanding", st_search: "Finding portal", st_fetch: "Reading pages", st_agent: "Live agent", st_report: "Report",
  chip_idle: "Ready", chip_working: "Working", chip_waiting: "Waiting for you", chip_done: "Done", chip_error: "Problem",
  task_title: "Live check needs a detail", task_body: "A TinyFish agent is ready to open {host} and read your {scheme} status. Type the detail below and it starts instantly. It never submits anything.",
  task_otp_note: "This portal may send an OTP to your registered mobile.", task_run: "Start live check", task_diy: "Do it myself", task_fields: "Details needed",
  task_cost: "live cost so far {cost} · {steps} steps", video_rec: "Watch recording",
  otp_title: "This portal needs an OTP", otp_body: "Log in with your own OTP in a secure browser. The agent then reuses that session — no second login.", otp_start: "Log in with OTP", otp_saved: "Login saved — re-running the check with your session.",
  agent_running: "Agent is working on {host}…", agent_done: "Live check finished", agent_failed: "The agent could not finish", agent_blocked_otp: "The portal asked for an OTP", watch_live: "Watch live", steps: "steps",
  speak: "Listen", speak_stop: "Stop", collapse: "Collapse", expand: "Expand", show_report: "Show report", english: "English",
  snap_title: "Benefit Snapshot", snap_sub: "Everything LokMitra found for you this session", snap_schemes: "Schemes checked", snap_likely: "Likely eligible", snap_deadlines: "Deadlines", snap_actions: "Next actions", snap_empty: "Ask a question to build your benefit snapshot.", snap_reports: "reports",
  src_title: "Verified Sources", src_sub: "Official pages read live for your answers", src_official: "Official government site", src_other: "Other source", src_empty: "Sources appear here after your first question.", src_read_live: "read live", src_seen: "last read",
  role_citizen: "Citizen", role_operator: "Operator", role_switch_operator: "Operator view", role_switch_citizen: "Citizen view", role_needed: "Operator access required", role_needed_body: "Usage, wallet and infrastructure settings are only visible to operators.",
  tab_integrations: "Integrations", tab_usage: "Usage & Infrastructure", run_log: "Run log", live_sources: "live", error_generic: "Something went wrong", try_again: "Try again", lang_label: "Language",
};

const hi: Table = {
  nav_journey: "सहायक", nav_network: "नेटवर्क", nav_logs: "एजेंट लॉग", nav_wallet: "वॉलेट", nav_sectors: "क्षेत्र",
  journey_title: "आपकी सहायक यात्रा", journey_sub: "एक बार पूछें — लोकमित्र आधिकारिक पोर्टल ढूँढकर उसे अभी पढ़ता है और आपकी भाषा में समझाता है।",
  idle_title: "नमस्ते आज मैं आपकी क्या मदद करूँ?", idle_sub: "PM-KISAN, आयुष्मान, छात्रवृत्ति, राशन, पेंशन, भूमि अभिलेख या मंडी भाव के बारे में बोलकर या लिखकर पूछें।",
  ask_placeholder: "अपना सवाल लिखें या बोलें…", ask_btn: "पूछें", mic_start: "बोलें", mic_stop: "रोकें", mic_unsupported: "इस ब्राउज़र में आवाज़ से इनपुट उपलब्ध नहीं है", new_q: "नया सवाल", cancel: "रद्द करें",
  st_listen: "सवाल", st_understand: "समझना", st_search: "पोर्टल खोजना", st_fetch: "पेज पढ़ना", st_agent: "लाइव एजेंट", st_report: "रिपोर्ट",
  chip_idle: "तैयार", chip_working: "काम जारी", chip_waiting: "आपका इंतज़ार", chip_done: "पूरा", chip_error: "समस्या",
  task_title: "लाइव जाँच के लिए जानकारी चाहिए", task_body: "TinyFish एजेंट {host} खोलकर आपकी {scheme} स्थिति पढ़ने को तैयार है। नीचे जानकारी लिखें, जाँच तुरंत शुरू होगी। यह कुछ भी सबमिट नहीं करता।",
  task_otp_note: "यह पोर्टल आपके पंजीकृत मोबाइल पर OTP भेज सकता है।", task_run: "लाइव जाँच शुरू करें", task_diy: "खुद करें", task_fields: "ज़रूरी जानकारी",
  task_cost: "अब तक लाइव खर्च {cost} · {steps} कदम", video_rec: "रिकॉर्डिंग देखें",
  otp_title: "इस पोर्टल को OTP चाहिए", otp_body: "सुरक्षित ब्राउज़र में अपने OTP से लॉग इन करें। फिर एजेंट वही सत्र दोबारा उपयोग करता है — दूसरा लॉगिन नहीं।", otp_start: "OTP से लॉग इन करें", otp_saved: "लॉगिन सहेजा गया — आपके सत्र से जाँच फिर चल रही है।",
  agent_running: "एजेंट {host} पर काम कर रहा है…", agent_done: "लाइव जाँच पूरी हुई", agent_failed: "एजेंट पूरा नहीं कर सका", agent_blocked_otp: "पोर्टल ने OTP माँगा", watch_live: "लाइव देखें", steps: "कदम",
  speak: "सुनें", speak_stop: "रोकें", collapse: "छोटा करें", expand: "बड़ा करें", show_report: "रिपोर्ट दिखाएँ", english: "अंग्रेज़ी",
  snap_title: "लाभ सारांश", snap_sub: "इस सत्र में लोकमित्र को आपके लिए जो मिला", snap_schemes: "जाँची गई योजनाएँ", snap_likely: "संभवतः पात्र", snap_deadlines: "अंतिम तिथियाँ", snap_actions: "अगले कदम", snap_empty: "अपना लाभ सारांश बनाने के लिए एक सवाल पूछें।", snap_reports: "रिपोर्ट",
  src_title: "सत्यापित स्रोत", src_sub: "आपके उत्तरों के लिए अभी पढ़े गए आधिकारिक पेज", src_official: "आधिकारिक सरकारी साइट", src_other: "अन्य स्रोत", src_empty: "पहले सवाल के बाद स्रोत यहाँ दिखेंगे।", src_read_live: "लाइव पढ़ा", src_seen: "पिछली बार पढ़ा",
  role_citizen: "नागरिक", role_operator: "ऑपरेटर", role_switch_operator: "ऑपरेटर दृश्य", role_switch_citizen: "नागरिक दृश्य", role_needed: "ऑपरेटर पहुँच आवश्यक", role_needed_body: "उपयोग, वॉलेट और इंफ्रास्ट्रक्चर सेटिंग्स केवल ऑपरेटरों को दिखती हैं।",
  tab_integrations: "इंटीग्रेशन", tab_usage: "उपयोग और इंफ्रास्ट्रक्चर", run_log: "रन लॉग", live_sources: "लाइव", error_generic: "कुछ गलत हो गया", try_again: "फिर से कोशिश करें", lang_label: "भाषा",
};

const mr: Table = {
  nav_journey: "सहायक", nav_network: "नेटवर्क", nav_logs: "एजंट लॉग", nav_wallet: "वॉलेट", nav_sectors: "क्षेत्रे",
  journey_title: "तुमचा सहायक प्रवास", journey_sub: "एकदाच विचारा — लोकमित्र अधिकृत पोर्टल शोधून ते आत्ता वाचतो आणि तुमच्या भाषेत समजावतो.",
  idle_title: "नमस्कार आज मी तुम्हाला कशी मदत करू?", idle_sub: "PM-KISAN, आयुष्मान, शिष्यवृत्ती, रेशन, पेन्शन, जमीन अभिलेख किंवा बाजारभाव याबद्दल बोलून किंवा लिहून विचारा.",
  ask_placeholder: "तुमचा प्रश्न लिहा किंवा बोला…", ask_btn: "विचारा", mic_start: "बोला", mic_stop: "थांबवा", mic_unsupported: "या ब्राउझरमध्ये आवाज इनपुट उपलब्ध नाही", new_q: "नवीन प्रश्न", cancel: "रद्द करा",
  st_listen: "प्रश्न", st_understand: "समजणे", st_search: "पोर्टल शोधणे", st_fetch: "पाने वाचणे", st_agent: "थेट एजंट", st_report: "अहवाल",
  chip_idle: "तयार", chip_working: "काम सुरू", chip_waiting: "तुमची वाट", chip_done: "पूर्ण", chip_error: "समस्या",
  task_title: "थेट तपासणीसाठी माहिती हवी", task_body: "TinyFish एजंट {host} उघडून तुमची {scheme} स्थिती वाचण्यास तयार आहे. खाली माहिती लिहा, तपासणी लगेच सुरू होईल. हे काहीही सबमिट करत नाही.",
  task_otp_note: "हे पोर्टल तुमच्या नोंदणीकृत मोबाइलवर OTP पाठवू शकते.", task_run: "थेट तपासणी सुरू करा", task_diy: "स्वतः करा", task_fields: "आवश्यक माहिती",
  task_cost: "आतापर्यंत थेट खर्च {cost} · {steps} पावले", video_rec: "रेकॉर्डिंग पहा",
  otp_title: "या पोर्टलला OTP हवा", otp_body: "सुरक्षित ब्राउझरमध्ये तुमच्या OTP ने लॉग इन करा. मग एजंट तेच सत्र पुन्हा वापरतो — दुसरे लॉगिन नाही.", otp_start: "OTP ने लॉग इन करा", otp_saved: "लॉगिन जतन केले — तुमच्या सत्राने तपासणी पुन्हा सुरू.",
  agent_running: "एजंट {host} वर काम करत आहे…", agent_done: "थेट तपासणी पूर्ण", agent_failed: "एजंट पूर्ण करू शकला नाही", agent_blocked_otp: "पोर्टलने OTP मागितला", watch_live: "थेट पाहा", steps: "पावले",
  speak: "ऐका", speak_stop: "थांबवा", collapse: "लहान करा", expand: "मोठे करा", show_report: "अहवाल दाखवा", english: "इंग्रजी",
  snap_title: "लाभ सारांश", snap_sub: "या सत्रात लोकमित्रला तुमच्यासाठी जे मिळाले", snap_schemes: "तपासलेल्या योजना", snap_likely: "बहुधा पात्र", snap_deadlines: "शेवटच्या तारखा", snap_actions: "पुढील पावले", snap_empty: "तुमचा लाभ सारांश तयार करण्यासाठी प्रश्न विचारा.", snap_reports: "अहवाल",
  src_title: "पडताळलेले स्रोत", src_sub: "तुमच्या उत्तरांसाठी आत्ता वाचलेली अधिकृत पाने", src_official: "अधिकृत सरकारी साइट", src_other: "इतर स्रोत", src_empty: "पहिल्या प्रश्नानंतर स्रोत येथे दिसतील.", src_read_live: "थेट वाचले", src_seen: "शेवटचे वाचले",
  role_citizen: "नागरिक", role_operator: "ऑपरेटर", role_switch_operator: "ऑपरेटर दृश्य", role_switch_citizen: "नागरिक दृश्य", role_needed: "ऑपरेटर प्रवेश आवश्यक", role_needed_body: "वापर, वॉलेट आणि इन्फ्रास्ट्रक्चर सेटिंग्ज फक्त ऑपरेटरना दिसतात.",
  tab_integrations: "इंटिग्रेशन", tab_usage: "वापर आणि इन्फ्रास्ट्रक्चर", run_log: "रन लॉग", live_sources: "थेट", error_generic: "काहीतरी चुकले", try_again: "पुन्हा प्रयत्न करा", lang_label: "भाषा",
};

const ta: Table = {
  nav_journey: "சகாயக்", nav_network: "வலையமைப்பு", nav_logs: "முகவர் பதிவுகள்", nav_wallet: "வாலெட்", nav_sectors: "துறைகள்",
  journey_title: "உங்கள் சகாயக் பயணம்", journey_sub: "ஒருமுறை கேளுங்கள் — லோக்மித்ரா அதிகாரப்பூர்வ தளத்தைக் கண்டறிந்து இப்போதே படித்து உங்கள் மொழியில் விளக்கும்.",
  idle_title: "வணக்கம் இன்று நான் உங்களுக்கு எப்படி உதவலாம்?", idle_sub: "PM-KISAN, ஆயுஷ்மான், உதவித்தொகை, ரேஷன், ஓய்வூதியம், நில ஆவணங்கள் அல்லது சந்தை விலை பற்றி பேசியோ எழுதியோ கேளுங்கள்.",
  ask_placeholder: "உங்கள் கேள்வியை எழுதுங்கள் அல்லது பேசுங்கள்…", ask_btn: "கேள்", mic_start: "பேசு", mic_stop: "நிறுத்து", mic_unsupported: "இந்த உலாவியில் குரல் உள்ளீடு இல்லை", new_q: "புதிய கேள்வி", cancel: "ரத்து",
  st_listen: "கேள்வி", st_understand: "புரிதல்", st_search: "தளம் தேடல்", st_fetch: "பக்கங்கள் படித்தல்", st_agent: "நேரடி முகவர்", st_report: "அறிக்கை",
  chip_idle: "தயார்", chip_working: "செயல்படுகிறது", chip_waiting: "உங்களுக்காகக் காத்திருக்கிறது", chip_done: "முடிந்தது", chip_error: "சிக்கல்",
  task_title: "நேரடி சரிபார்ப்புக்கு விவரம் தேவை", task_body: "TinyFish முகவர் {host} தளத்தைத் திறந்து உங்கள் {scheme} நிலையைப் படிக்கத் தயாராக உள்ளது. கீழே விவரத்தை உள்ளிடுங்கள், உடனே தொடங்கும். இது எதையும் சமர்ப்பிக்காது.",
  task_otp_note: "இந்த தளம் உங்கள் பதிவு செய்த கைபேசிக்கு OTP அனுப்பலாம்.", task_run: "நேரடி சரிபார்ப்பைத் தொடங்கு", task_diy: "நானே செய்கிறேன்", task_fields: "தேவையான விவரங்கள்",
  task_cost: "இதுவரை நேரடி செலவு {cost} · {steps} படிகள்", video_rec: "பதிவைப் பார்",
  otp_title: "இந்த தளத்திற்கு OTP தேவை", otp_body: "பாதுகாப்பான உலாவியில் உங்கள் OTP மூலம் உள்நுழையுங்கள். பிறகு முகவர் அதே அமர்வைப் பயன்படுத்தும் — மீண்டும் உள்நுழைய வேண்டாம்.", otp_start: "OTP மூலம் உள்நுழை", otp_saved: "உள்நுழைவு சேமிக்கப்பட்டது — உங்கள் அமர்வுடன் மீண்டும் சரிபார்க்கிறது.",
  agent_running: "முகவர் {host} இல் செயல்படுகிறது…", agent_done: "நேரடி சரிபார்ப்பு முடிந்தது", agent_failed: "முகவரால் முடிக்க முடியவில்லை", agent_blocked_otp: "தளம் OTP கேட்டது", watch_live: "நேரலையில் பார்", steps: "படிகள்",
  speak: "கேளுங்கள்", speak_stop: "நிறுத்து", collapse: "சுருக்கு", expand: "விரிவாக்கு", show_report: "அறிக்கையைக் காட்டு", english: "ஆங்கிலம்",
  snap_title: "நலன் சுருக்கம்", snap_sub: "இந்த அமர்வில் லோக்மித்ரா உங்களுக்காகக் கண்டவை", snap_schemes: "சரிபார்த்த திட்டங்கள்", snap_likely: "தகுதி இருக்கலாம்", snap_deadlines: "கடைசி தேதிகள்", snap_actions: "அடுத்த செயல்கள்", snap_empty: "உங்கள் நலன் சுருக்கத்தை உருவாக்க ஒரு கேள்வி கேளுங்கள்.", snap_reports: "அறிக்கைகள்",
  src_title: "சரிபார்க்கப்பட்ட ஆதாரங்கள்", src_sub: "உங்கள் பதில்களுக்காக நேரடியாகப் படித்த அதிகாரப்பூர்வ பக்கங்கள்", src_official: "அதிகாரப்பூர்வ அரசு தளம்", src_other: "பிற ஆதாரம்", src_empty: "முதல் கேள்விக்குப் பிறகு ஆதாரங்கள் இங்கே தோன்றும்.", src_read_live: "நேரடியாகப் படித்தது", src_seen: "கடைசியாகப் படித்தது",
  role_citizen: "குடிமகன்", role_operator: "இயக்குநர்", role_switch_operator: "இயக்குநர் பார்வை", role_switch_citizen: "குடிமகன் பார்வை", role_needed: "இயக்குநர் அனுமதி தேவை", role_needed_body: "பயன்பாடு, வாலெட் மற்றும் உள்கட்டமைப்பு அமைப்புகள் இயக்குநர்களுக்கு மட்டுமே தெரியும்.",
  tab_integrations: "ஒருங்கிணைப்புகள்", tab_usage: "பயன்பாடு & உள்கட்டமைப்பு", run_log: "இயக்கப் பதிவு", live_sources: "நேரடி", error_generic: "ஏதோ தவறு நடந்தது", try_again: "மீண்டும் முயற்சி", lang_label: "மொழி",
};

const te: Table = {
  nav_journey: "సహాయక్", nav_network: "నెట్‌వర్క్", nav_logs: "ఏజెంట్ లాగ్‌లు", nav_wallet: "వాలెట్", nav_sectors: "రంగాలు",
  journey_title: "మీ సహాయక్ ప్రయాణం", journey_sub: "ఒక్కసారి అడగండి — లోక్‌మిత్ర అధికారిక పోర్టల్‌ను కనుగొని ఇప్పుడే చదివి మీ భాషలో వివరిస్తుంది.",
  idle_title: "నమస్తే ఈరోజు నేను మీకు ఎలా సహాయం చేయగలను?", idle_sub: "PM-KISAN, ఆయుష్మాన్, స్కాలర్‌షిప్, రేషన్, పెన్షన్, భూ రికార్డులు లేదా మార్కెట్ ధరల గురించి మాట్లాడి లేదా రాసి అడగండి.",
  ask_placeholder: "మీ ప్రశ్నను రాయండి లేదా మాట్లాడండి…", ask_btn: "అడగండి", mic_start: "మాట్లాడండి", mic_stop: "ఆపండి", mic_unsupported: "ఈ బ్రౌజర్‌లో వాయిస్ ఇన్‌పుట్ లేదు", new_q: "కొత్త ప్రశ్న", cancel: "రద్దు",
  st_listen: "ప్రశ్న", st_understand: "అర్థం చేసుకోవడం", st_search: "పోర్టల్ వెతకడం", st_fetch: "పేజీలు చదవడం", st_agent: "ప్రత్యక్ష ఏజెంట్", st_report: "నివేదిక",
  chip_idle: "సిద్ధం", chip_working: "పని జరుగుతోంది", chip_waiting: "మీ కోసం వేచి ఉంది", chip_done: "పూర్తయింది", chip_error: "సమస్య",
  task_title: "ప్రత్యక్ష తనిఖీకి వివరం కావాలి", task_body: "TinyFish ఏజెంట్ {host} తెరిచి మీ {scheme} స్థితిని చదవడానికి సిద్ధంగా ఉంది. కింద వివరం నమోదు చేయండి, వెంటనే మొదలవుతుంది. ఇది ఏదీ సమర్పించదు.",
  task_otp_note: "ఈ పోర్టల్ మీ నమోదిత మొబైల్‌కు OTP పంపవచ్చు.", task_run: "ప్రత్యక్ష తనిఖీ ప్రారంభించు", task_diy: "నేనే చేస్తాను", task_fields: "అవసరమైన వివరాలు",
  task_cost: "ఇప్పటివరకు ప్రత్యక్ష ఖర్చు {cost} · {steps} దశలు", video_rec: "రికార్డింగ్ చూడండి",
  otp_title: "ఈ పోర్టల్‌కు OTP అవసరం", otp_body: "సురక్షిత బ్రౌజర్‌లో మీ OTPతో లాగిన్ అవ్వండి. తర్వాత ఏజెంట్ అదే సెషన్‌ను ఉపయోగిస్తుంది — రెండవ లాగిన్ లేదు.", otp_start: "OTPతో లాగిన్", otp_saved: "లాగిన్ సేవ్ అయింది — మీ సెషన్‌తో తనిఖీ మళ్ళీ నడుస్తోంది.",
  agent_running: "ఏజెంట్ {host}లో పని చేస్తోంది…", agent_done: "ప్రత్యక్ష తనిఖీ పూర్తయింది", agent_failed: "ఏజెంట్ పూర్తి చేయలేకపోయింది", agent_blocked_otp: "పోర్టల్ OTP అడిగింది", watch_live: "ప్రత్యక్షంగా చూడండి", steps: "దశలు",
  speak: "వినండి", speak_stop: "ఆపండి", collapse: "కుదించు", expand: "విస్తరించు", show_report: "నివేదిక చూపు", english: "ఆంగ్లం",
  snap_title: "ప్రయోజన సారాంశం", snap_sub: "ఈ సెషన్‌లో లోక్‌మిత్ర మీ కోసం కనుగొన్నవి", snap_schemes: "తనిఖీ చేసిన పథకాలు", snap_likely: "అర్హులు కావచ్చు", snap_deadlines: "చివరి తేదీలు", snap_actions: "తదుపరి చర్యలు", snap_empty: "మీ ప్రయోజన సారాంశం కోసం ఒక ప్రశ్న అడగండి.", snap_reports: "నివేదికలు",
  src_title: "ధృవీకరించిన మూలాలు", src_sub: "మీ సమాధానాల కోసం ప్రత్యక్షంగా చదివిన అధికారిక పేజీలు", src_official: "అధికారిక ప్రభుత్వ సైట్", src_other: "ఇతర మూలం", src_empty: "మొదటి ప్రశ్న తర్వాత మూలాలు ఇక్కడ కనిపిస్తాయి.", src_read_live: "ప్రత్యక్షంగా చదివింది", src_seen: "చివరిగా చదివింది",
  role_citizen: "పౌరుడు", role_operator: "ఆపరేటర్", role_switch_operator: "ఆపరేటర్ వీక్షణ", role_switch_citizen: "పౌర వీక్షణ", role_needed: "ఆపరేటర్ యాక్సెస్ అవసరం", role_needed_body: "వినియోగం, వాలెట్ మరియు మౌలిక సదుపాయాల సెట్టింగ్‌లు ఆపరేటర్లకు మాత్రమే కనిపిస్తాయి.",
  tab_integrations: "ఇంటిగ్రేషన్‌లు", tab_usage: "వినియోగం & మౌలిక సదుపాయాలు", run_log: "రన్ లాగ్", live_sources: "ప్రత్యక్ష", error_generic: "ఏదో తప్పు జరిగింది", try_again: "మళ్ళీ ప్రయత్నించండి", lang_label: "భాష",
};

const bn: Table = {
  nav_journey: "সহায়ক", nav_network: "নেটওয়ার্ক", nav_logs: "এজেন্ট লগ", nav_wallet: "ওয়ালেট", nav_sectors: "ক্ষেত্র",
  journey_title: "আপনার সহায়ক যাত্রা", journey_sub: "একবার জিজ্ঞাসা করুন — লোকমিত্র সরকারি পোর্টাল খুঁজে এখনই পড়ে আপনার ভাষায় বুঝিয়ে দেয়।",
  idle_title: "নমস্কার আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?", idle_sub: "PM-KISAN, আয়ুষ্মান, বৃত্তি, রেশন, পেনশন, ভূমি রেকর্ড বা মান্ডি দর সম্পর্কে বলে বা লিখে জিজ্ঞাসা করুন।",
  ask_placeholder: "আপনার প্রশ্ন লিখুন বা বলুন…", ask_btn: "জিজ্ঞাসা", mic_start: "বলুন", mic_stop: "থামান", mic_unsupported: "এই ব্রাউজারে ভয়েস ইনপুট নেই", new_q: "নতুন প্রশ্ন", cancel: "বাতিল",
  st_listen: "প্রশ্ন", st_understand: "বোঝা", st_search: "পোর্টাল খোঁজা", st_fetch: "পৃষ্ঠা পড়া", st_agent: "লাইভ এজেন্ট", st_report: "প্রতিবেদন",
  chip_idle: "প্রস্তুত", chip_working: "কাজ চলছে", chip_waiting: "আপনার অপেক্ষায়", chip_done: "সম্পন্ন", chip_error: "সমস্যা",
  task_title: "লাইভ যাচাইয়ের জন্য তথ্য দরকার", task_body: "TinyFish এজেন্ট {host} খুলে আপনার {scheme} অবস্থা পড়তে প্রস্তুত। নিচে তথ্য লিখুন, সঙ্গে সঙ্গে শুরু হবে। এটি কিছুই জমা দেয় না।",
  task_otp_note: "এই পোর্টাল আপনার নিবন্ধিত মোবাইলে OTP পাঠাতে পারে।", task_run: "লাইভ যাচাই শুরু করুন", task_diy: "নিজে করব", task_fields: "প্রয়োজনীয় তথ্য",
  task_cost: "এখন পর্যন্ত লাইভ খরচ {cost} · {steps} ধাপ", video_rec: "রেকর্ডিং দেখুন",
  otp_title: "এই পোর্টালে OTP প্রয়োজন", otp_body: "নিরাপদ ব্রাউজারে আপনার OTP দিয়ে লগ ইন করুন। তারপর এজেন্ট সেই সেশন আবার ব্যবহার করে — দ্বিতীয় লগইন নেই।", otp_start: "OTP দিয়ে লগ ইন", otp_saved: "লগইন সংরক্ষিত — আপনার সেশন দিয়ে আবার যাচাই চলছে।",
  agent_running: "এজেন্ট {host}-এ কাজ করছে…", agent_done: "লাইভ যাচাই সম্পন্ন", agent_failed: "এজেন্ট শেষ করতে পারেনি", agent_blocked_otp: "পোর্টাল OTP চেয়েছে", watch_live: "লাইভ দেখুন", steps: "ধাপ",
  speak: "শুনুন", speak_stop: "থামান", collapse: "ছোট করুন", expand: "বড় করুন", show_report: "প্রতিবেদন দেখান", english: "ইংরেজি",
  snap_title: "সুবিধার সারসংক্ষেপ", snap_sub: "এই সেশনে লোকমিত্র আপনার জন্য যা পেয়েছে", snap_schemes: "যাচাই করা প্রকল্প", snap_likely: "সম্ভবত যোগ্য", snap_deadlines: "শেষ তারিখ", snap_actions: "পরবর্তী পদক্ষেপ", snap_empty: "আপনার সুবিধার সারসংক্ষেপ তৈরি করতে একটি প্রশ্ন করুন।", snap_reports: "প্রতিবেদন",
  src_title: "যাচাইকৃত সূত্র", src_sub: "আপনার উত্তরের জন্য লাইভ পড়া সরকারি পৃষ্ঠা", src_official: "সরকারি ওয়েবসাইট", src_other: "অন্য সূত্র", src_empty: "প্রথম প্রশ্নের পরে সূত্র এখানে দেখা যাবে।", src_read_live: "লাইভ পড়া", src_seen: "শেষ পড়া",
  role_citizen: "নাগরিক", role_operator: "অপারেটর", role_switch_operator: "অপারেটর ভিউ", role_switch_citizen: "নাগরিক ভিউ", role_needed: "অপারেটর অ্যাক্সেস প্রয়োজন", role_needed_body: "ব্যবহার, ওয়ালেট এবং পরিকাঠামো সেটিংস শুধুমাত্র অপারেটরদের জন্য।",
  tab_integrations: "ইন্টিগ্রেশন", tab_usage: "ব্যবহার ও পরিকাঠামো", run_log: "রান লগ", live_sources: "লাইভ", error_generic: "কিছু ভুল হয়েছে", try_again: "আবার চেষ্টা করুন", lang_label: "ভাষা",
};

const gu: Table = {
  nav_journey: "સહાયક", nav_network: "નેટવર્ક", nav_logs: "એજન્ટ લૉગ", nav_wallet: "વૉલેટ", nav_sectors: "ક્ષેત્રો",
  journey_title: "તમારી સહાયક યાત્રા", journey_sub: "એક વાર પૂછો — લોકમિત્ર સત્તાવાર પોર્ટલ શોધી અત્યારે વાંચે છે અને તમારી ભાષામાં સમજાવે છે.",
  idle_title: "નમસ્તે આજે હું તમારી કેવી રીતે મદદ કરું?", idle_sub: "PM-KISAN, આયુષ્માન, શિષ્યવૃત્તિ, રેશન, પેન્શન, જમીન રેકર્ડ અથવા બજાર ભાવ વિશે બોલીને અથવા લખીને પૂછો.",
  ask_placeholder: "તમારો પ્રશ્ન લખો અથવા બોલો…", ask_btn: "પૂછો", mic_start: "બોલો", mic_stop: "રોકો", mic_unsupported: "આ બ્રાઉઝરમાં અવાજ ઇનપુટ ઉપલબ્ધ નથી", new_q: "નવો પ્રશ્ન", cancel: "રદ કરો",
  st_listen: "પ્રશ્ન", st_understand: "સમજવું", st_search: "પોર્ટલ શોધવું", st_fetch: "પેજ વાંચવા", st_agent: "લાઇવ એજન્ટ", st_report: "અહેવાલ",
  chip_idle: "તૈયાર", chip_working: "કામ ચાલુ", chip_waiting: "તમારી રાહ", chip_done: "પૂર્ણ", chip_error: "સમસ્યા",
  task_title: "લાઇવ તપાસ માટે વિગત જોઈએ", task_body: "TinyFish એજન્ટ {host} ખોલીને તમારી {scheme} સ્થિતિ વાંચવા તૈયાર છે. નીચે વિગત લખો, તરત શરૂ થશે. તે કશું સબમિટ કરતું નથી.",
  task_otp_note: "આ પોર્ટલ તમારા નોંધાયેલા મોબાઇલ પર OTP મોકલી શકે છે.", task_run: "લાઇવ તપાસ શરૂ કરો", task_diy: "જાતે કરું", task_fields: "જરૂરી વિગતો",
  task_cost: "અત્યાર સુધીનો લાઇવ ખર્ચ {cost} · {steps} પગલાં", video_rec: "રેકોર્ડિંગ જુઓ",
  otp_title: "આ પોર્ટલને OTP જોઈએ", otp_body: "સુરક્ષિત બ્રાઉઝરમાં તમારા OTPથી લૉગ ઇન કરો. પછી એજન્ટ એ જ સત્ર ફરી વાપરે છે — બીજું લૉગિન નહીં.", otp_start: "OTPથી લૉગ ઇન", otp_saved: "લૉગિન સાચવ્યું — તમારા સત્રથી તપાસ ફરી ચાલે છે.",
  agent_running: "એજન્ટ {host} પર કામ કરે છે…", agent_done: "લાઇવ તપાસ પૂર્ણ", agent_failed: "એજન્ટ પૂર્ણ કરી શક્યું નહીં", agent_blocked_otp: "પોર્ટલે OTP માગ્યો", watch_live: "લાઇવ જુઓ", steps: "પગલાં",
  speak: "સાંભળો", speak_stop: "રોકો", collapse: "નાનું કરો", expand: "મોટું કરો", show_report: "અહેવાલ બતાવો", english: "અંગ્રેજી",
  snap_title: "લાભ સારાંશ", snap_sub: "આ સત્રમાં લોકમિત્રને તમારા માટે જે મળ્યું", snap_schemes: "તપાસેલી યોજનાઓ", snap_likely: "સંભવતઃ પાત્ર", snap_deadlines: "છેલ્લી તારીખો", snap_actions: "આગળનાં પગલાં", snap_empty: "તમારો લાભ સારાંશ બનાવવા પ્રશ્ન પૂછો.", snap_reports: "અહેવાલ",
  src_title: "ચકાસેલા સ્ત્રોત", src_sub: "તમારા જવાબો માટે લાઇવ વાંચેલાં સત્તાવાર પેજ", src_official: "સત્તાવાર સરકારી સાઇટ", src_other: "અન્ય સ્ત્રોત", src_empty: "પહેલા પ્રશ્ન પછી સ્ત્રોત અહીં દેખાશે.", src_read_live: "લાઇવ વાંચ્યું", src_seen: "છેલ્લે વાંચ્યું",
  role_citizen: "નાગરિક", role_operator: "ઓપરેટર", role_switch_operator: "ઓપરેટર દૃશ્ય", role_switch_citizen: "નાગરિક દૃશ્ય", role_needed: "ઓપરેટર ઍક્સેસ જરૂરી", role_needed_body: "ઉપયોગ, વૉલેટ અને ઇન્ફ્રાસ્ટ્રક્ચર સેટિંગ્સ ફક્ત ઓપરેટરોને દેખાય છે.",
  tab_integrations: "ઇન્ટિગ્રેશન", tab_usage: "ઉપયોગ અને ઇન્ફ્રાસ્ટ્રક્ચર", run_log: "રન લૉગ", live_sources: "લાઇવ", error_generic: "કંઈક ખોટું થયું", try_again: "ફરી પ્રયાસ કરો", lang_label: "ભાષા",
};

export const UI_STRINGS: Record<UiLang, Table> = { en, hi, mr, ta, te, bn, gu };
export const UI_KEYS = Object.keys(en) as UiKey[];

const DEVANAGARI_FALLBACK = new Set(["ne", "kok", "mai", "doi", "sa", "brx"]);

/** Which offline table serves a language (exact → Devanagari→Hindi → Assamese→Bengali → English). */
export function uiLang(lang: string | null | undefined): UiLang {
  const l = String(lang ?? "en");
  if ((UI_LANGS as readonly string[]).includes(l)) return l as UiLang;
  if (DEVANAGARI_FALLBACK.has(l)) return "hi";
  if (l === "as") return "bn";
  return "en";
}

export function hasNativeUi(lang: string | null | undefined) {
  return (UI_LANGS as readonly string[]).includes(String(lang ?? ""));
}

/** Fill {placeholders}. */
export function fmt(s: string, vars?: Record<string, string | number | null | undefined>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined || vars[k] === null ? "" : String(vars[k])));
}

/** Offline translation of one UI key. */
export function ui(key: UiKey, lang: string | null | undefined, vars?: Record<string, string | number | null | undefined>) {
  return fmt(UI_STRINGS[uiLang(lang)][key] ?? en[key] ?? key, vars);
}
