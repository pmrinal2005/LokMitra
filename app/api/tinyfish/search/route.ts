import { badRequest, fail, ok, pickParams } from "@/lib/api-helpers";
import { tf, type TfSearchResponse } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

const KEYS = [
  "query", "purpose", "location", "language", "include_domains", "exclude_domains", "domain_type",
  "after_date", "before_date", "recency_minutes", "pub_year_min", "pub_year_max", "page", "include_thumbnail", "fetch",
];

/** GET /api/tinyfish/search?query=… → GET api.search.tinyfish.ai (FREE) */
export async function GET(req: Request) {
  const query = pickParams(new URL(req.url).searchParams, KEYS);
  if (!query.query) return badRequest("`query` is required");
  try {
    return ok(await tf<TfSearchResponse>("search", "/", { query, timeoutMs: 20_000 }));
  } catch (e) {
    return fail(e);
  }
}
