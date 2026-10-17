import "server-only";
import { isHttpUrl } from "./api-helpers";

/**
 * Validates + whitelists the Agent request body (shared by /run, /run-async, /run-sse).
 * Mirrors the official schema: url + goal required; optional browser_profile, agent_config,
 * capture_config, proxy_config, output_schema, use_profile, profile_id, use_vault, webhook_url.
 */
export function buildAgentBody(input: Record<string, unknown> | null): { body?: Record<string, unknown>; error?: string } {
  if (!input) return { error: "Body must be JSON" };
  const { url, goal } = input as { url?: unknown; goal?: unknown };
  if (!isHttpUrl(url)) return { error: "`url` must be a valid http(s) URL" };
  if (typeof goal !== "string" || goal.trim().length < 1) return { error: "`goal` is required" };
  if (goal.length > 8000) return { error: "`goal` too long (max 8000 chars)" };

  const body: Record<string, unknown> = { url, goal: goal.trim() };

  if (input.browser_profile === "lite" || input.browser_profile === "stealth") body.browser_profile = input.browser_profile;

  const ac = (input.agent_config ?? {}) as Record<string, unknown>;
  const agent_config: Record<string, unknown> = { cursor_style: "fish" };
  if (ac.mode === "default" || ac.mode === "strict") agent_config.mode = ac.mode;
  if (typeof ac.max_steps === "number" && ac.max_steps >= 1 && ac.max_steps <= 500) agent_config.max_steps = Math.floor(ac.max_steps);
  const defaultMaxDur = Number(process.env.TINYFISH_MAX_DURATION_SECONDS || 0);
  if (typeof ac.max_duration_seconds === "number" && ac.max_duration_seconds >= 1) agent_config.max_duration_seconds = Math.floor(ac.max_duration_seconds);
  else if (defaultMaxDur > 0) agent_config.max_duration_seconds = defaultMaxDur;
  if (ac.cursor_style === "standard" || ac.cursor_style === "green-pointer" || ac.cursor_style === "fish") agent_config.cursor_style = ac.cursor_style;
  body.agent_config = agent_config;

  if (input.capture_config && typeof input.capture_config === "object") {
    const cc = input.capture_config as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    for (const k of ["elements", "snapshots", "screenshots", "recording", "html"]) if (typeof cc[k] === "boolean") out[k] = cc[k] as boolean;
    if (Object.keys(out).length) body.capture_config = out;
  }

  if (input.proxy_config && typeof input.proxy_config === "object") {
    const pc = input.proxy_config as Record<string, unknown>;
    const allowed = ["US", "GB", "CA", "DE", "FR", "JP", "AU"];
    const out: Record<string, unknown> = { enabled: pc.enabled === true };
    if (typeof pc.country_code === "string" && allowed.includes(pc.country_code)) out.country_code = pc.country_code;
    body.proxy_config = out;
  }

  if (input.output_schema && typeof input.output_schema === "object") body.output_schema = input.output_schema;
  if (input.use_profile === true) body.use_profile = true;
  if (typeof input.profile_id === "string" && input.profile_id) body.profile_id = input.profile_id;
  if (input.use_vault === true) body.use_vault = true;
  if (typeof input.webhook_url === "string" && input.webhook_url.startsWith("https://")) body.webhook_url = input.webhook_url;

  return { body };
}
