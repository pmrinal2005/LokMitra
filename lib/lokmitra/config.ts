import "server-only";

/**
 * Central, server-only configuration. Every integration is optional except
 * TinyFish; each missing integration degrades gracefully (see /settings).
 */
const env = (k: string) => process.env[k]?.trim() || "";
const num = (k: string, d: number) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && process.env[k] !== "" && process.env[k] !== undefined ? v : d;
};

export const cfg = {
  publicBaseUrl: () => {
    const explicit = env("PUBLIC_BASE_URL");
    if (explicit) return explicit.replace(/\/+$/, "");
    const vercel = env("VERCEL_PROJECT_PRODUCTION_URL") || env("VERCEL_URL");
    return vercel ? `https://${vercel}` : "";
  },
  adminToken: () => env("ADMIN_TOKEN"),
  cronSecret: () => env("CRON_SECRET"),
  webhookSecret: () => env("WEBHOOK_SECRET") || env("CRON_SECRET") || "",
  sessionSecret: () => env("SESSION_SECRET"),
  otpSessionTtlSec: () => num("OTP_SESSION_TTL_SECONDS", 900),
  confirmTtlSec: () => num("CONFIRM_TTL_SECONDS", 600),
  sentinelCron: () => env("SENTINEL_CRON") || "CRON_TZ=Asia/Kolkata 0 8 * * 1",

  // rates are informational (cost display only) — there is NO budget cap / spend ceiling
  stepRateFallback: () => num("TINYFISH_STEP_RATE_USD", 0.016),
  monitorRateFallback: () => num("TINYFISH_MONITOR_RATE_USD", 0.005),
  browserRateFallback: () => num("TINYFISH_BROWSER_RATE_USD_PER_MIN", 0.002),
  agentMode: () => (env("TINYFISH_AGENT_MODE") === "strict" ? "strict" : "default"),
  sendMaxSteps: () => env("TINYFISH_SEND_MAX_STEPS") === "1",
  // functional wall-clock limit per Agent run so it fits in one serverless request (Vercel maxDuration 300 s). 0 = none.
  agentMaxDurationSec: () => num("TINYFISH_MAX_DURATION_SECONDS", 240),
  // abuse protection per citizen / CSC (privacy & fairness guardrail, not a cost control). 0 = off.
  rateLimitPerHour: () => num("RATE_LIMIT_PER_HOUR", 30),

  // Groq (OpenAI-compatible)
  groqKey: () => env("GROQ_API_KEY"),
  groqBase: () => (env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
  groqModelHeavy: () => env("GROQ_MODEL_HEAVY") || "openai/gpt-oss-120b",
  groqModelMid: () => env("GROQ_MODEL_MID") || "openai/gpt-oss-20b",
  groqModelLight: () => env("GROQ_MODEL_LIGHT") || "qwen/qwen3-8b-27b",
  groqModelTranslate: () => env("GROQ_MODEL_TRANSLATE") || env("GROQ_MODEL_LIGHT") || "qwen/qwen3-8b-27b",
  groqModelStt: () => env("GROQ_MODEL_STT") || "whisper-large-v3-turbo",

  // Supabase (PostgREST)
  supabaseUrl: () => env("SUPABASE_URL").replace(/\/+$/, ""),
  supabaseKey: () => env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_KEY"),

  // Telegram
  telegramToken: () => env("TELEGRAM_BOT_TOKEN"),
  telegramSecret: () => env("TELEGRAM_WEBHOOK_SECRET"),
  telegramBotName: () => env("TELEGRAM_BOT_USERNAME"),
  telegramApiBase: () => (env("TELEGRAM_API_BASE") || "https://api.telegram.org").replace(/\/+$/, ""),

  // Resend
  resendKey: () => env("RESEND_API_KEY"),
  resendFrom: () => env("RESEND_FROM") || "LokMitra <onboarding@resend.dev>",
  resendBase: () => (env("RESEND_API_BASE") || "https://api.resend.com").replace(/\/+$/, ""),
  sentinelSweep: () => env("SENTINEL_SWEEP") === "1",
};

export function integrations() {
  return {
    tinyfish: !!env("TINYFISH_API_KEY"),
    groq: !!cfg.groqKey(),
    supabase: !!(cfg.supabaseUrl() && cfg.supabaseKey()),
    telegram: !!cfg.telegramToken(),
    resend: !!cfg.resendKey(),
    public_base_url: cfg.publicBaseUrl() || null,
    admin_token: !!cfg.adminToken(),
    cron_secret: !!cfg.cronSecret(),
    session_secret: !!cfg.sessionSecret(),
    webhook_secret: !!cfg.webhookSecret(),
  };
}
