import { isAdmin } from "@/lib/lokmitra/auth";
import { cfg, integrations } from "@/lib/lokmitra/config";
import { db } from "@/lib/lokmitra/db";
import { json } from "@/lib/lokmitra/http";
import { LANGUAGES } from "@/lib/lokmitra/languages";
import { getWallet, ratesFrom } from "@/lib/lokmitra/ops";
import { SCHEMES, STATES } from "@/lib/lokmitra/schemes";
import { TF_BASE } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/lokmitra/settings — integration health (never returns secret values). */
export async function GET(req: Request) {
  const [dbPing, w] = await Promise.all([db.ping(), getWallet(true)]);
  const base = cfg.publicBaseUrl();
  return json({
    integrations: integrations(),
    database: dbPing,
    wallet: { balance: w.wallet?.available_balance ?? null, error: w.error ?? null, rates: ratesFrom(w.wallet), raw_meters: w.wallet?.rates?.meters ?? [] },
    upstreams: TF_BASE,
    guards: { budget_usd: cfg.budgetUsd(), min_wallet_usd: cfg.minWalletUsd(), max_agent_steps: cfg.maxAgentSteps(), max_duration_seconds: Number(process.env.TINYFISH_MAX_DURATION_SECONDS || 0) || 180, fetch_ttl_seconds: cfg.cacheTtlSec(), rate_limit_per_hour: cfg.rateLimitPerHour(), otp_session_ttl_seconds: cfg.otpSessionTtlSec(), confirm_ttl_seconds: cfg.confirmTtlSec(), prefetch_limit: cfg.prefetchLimit() },
    models: { heavy: cfg.groqModelHeavy(), mid: cfg.groqModelMid(), light: cfg.groqModelLight(), translate: cfg.groqModelTranslate(), stt: cfg.groqModelStt() },
    endpoints: base
      ? { telegram_webhook: `${base}/api/telegram/webhook`, tinyfish_webhook: `${base}/api/webhooks/tinyfish`, monitor_webhook: `${base}/api/webhooks/monitor`, cron: `${base}/api/cron/prefetch` }
      : null,
    sentinel_cron: cfg.sentinelCron(),
    registry: { schemes: SCHEMES.length, states: STATES.length, languages: LANGUAGES.length },
    admin: { required: !!cfg.adminToken(), you_are_admin: isAdmin(req) },
  });
}
