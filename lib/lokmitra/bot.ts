import "server-only";
import { cfg } from "./config";
import { runConfirmed, type FlowEvent } from "./agentflow";
import { reportEmailHtml, sendEmail } from "./email";
import { transcribe } from "./groq";
import { langByCode, LANGUAGES } from "./languages";
import { ask, getReport, type AskResult } from "./pipeline";
import { relayAct, relayCancel, relaySave, startRelay, type RelayView } from "./relay";
import { schemeById, SCHEMES, stateByCode, STATES } from "./schemes";
import { ensureSentinel, listSentinels, subscribe } from "./sentinel";
import { getUser, sessions, upsertUser } from "./store";
import { tgAnswer, tgFile, tgPhoto, tgSend, tgTyping, type InlineKb } from "./telegram";
import { clip, mask } from "./util";

/**
 * Telegram channel (primary): text + voice notes, inline keyboards for common intents,
 * the confirmation gate for paid Agent runs, field collection, OTP relay, alerts, e-mail.
 */

interface TgUpdate {
  update_id: number;
  message?: { message_id: number; chat: { id: number; type: string }; from?: { id: number; first_name?: string; language_code?: string }; text?: string; voice?: { file_id: string; duration: number }; audio?: { file_id: string } };
  callback_query?: { id: string; data?: string; from: { id: number; first_name?: string }; message?: { chat: { id: number } } };
}

interface TgState extends Record<string, unknown> {
  mode: "idle" | "collect" | "relay";
  confirm_id?: string;
  pending?: { key: string; label: string }[];
  values?: Record<string, string>;
  relay_id?: string;
  retry_confirm_id?: string;
}

const stKey = (chat: string) => `tg_state_${chat}`.slice(0, 128);
async function getState(chat: string): Promise<TgState> {
  return ((await sessions.get<TgState>(stKey(chat)))?.data as TgState) ?? { mode: "idle" };
}
async function setState(chat: string, s: TgState, userId: string) {
  await sessions.put("tg_state", s, 1800, { id: stKey(chat), user_id: userId });
}

const QUICK: InlineKb = [
  [{ text: "🌾 PM-Kisan status", callback_data: "q:pmkisan" }, { text: "🏥 Ayushman check", callback_data: "q:ayushman" }],
  [{ text: "📋 Schemes for me", callback_data: "q:schemes" }, { text: "💰 Mandi bhaav", callback_data: "q:mandi" }],
  [{ text: "🎓 Scholarship", callback_data: "q:nsp" }, { text: "🗺 Land record", callback_data: "q:land" }],
];
const QUICK_TEXT: Record<string, string> = {
  pmkisan: "Mera PM-KISAN status check karna hai",
  ayushman: "Kya main Ayushman Bharat ke liye eligible hoon?",
  schemes: "Mere liye kaun si sarkari yojana hai?",
  mandi: "Aaj gehu ka mandi bhaav kya hai?",
  nsp: "National scholarship ki last date aur eligibility batao",
  land: "Mujhe apna land record (khatauni) dekhna hai",
};

const HELP = `<b>LokMitra 🙏</b> — your free sarkari-yojana helper.
• Type or send a <b>voice note</b> in any Indian language.
• Ask about PM-KISAN, Ayushman, e-Shram, scholarships, ration, pension, land records, mandi prices…
• Personal status checks need your consent — I always show the cost first and never submit anything.
Commands: /lang hi|mr|ta|te|bn|gu… · /state MH · /alerts · /email you@example.com · /help`;

export async function handleUpdate(u: TgUpdate) {
  if (u.callback_query) return onCallback(u.callback_query);
  const m = u.message;
  if (!m) return;
  const chat = String(m.chat.id);
  const userId = `tg:${chat}`;
  const user = (await getUser(userId)) ?? (await upsertUser({ id: userId, channel: "telegram", display_name: m.from?.first_name ?? null, language: guessTgLang(m.from?.language_code) }));
  let text = (m.text ?? "").trim();

  if (!text && (m.voice || m.audio)) {
    await tgTyping(chat);
    const f = await tgFile((m.voice ?? m.audio)!.file_id).catch(() => null);
    const tr = f ? await transcribe(f.blob, f.name, user.language) : null;
    if (!tr) return tgSend(chat, "🎙 Sorry, I could not understand the voice note. Please type your question (voice needs GROQ_API_KEY).");
    text = tr;
    await tgSend(chat, `🎙 <i>${clip(tr, 400).replace(/</g, "&lt;")}</i>`, { html: true });
  }
  if (!text) return;

  if (text.startsWith("/")) return onCommand(chat, userId, text, user.language);

  const st = await getState(chat);
  if (st.mode === "collect" && st.pending?.length) return onCollect(chat, userId, st, text);
  if (st.mode === "relay" && st.relay_id) return onRelayText(chat, userId, st, text);

  return runAsk(chat, userId, text, user.language);
}

function guessTgLang(code?: string) {
  const c = (code ?? "").slice(0, 2);
  return LANGUAGES.some((l) => l.code === c) ? c : "hi";
}

async function onCommand(chat: string, userId: string, text: string, lang: string) {
  const [cmd, ...rest] = text.split(/\s+/);
  const arg = rest.join(" ").trim();
  switch (cmd.replace(/@.*$/, "").toLowerCase()) {
    case "/start":
      await upsertUser({ id: userId, channel: "telegram", consent_at: new Date().toISOString() });
      return tgSend(chat, HELP, { html: true, keyboard: QUICK });
    case "/help":
      return tgSend(chat, HELP, { html: true, keyboard: QUICK });
    case "/lang": {
      const l = LANGUAGES.find((x) => x.code === arg.toLowerCase() || x.name.toLowerCase() === arg.toLowerCase());
      if (!l) return tgSend(chat, `Languages: ${LANGUAGES.map((x) => `${x.code}=${x.native}`).join(", ")}\nExample: /lang mr`);
      await upsertUser({ id: userId, channel: "telegram", language: l.code });
      return tgSend(chat, `✅ ${l.native} (${l.name})`);
    }
    case "/state": {
      const s = STATES.find((x) => x.code === arg.toUpperCase() || x.name.toLowerCase() === arg.toLowerCase());
      if (!s) return tgSend(chat, `States: ${STATES.map((x) => x.code).join(" ")}\nExample: /state MH`);
      await upsertUser({ id: userId, channel: "telegram", state_code: s.code });
      return tgSend(chat, `✅ ${s.name} (${s.hindi})`);
    }
    case "/email": {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(arg)) return tgSend(chat, "Usage: /email you@example.com — I will e-mail your last Citizen Benefit Report.");
      await upsertUser({ id: userId, channel: "telegram", email: arg });
      const chatS = await sessions.get<{ report_id?: string }>(`chat_${userId}`.slice(0, 128));
      const rep = chatS?.data.report_id ? ((await getReport(chatS.data.report_id)) as Record<string, unknown> | null) : null;
      if (!rep) return tgSend(chat, "✅ E-mail saved. Ask a question first, then send /email again.");
      const r = await sendEmail({ to: arg, subject: "LokMitra · Citizen Benefit Report", html: reportEmailHtml({ summary_local: String(rep.summary_local ?? ""), summary_en: String(rep.summary_en ?? ""), language: String(rep.language ?? "en"), sources: (rep.sources as string[]) ?? [], report_id: String(rep.id), link: cfg.publicBaseUrl() ? `${cfg.publicBaseUrl()}/report/${rep.id}` : undefined }) });
      return tgSend(chat, r.id ? `📧 Sent to ${arg}` : `⚠ E-mail failed: ${r.error}`);
    }
    case "/alerts": {
      const sent = await listSentinels();
      const user = await getUser(userId);
      const mine = sent.filter((s) => s.state_code === "IN" || s.state_code === user?.state_code).slice(0, 8);
      const kb: InlineKb = mine.map((s) => [{ text: `🔔 ${schemeById(s.scheme_id)?.name ?? s.scheme_id} · ${s.state_code} · ${s.kind}`, callback_data: `sub:${s.monitor_id}`.slice(0, 64) }]);
      kb.push([{ text: "➕ PMFBY deadline (my state)", callback_data: `mk:pmfby:deadline` }], [{ text: "➕ NSP scholarship deadline", callback_data: `mk:nsp:deadline` }]);
      return tgSend(chat, mine.length ? "Choose alerts to subscribe:" : "No sentinels yet in your state — create one:", { keyboard: kb });
    }
    default:
      return tgSend(chat, HELP, { html: true, keyboard: QUICK });
  }
  void lang;
}

async function runAsk(chat: string, userId: string, text: string, lang: string) {
  await tgTyping(chat);
  await tgSend(chat, "🔎 LokMitra is checking official portals…");
  let res: AskResult;
  try {
    res = await ask({ text, user_id: userId, channel: "telegram", language: lang });
  } catch (e) {
    return tgSend(chat, `⚠ ${(e as Error).message}`);
  }
  const hits = res.cache_hits;
  const footer = `\n\n<i>⚡ ${hits}/${res.sections.length} served from LokMitra cache (free) · ${Math.round(res.elapsed_ms / 100) / 10}s · $0.00</i>`;
  const kb: InlineKb = [];
  for (const s of res.sections) if (s.confirm) kb.push([{ text: `✅ Check my ${s.scheme_name} (~${s.confirm.est_steps} steps ≈ $${s.confirm.est_cost_usd})`, callback_data: `cf:${s.confirm.confirm_id}`.slice(0, 64) }]);
  if (kb.length) kb.push([{ text: "❌ Not now", callback_data: "cx" }]);
  if (cfg.publicBaseUrl()) kb.push([{ text: "🖨 Printable slip + QR", url: `${cfg.publicBaseUrl()}/report/${res.report_id}` }]);
  await tgSend(chat, (await import("./telegram")).mdToTg(res.summary_local) + footer, { html: true, keyboard: kb.length ? kb : undefined });
}

async function onCallback(cb: NonNullable<TgUpdate["callback_query"]>) {
  const chat = String(cb.message?.chat.id ?? cb.from.id);
  const userId = `tg:${chat}`;
  const data = cb.data ?? "";
  await tgAnswer(cb.id);
  if (data.startsWith("q:")) {
    const user = await getUser(userId);
    return runAsk(chat, userId, QUICK_TEXT[data.slice(2)] ?? "schemes for me", user?.language ?? "hi");
  }
  if (data === "cx") {
    await setState(chat, { mode: "idle" }, userId);
    return tgSend(chat, "👍 OK. No paid check was run.");
  }
  if (data.startsWith("cf:")) return startConfirmed(chat, userId, data.slice(3));
  if (data.startsWith("sub:")) {
    await subscribe({ monitor_id: data.slice(4), user_id: userId, channel: "telegram" }).catch((e) => tgSend(chat, `⚠ ${(e as Error).message}`));
    return tgSend(chat, "🔔 Subscribed. I will message you when the official page changes.");
  }
  if (data.startsWith("mk:")) {
    const [, scheme, kind] = data.split(":");
    const user = await getUser(userId);
    try {
      const r = await ensureSentinel({ scheme_id: scheme, state_code: user?.state_code ?? "IN", kind: kind as "deadline" });
      await subscribe({ monitor_id: r.sentinel.monitor_id, user_id: userId, channel: "telegram" });
      return tgSend(chat, `🔔 ${r.created ? "Sentinel created and" : ""} subscribed: ${schemeById(scheme)?.name} ${kind}.`);
    } catch (e) {
      return tgSend(chat, `⚠ ${(e as Error).message}`);
    }
  }
  const st = await getState(chat);
  if (data === "rl:save" && st.relay_id) return relayFinish(chat, userId, st);
  if (data === "rl:x" && st.relay_id) {
    await relayCancel(st.relay_id).catch(() => null);
    await setState(chat, { mode: "idle" }, userId);
    return tgSend(chat, "🗑 OTP session cancelled and the temporary browser profile deleted.");
  }
  if (data === "rl:go") {
    if (!st.retry_confirm_id) return tgSend(chat, "Session expired — please ask again.");
    try {
      const v = await startRelay({ confirm_id: st.retry_confirm_id, user_id: userId });
      await setState(chat, { ...st, mode: "relay", relay_id: v.relay_id }, userId);
      return sendRelayView(chat, v);
    } catch (e) {
      return tgSend(chat, `⚠ Could not open the portal: ${(e as Error).message}`);
    }
  }
}

async function startConfirmed(chat: string, userId: string, confirmId: string) {
  const c = await sessions.get<{ scheme_id: string; task: "status" | "land"; sealed: string }>(confirmId);
  if (!c) return tgSend(chat, "⌛ This confirmation expired. Please ask again.");
  const { unseal } = await import("./util");
  const have = unseal<Record<string, string>>(c.data.sealed) ?? {};
  const scheme = schemeById(c.data.scheme_id)!;
  const fields = c.data.task === "land" ? [{ key: "district", label: "District" }, { key: "tehsil", label: "Tehsil / Taluka" }, { key: "village", label: "Village" }, { key: "khasra_no", label: "Khasra / Survey / Gat number" }] : scheme.statusIdentifiers ?? [{ key: "reg_no", label: "Registration number" }];
  const pending = fields.filter((f) => !have[f.key]).map((f) => ({ key: f.key, label: f.label }));
  if (pending.length) {
    await setState(chat, { mode: "collect", confirm_id: confirmId, pending, values: {} }, userId);
    return tgSend(chat, `🔐 Please send your <b>${pending[0].label}</b>.\n<i>Used once for this check only; masked in logs.</i>`, { html: true });
  }
  return executeConfirmed(chat, userId, confirmId, {});
}

async function onCollect(chat: string, userId: string, st: TgState, text: string) {
  const [cur, ...rest] = st.pending!;
  const values = { ...(st.values ?? {}), [cur.key]: text.slice(0, 80) };
  if (rest.length) {
    await setState(chat, { ...st, pending: rest, values }, userId);
    return tgSend(chat, `✓ ${cur.label}: ${mask(text)}\nNow send your <b>${rest[0].label}</b>.`, { html: true });
  }
  await setState(chat, { mode: "idle" }, userId);
  return executeConfirmed(chat, userId, st.confirm_id!, values);
}

async function executeConfirmed(chat: string, userId: string, confirmId: string, ids: Record<string, string>, relayId?: string) {
  await tgSend(chat, "🐟 TinyFish agent is starting on the official portal…");
  let liveSent = false;
  let final: Record<string, unknown> | null = null;
  const gen = runConfirmed({ confirm_id: confirmId, identifiers: ids, relay_id: relayId ?? null });
  while (true) {
    const n = await gen.next();
    if (n.done) break;
    const e = n.value as FlowEvent;
    if (e.type === "STREAMING_URL" && !liveSent && typeof e.streaming_url === "string") {
      liveSent = true;
      await tgSend(chat, "👀 Watch the agent navigate live:", { keyboard: [[{ text: "▶ Live browser", url: e.streaming_url }]] });
    }
    if (e.type === "LM_ERROR") return tgSend(chat, `⚠ ${e.error}\n\nDo it yourself:\n${((e.fallback as string[]) ?? []).map((x) => `• ${x}`).join("\n")}`);
    if (e.type === "LM_RESULT") final = e as Record<string, unknown>;
  }
  if (!final) return tgSend(chat, "⚠ The agent did not return a result.");
  const r = (final.result as Record<string, unknown>) ?? {};
  const lines = [`<b>${final.scheme_name}</b> — ${final.status}`];
  for (const k of ["registration_status", "ekyc_status", "land_seeding", "aadhaar_bank_linked", "khasra_or_survey_no", "area", "land_type", "raw_message"]) if (r[k]) lines.push(`• ${k.replace(/_/g, " ")}: ${String(r[k]).replace(/</g, "&lt;")}`);
  const inst = Array.isArray(r.installments) ? (r.installments as Record<string, string>[]) : [];
  inst.slice(0, 8).forEach((i) => lines.push(`• ${i.label}: ${i.amount ?? ""} ${i.date ?? ""} ${i.status ?? ""}`));
  const owners = Array.isArray(r.owner_names) ? (r.owner_names as string[]) : [];
  if (owners.length) lines.push(`• owners: ${owners.slice(0, 5).join(", ")}`);
  const pend = Array.isArray(r.pending_actions) ? (r.pending_actions as string[]) : [];
  pend.slice(0, 4).forEach((p) => lines.push(`➡ ${p}`));
  lines.push(`\n<i>${final.steps} steps · $${Number(final.cost_usd).toFixed(3)} · run ${String(final.run_id ?? "").slice(0, 8)}</i>`);
  const user = await getUser(userId);
  let msg = lines.join("\n");
  if (user && user.language !== "en") {
    const { translate } = await import("./groq");
    msg = (await translate(msg, user.language, { purpose: "translate_status" })).text;
  }
  const kb: InlineKb = [];
  if (final.needs_otp && final.retry_confirm_id) {
    await setState(chat, { mode: "idle", retry_confirm_id: String(final.retry_confirm_id) }, userId);
    kb.push([{ text: "🔐 Log in with OTP (I relay it)", callback_data: "rl:go" }]);
    msg += "\n\nThis portal needs an OTP sent to your registered mobile.";
  }
  await tgSend(chat, msg, { html: true, keyboard: kb.length ? kb : undefined });
}

async function sendRelayView(chat: string, v: RelayView) {
  const need = v.snapshot?.fields.filter((f) => f.kind === "captcha" || f.kind === "otp").map((f) => f.label) ?? [];
  const caption = `${v.scheme_name} — official page opened in a secure TinyFish browser.\n${v.autofilled?.length ? `Pre-filled: ${v.autofilled.join(", ")}\n` : ""}${need.length ? `Reply with the ${need.join(" / ")} shown / sent to your phone.` : "Reply with the OTP when you receive it."}\nWhen you see you are logged in, tap ✅.`;
  const kb: InlineKb = [[{ text: "✅ I'm logged in — save & check", callback_data: "rl:save" }], [{ text: "❌ Cancel", callback_data: "rl:x" }]];
  if (v.snapshot?.screenshot) await tgPhoto(chat, v.snapshot.screenshot, caption, kb).catch(() => tgSend(chat, caption, { keyboard: kb }));
  else await tgSend(chat, `${caption}${v.error ? `\n⚠ ${v.error}` : ""}`, { keyboard: kb });
}

/** Citizen typed CAPTCHA / OTP text → fill the first empty matching field and press the primary button. */
async function onRelayText(chat: string, userId: string, st: TgState, text: string) {
  try {
    const cur = await relayAct(st.relay_id!, [{ op: "scan" }]);
    const fields = cur.snapshot?.fields ?? [];
    const target = fields.find((f) => (f.kind === "otp" || f.kind === "captcha") && !f.value) ?? fields.find((f) => f.kind === "text" && !f.value);
    const btn = fields.find((f) => f.kind === "button" && /otp|verify|submit|search|get|login|sign|proceed|continue|data/i.test(f.label));
    if (!target) return tgSend(chat, "I could not find an empty CAPTCHA/OTP box. Tap ✅ if you are logged in, or ❌ to cancel.");
    const actions: Parameters<typeof relayAct>[1] = [{ op: "fill", idx: target.idx, value: text.trim() }];
    if (btn) actions.push({ op: "click", idx: btn.idx });
    const v = await relayAct(st.relay_id!, actions);
    return sendRelayView(chat, v);
  } catch (e) {
    return tgSend(chat, `⚠ ${(e as Error).message}`);
  }
}

async function relayFinish(chat: string, userId: string, st: TgState) {
  try {
    const saved = await relaySave(st.relay_id!);
    await tgSend(chat, `🔐 Session saved (${saved.cookie_count} cookies, ${saved.domains.join(", ") || "portal"}). Running your status check without a second login…`);
    await setState(chat, { mode: "idle" }, userId);
    if (st.retry_confirm_id) return executeConfirmed(chat, userId, st.retry_confirm_id, {}, st.relay_id);
  } catch (e) {
    return tgSend(chat, `⚠ ${(e as Error).message}`);
  }
}

export function botInfo() {
  return { configured: !!cfg.telegramToken(), username: cfg.telegramBotName() || null, schemes: SCHEMES.length, states: STATES.length, languages: LANGUAGES.length, default_language: langByCode("hi").native, sample_state: stateByCode("MH").name };
}
