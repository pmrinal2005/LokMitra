import { badRequest, fail, ok, readJson } from "@/lib/api-helpers";
import { buildAgentBody } from "@/lib/agent-body";
import { tf, type TfRun } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/tinyfish/agent/run → POST /v1/automation/run (synchronous, blocks until done) */
export async function POST(req: Request) {
  const { body, error } = buildAgentBody(await readJson(req));
  if (error) return badRequest(error);
  try {
    return ok(await tf<TfRun>("agent", "/v1/automation/run", { method: "POST", body, timeoutMs: 290_000 }));
  } catch (e) {
    return fail(e);
  }
}
