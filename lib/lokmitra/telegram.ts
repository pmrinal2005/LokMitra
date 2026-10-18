import "server-only";
import { cfg } from "./config";
import { logRun } from "./store";
import { AsyncLocalStorage } from "node:async_hooks";

/* ------------------------------------------------------------------ */
/* Bot Simulator sink — when a simulation scope is active every Bot API */
/* call is recorded and answered locally (no token, no network), so the */
/* /bot-simulator page exercises the REAL bot.ts flows end-to-end.       */
/* ------------------------------------------------------------------ */
export interface SimCall {
  method: string;
  at: string;
  text?: string;
  keyboard?: InlineKb;
  photo?: string | null;
  caption?: string;
  callback_text?: string;
}
const simStore = new AsyncLocalStorage<{ calls: SimCall[]; msgId: number; base?: string }>();
export function withSimulator<T>(fn: () => Promise<T>, base?: string): Promise<{ result: T; calls: SimCall[] }> {
  const ctx = { calls: [] as SimCall[], msgId: 1000, base };
  return simStore.run(ctx, async () => ({ result: await fn(), calls: ctx.calls }));
}
export const inSimulator = () => !!simStore.getStore();
/** Public base URL for links the bot sends: PUBLIC_BASE_URL (or Vercel URL), else the simulator's request origin. */
export const botBaseUrl = () => cfg.publicBaseUrl() || simStore.getStore()?.base || "";

async function simAnswer(method: string, body: Record<string, unknown> | FormData): Promise<unknown> {
  const ctx = simStore.getStore()!;
  const get = (k: string) => (body instanceof FormData ? (body.get(k) as unknown) : body[k]);
  const at = new Date().toISOString();
  if (method === "sendMessage") {
    const rm = get("reply_markup") as { inline_keyboard?: InlineKb } | string | undefined;
    const kb = typeof rm === "string" ? (JSON.parse(rm) as { inline_keyboard?: InlineKb }).inline_keyboard : rm?.inline_keyboard;
    ctx.calls.push({ method, at, text: String(get("text") ?? ""), keyboard: kb });
    return { message_id: ++ctx.msgId };
  }
  if (method === "sendPhoto") {
    const rm = get("reply_markup");
    const photo = get("photo");
    let dataUrl: string | null = null;
    if (photo instanceof Blob) dataUrl = `data:${photo.type || "image/jpeg"};base64,${Buffer.from(await photo.arrayBuffer()).toString("base64")}`;
    ctx.calls.push({ method, at, caption: String(get("caption") ?? ""), photo: dataUrl, keyboard: typeof rm === "string" ? JSON.parse(rm).inline_keyboard : undefined });
    return { message_id: ++ctx.msgId };
  }
  if (method === "answerCallbackQuery") {
    ctx.calls.push({ method, at, callback_text: String(get("text") ?? "") });
    return true;
  }
  if (method === "sendChatAction") {
    ctx.calls.push({ method, at, text: String(get("action") ?? "typing") });
    return true;
  }
  if (method === "getFile") throw new Error("voice notes are not available in the simulator — type your question");
  ctx.calls.push({ method, at });
  return true;
}

/** Thin Telegram Bot API client (no SDK). */
export async function tg<T = unknown>(method: string, body: Record<string, unknown> | FormData, timeoutMs = 20_000): Promise<T> {
  if (simStore.getStore()) return (await simAnswer(method, body)) as T;
  const token = cfg.telegramToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.telegramApiBase()}/bot${token}/${method}`, {
      method: "POST",
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!j.ok) throw new Error(`telegram ${method}: ${j.description ?? res.status}`);
    return j.result as T;
  } finally {
    clearTimeout(t);
  }
}

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Markdown-ish (LLM output) → Telegram HTML subset. */
export function mdToTg(md: string) {
  return esc(md)
    .replace(/^#{1,4}\s+(.*)$/gm, "<b>$1</b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

export function chunks(s: string, n = 3800) {
  const out: string[] = [];
  let cur = "";
  for (const para of s.split(/\n/)) {
    if ((cur + "\n" + para).length > n) {
      if (cur) out.push(cur);
      cur = para.slice(0, n);
    } else cur = cur ? `${cur}\n${para}` : para;
  }
  if (cur) out.push(cur);
  return out;
}

export type InlineKb = { text: string; callback_data?: string; url?: string }[][];

export async function tgSend(chatId: string | number, text: string, opts: { html?: boolean; keyboard?: InlineKb; md?: boolean } = {}) {
  const body = opts.md ? mdToTg(text) : opts.html ? text : esc(text);
  const parts = chunks(body);
  let last: unknown = null;
  for (let i = 0; i < parts.length; i++) {
    last = await tg("sendMessage", {
      chat_id: chatId,
      text: parts[i],
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(opts.keyboard && i === parts.length - 1 ? { reply_markup: { inline_keyboard: opts.keyboard } } : {}),
    }).catch(async (e) => {
      // fall back to plain text if Telegram rejects our HTML
      if (/can't parse entities/i.test((e as Error).message)) return tg("sendMessage", { chat_id: chatId, text: parts[i].replace(/<[^>]+>/g, ""), disable_web_page_preview: true });
      throw e;
    });
  }
  void logRun({ surface: "telegram", purpose: inSimulator() ? "simulator_send" : "send", meta: { parts: parts.length } });
  return last;
}

export async function tgPhoto(chatId: string | number, dataUrl: string, caption?: string, keyboard?: InlineKb) {
  const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) return null;
  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  fd.append("photo", new Blob([Buffer.from(m[2], "base64")], { type: m[1] }), "screen.jpg");
  if (caption) fd.append("caption", caption.slice(0, 1000));
  if (keyboard) fd.append("reply_markup", JSON.stringify({ inline_keyboard: keyboard }));
  return tg("sendPhoto", fd, 30_000);
}

export async function tgTyping(chatId: string | number) {
  await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => null);
}

export async function tgAnswer(callbackId: string, text?: string) {
  await tg("answerCallbackQuery", { callback_query_id: callbackId, text: text?.slice(0, 190) }).catch(() => null);
}

/** Download a voice note / audio file sent to the bot. */
export async function tgFile(fileId: string): Promise<{ blob: Blob; name: string } | null> {
  const f = await tg<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!f.file_path) return null;
  const res = await fetch(`${cfg.telegramApiBase()}/file/bot${cfg.telegramToken()}/${f.file_path}`, { cache: "no-store" });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 20 * 1024 * 1024) return null;
  const name = f.file_path.split("/").pop() || "voice.ogg";
  return { blob: new Blob([buf], { type: name.endsWith(".oga") || name.endsWith(".ogg") ? "audio/ogg" : "application/octet-stream" }), name: name.replace(/\.oga$/, ".ogg") };
}

export async function setWebhook(url: string) {
  return tg("setWebhook", { url, secret_token: cfg.telegramSecret() || undefined, allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
}
export async function webhookInfo() {
  return tg("getWebhookInfo", {});
}
export async function setCommands() {
  return tg("setMyCommands", {
    commands: [
      { command: "start", description: "Start / नमस्ते" },
      { command: "lang", description: "Change language (e.g. /lang mr)" },
      { command: "state", description: "Set your state (e.g. /state MH)" },
      { command: "alerts", description: "Deadline & circular alerts" },
      { command: "report", description: "My last Citizen Benefit Report" },
      { command: "email", description: "E-mail my last report" },
      { command: "help", description: "How to use LokMitra" },
    ],
  });
}
