import { badRequest, fail, isHttpUrl, ok, readJson } from "@/lib/api-helpers";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/tinyfish/browser { url?, timeout_seconds? } → POST api.browser.tinyfish.ai → { session_id, cdp_url, base_url } */
export async function POST(req: Request) {
  const input = (await readJson<Record<string, unknown>>(req)) ?? {};
  const body: Record<string, unknown> = {};
  if (input.url !== undefined) {
    if (!isHttpUrl(input.url)) return badRequest("`url` must be http(s)");
    body.url = input.url;
  }
  const t = Number(input.timeout_seconds);
  body.timeout_seconds = Number.isFinite(t) && t >= 5 && t <= 86400 ? Math.floor(t) : 120;
  try {
    return ok(await tf<{ session_id: string; cdp_url: string; base_url: string }>("browser", "/", { method: "POST", body, timeoutMs: 55_000 }), { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
