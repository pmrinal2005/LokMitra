import { requireAdmin } from "@/lib/lokmitra/auth";
import { botInfo } from "@/lib/lokmitra/bot";
import { cfg } from "@/lib/lokmitra/config";
import { body, err, json } from "@/lib/lokmitra/http";
import { setCommands, setWebhook, tg, webhookInfo } from "@/lib/lokmitra/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/telegram/setup — bot + webhook status (operator). */
export async function GET(req: Request) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const info = botInfo();
  if (!info.configured) return json({ ...info, webhook: null, me: null });
  const [me, wh] = await Promise.all([tg<Record<string, unknown>>("getMe", {}).catch((e) => ({ error: (e as Error).message })), webhookInfo().catch((e) => ({ error: (e as Error).message }))]);
  return json({ ...info, me, webhook: wh });
}

/** POST /api/telegram/setup { base_url? } — register /api/telegram/webhook + bot commands (operator). */
export async function POST(req: Request) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const b = await body<{ base_url?: string }>(req);
  const base = (b.base_url || cfg.publicBaseUrl() || new URL(req.url).origin).replace(/\/+$/, "");
  if (!base.startsWith("https://")) return json({ error: { code: "BAD_REQUEST", message: `Telegram needs a public https URL (got ${base}). Set PUBLIC_BASE_URL or pass base_url.` } }, 400);
  try {
    const url = `${base}/api/telegram/webhook`;
    await setWebhook(url);
    await setCommands();
    return json({ ok: true, webhook_url: url, webhook: await webhookInfo() });
  } catch (e) {
    return err(e, 502);
  }
}
