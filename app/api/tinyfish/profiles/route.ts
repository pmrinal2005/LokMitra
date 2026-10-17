import { fail, ok } from "@/lib/api-helpers";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/** GET /api/tinyfish/profiles → GET /v1/profiles (Browser Context Profiles, read-only) */
export async function GET() {
  try {
    return ok(await tf<{ profiles: unknown[] }>("agent", "/v1/profiles", { timeoutMs: 15_000 }));
  } catch (e) {
    return fail(e);
  }
}
