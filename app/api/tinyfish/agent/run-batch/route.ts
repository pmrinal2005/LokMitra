import { badRequest, fail, ok, readJson } from "@/lib/api-helpers";
import { buildAgentBody } from "@/lib/agent-body";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/**
 * POST /api/tinyfish/agent/run-batch { runs: [{ url, goal, ... }] (1–100) }
 * → POST /v1/automation/run-batch → { run_ids: string[] | null, error }
 * Every item is validated/whitelisted with the same rules as single runs.
 */
export async function POST(req: Request) {
  const input = await readJson<{ runs?: unknown }>(req);
  if (!input || !Array.isArray(input.runs) || input.runs.length < 1) return badRequest("`runs` must be a non-empty array");
  if (input.runs.length > 100) return badRequest("Max 100 runs per batch");
  const runs: Record<string, unknown>[] = [];
  for (let i = 0; i < input.runs.length; i++) {
    const { body, error } = buildAgentBody(input.runs[i] as Record<string, unknown>);
    if (error) return badRequest(`runs[${i}]: ${error}`);
    runs.push(body!);
  }
  try {
    return ok(await tf<{ run_ids: string[] | null; error: unknown }>("agent", "/v1/automation/run-batch", { method: "POST", body: { runs }, timeoutMs: 45_000 }));
  } catch (e) {
    return fail(e);
  }
}
