import { requireAdmin } from "@/lib/lokmitra/auth";
import { bad, err, json } from "@/lib/lokmitra/http";
import { runSentinelNow } from "@/lib/lokmitra/sentinel";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/lokmitra/sentinels/:id/run — Monitor run-now ($0.005) + diff + fan-out (operator). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return bad("invalid id");
  try {
    const r = await runSentinelNow(id);
    return json({ processed: r.processed, results: ((r.run as { results?: unknown[] }).results ?? []).length });
  } catch (e) {
    return err(e);
  }
}
