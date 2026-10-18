import { isAdmin } from "@/lib/lokmitra/auth";
import { handleUpdate } from "@/lib/lokmitra/bot";
import { cfg } from "@/lib/lokmitra/config";
import { bad, body, err, json, originOf } from "@/lib/lokmitra/http";
import { rateLimit } from "@/lib/lokmitra/store";
import { withSimulator } from "@/lib/lokmitra/telegram";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Callback prefixes that spend Wallet credits (Agent run, OTP relay browser, Monitor create). */
const PAID = /^(cf:|rl:go|rl:save|mk:)/;

/**
 * POST /api/lokmitra/simulator { chat_id, text? | callback_data?, first_name?, language_code? }
 * Drives the REAL Telegram bot (lib/lokmitra/bot.ts → pipeline → TinyFish) with a synthetic
 * update and returns every Bot API call the bot made (sendMessage / sendPhoto / answerCallback…),
 * captured by the simulator sink — no TELEGRAM_BOT_TOKEN needed, nothing is sent to Telegram.
 * Paid callbacks require the operator token (same as the dashboard's paid actions).
 */
export async function POST(req: Request) {
  const b = await body<{ chat_id?: string; text?: string; callback_data?: string; first_name?: string; language_code?: string }>(req);
  const chat = String(b.chat_id ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  if (!chat) return bad("chat_id required");
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 1500) : "";
  const cbd = typeof b.callback_data === "string" ? b.callback_data.slice(0, 64) : "";
  if (!text && !cbd) return bad("text or callback_data required");
  if (cbd && PAID.test(cbd) && !isAdmin(req)) return err(Object.assign(new Error("This button spends TinyFish Wallet credits — set the operator token in Settings first."), { status: 401 }));
  const rl = await rateLimit(`sim:${chat}`, 1);
  if (!rl.ok) return err(Object.assign(new Error("simulator rate limit reached, try later"), { status: 429 }));

  const chatId = `sim${chat}`;
  const from = { id: 0, first_name: b.first_name?.slice(0, 40) || "Simulator", language_code: b.language_code?.slice(0, 5) || "hi" };
  const update = cbd
    ? { update_id: Date.now(), callback_query: { id: `cb${Date.now()}`, data: cbd, from, message: { chat: { id: chatId as unknown as number } } } }
    : { update_id: Date.now(), message: { message_id: Date.now() % 1e6, chat: { id: chatId as unknown as number, type: "private" }, from, text } };
  const t0 = Date.now();
  try {
    const { calls } = await withSimulator(() => handleUpdate(update as Parameters<typeof handleUpdate>[0]), originOf(req));
    return json({ ok: true, chat_id: chatId, elapsed_ms: Date.now() - t0, calls, telegram_configured: !!cfg.telegramToken(), base_url: cfg.publicBaseUrl() || null });
  } catch (e) {
    return err(e);
  }
}
