import { badRequest, fail, isHttpUrl, ok, readJson } from "@/lib/api-helpers";
import { tf, type TfFetchResponse } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";
export const maxDuration = 150;

/** POST /api/tinyfish/fetch { urls: string[≤10], format?, ttl?, ... } → POST api.fetch.tinyfish.ai (FREE) */
export async function POST(req: Request) {
  const input = await readJson<Record<string, unknown>>(req);
  const urls = Array.isArray(input?.urls) ? (input!.urls as unknown[]).filter(isHttpUrl) : [];
  if (!urls.length) return badRequest("`urls` must contain 1–10 http(s) URLs");
  if (urls.length > 10) return badRequest("Max 10 URLs per request");
  const body: Record<string, unknown> = { urls };
  const passthrough = [
    "purpose", "format", "links", "image_links", "iframe_links", "page_metadata", "ttl", "per_url_timeout_ms",
    "include_selectors", "exclude_selectors", "include_etag_and_last_modified", "if_none_match", "if_modified_since",
  ];
  for (const k of passthrough) if (input && input[k] !== undefined) body[k] = input[k];
  try {
    return ok(await tf<TfFetchResponse>("fetch", "/", { method: "POST", body, timeoutMs: 140_000 }));
  } catch (e) {
    return fail(e);
  }
}
