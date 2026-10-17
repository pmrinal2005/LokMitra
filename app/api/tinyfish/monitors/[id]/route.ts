import { badRequest, fail, ok, readJson, SAFE_ID } from "@/lib/api-helpers";
import { tf, type TfMonitor } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/tinyfish/monitors/:id */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!SAFE_ID.test(id)) return badRequest("Invalid monitor id");
  try {
    return ok(await tf<TfMonitor>("agent", `/v1/monitors/${id}`, { timeoutMs: 20_000 }));
  } catch (e) {
    return fail(e);
  }
}

/** PATCH /api/tinyfish/monitors/:id  { status: "active"|"paused" }  OR  { schedule_cron, name?, purpose?, webhook_url? } */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!SAFE_ID.test(id)) return badRequest("Invalid monitor id");
  const input = await readJson<Record<string, unknown>>(req);
  if (!input) return badRequest("Body must be JSON");
  let body: Record<string, unknown>;
  if (input.status !== undefined) {
    if (input.status !== "active" && input.status !== "paused") return badRequest("status must be active|paused");
    body = { status: input.status }; // docs: never combine status with other fields
  } else {
    body = {};
    for (const k of ["schedule_cron", "name", "purpose", "webhook_url"]) if (k in input) body[k] = input[k];
    if (!Object.keys(body).length) return badRequest("Nothing to update");
  }
  try {
    return ok(await tf<TfMonitor>("agent", `/v1/monitors/${id}`, { method: "PATCH", body, timeoutMs: 20_000 }));
  } catch (e) {
    return fail(e);
  }
}

/** DELETE /api/tinyfish/monitors/:id */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!SAFE_ID.test(id)) return badRequest("Invalid monitor id");
  try {
    return ok(await tf("agent", `/v1/monitors/${id}`, { method: "DELETE", timeoutMs: 20_000 }));
  } catch (e) {
    return fail(e);
  }
}
