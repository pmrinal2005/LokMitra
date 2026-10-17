import { err, json } from "@/lib/lokmitra/http";
import { getReport } from "@/lib/lokmitra/pipeline";

export const dynamic = "force-dynamic";

/** GET /api/lokmitra/report/:id — a stored Citizen Benefit Report (PII-redacted). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return err(Object.assign(new Error("invalid report id"), { status: 400 }));
  const r = await getReport(id);
  return r ? json(r) : err(Object.assign(new Error("report not found (memory store resets on redeploy — configure Supabase)"), { status: 404 }));
}
