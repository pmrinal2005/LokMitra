import { badRequest, fail, isHttpUrl, ok, readJson } from "@/lib/api-helpers";
import { tf, type TfMonitor } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/** GET /api/tinyfish/monitors → GET /v1/monitors */
export async function GET() {
  try {
    return ok(await tf<{ monitors: TfMonitor[] }>("agent", "/v1/monitors", { timeoutMs: 20_000 }));
  } catch (e) {
    return fail(e);
  }
}

/**
 * POST /api/tinyfish/monitors → POST /v1/monitors
 * Page monitor:  { type:"fetch",  config:{ url, format? }, schedule_cron, name?, purpose? }
 * Topic monitor: { type:"search", config:{ query, recency_minutes?, result_limit? }, schedule_cron, name?, purpose? }
 */
export async function POST(req: Request) {
  const input = await readJson<Record<string, unknown>>(req);
  if (!input) return badRequest("Body must be JSON");
  const type = input.type;
  const config = (input.config ?? {}) as Record<string, unknown>;
  if (type !== "fetch" && type !== "search") return badRequest("`type` must be 'fetch' or 'search'");
  if (type === "fetch" && !isHttpUrl(config.url)) return badRequest("config.url must be http(s)");
  if (type === "search" && (typeof config.query !== "string" || !config.query)) return badRequest("config.query is required");
  if (typeof input.schedule_cron !== "string" || input.schedule_cron.trim().split(/\s+/).length < 5) return badRequest("schedule_cron must be a 5-field cron");
  const body: Record<string, unknown> = { type, config, schedule_cron: input.schedule_cron };
  for (const k of ["name", "purpose", "webhook_url"]) if (typeof input[k] === "string" && input[k]) body[k] = input[k];
  try {
    return ok(await tf("agent", "/v1/monitors", { method: "POST", body, timeoutMs: 60_000 }), { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
