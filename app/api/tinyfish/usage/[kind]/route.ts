import { badRequest, fail, ok, pickParams } from "@/lib/api-helpers";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

const MAP = { search: "search", fetch: "fetch", browser: "browser" } as const;

/** GET /api/tinyfish/usage/{search|fetch|browser}?limit&page&status&start_after&end_before[&session_id] */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const service = MAP[kind as keyof typeof MAP];
  if (!service) return badRequest("kind must be search | fetch | browser");
  const query = pickParams(new URL(req.url).searchParams, ["limit", "page", "status", "start_after", "end_before", "session_id"]);
  try {
    return ok(await tf(service, "/usage", { query, timeoutMs: 20_000 }));
  } catch (e) {
    return fail(e);
  }
}
