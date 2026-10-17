import { after } from "next/server";
import { handleUpdate } from "@/lib/lokmitra/bot";
import { cfg } from "@/lib/lokmitra/config";
import { json } from "@/lib/lokmitra/http";
import { sessions } from "@/lib/lokmitra/store";
import { safeEqual } from "@/lib/lokmitra/util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/telegram/webhook — Telegram Bot API update receiver.
 * Verifies X-Telegram-Bot-Api-Secret-Token, de-duplicates update_id (Telegram retries),
 * acknowledges immediately and processes the update after the response (next/server `after`)
 * so long Agent runs never trigger Telegram's redelivery.
 */
export async function POST(req: Request) {
  if (!cfg.telegramToken()) return json({ error: { code: "NOT_CONFIGURED", message: "TELEGRAM_BOT_TOKEN not set" } }, 503);
  const secret = cfg.telegramSecret();
  if (secret && !safeEqual(req.headers.get("x-telegram-bot-api-secret-token") ?? "", secret)) return json({ error: { code: "FORBIDDEN", message: "bad secret token" } }, 403);
  const update = (await req.json().catch(() => null)) as { update_id?: number } | null;
  if (!update || typeof update.update_id !== "number") return json({ ok: true, ignored: true });
  const dedupe = `tgupd_${update.update_id}`;
  if (await sessions.get(dedupe)) return json({ ok: true, duplicate: true });
  await sessions.put("tg_state", { seen: true }, 3600, { id: dedupe }).catch(() => null);
  after(async () => {
    try {
      await handleUpdate(update as Parameters<typeof handleUpdate>[0]);
    } catch (e) {
      console.error("[telegram] update failed:", (e as Error).message);
    }
  });
  return json({ ok: true });
}
