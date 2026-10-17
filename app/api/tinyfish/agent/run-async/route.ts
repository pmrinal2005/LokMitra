import { badRequest, fail, ok, readJson } from "@/lib/api-helpers";
import { buildAgentBody } from "@/lib/agent-body";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/** POST /api/tinyfish/agent/run-async → POST /v1/automation/run-async → { run_id } (poll /api/tinyfish/runs/:id) */
export async function POST(req: Request) {
  const { body, error } = buildAgentBody(await readJson(req));
  if (error) return badRequest(error);
  try {
    return ok(await tf<{ run_id: string | null; error: unknown }>("agent", "/v1/automation/run-async", { method: "POST", body, timeoutMs: 30_000 }));
  } catch (e) {
    return fail(e);
  }
}
