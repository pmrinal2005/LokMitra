import { db, safe, type Row } from "@/lib/lokmitra/db";
import { json } from "@/lib/lokmitra/http";

export const dynamic = "force-dynamic";

/** GET /api/lokmitra/runs?surface=&purpose=&limit= — LokMitra's anonymised audit log (runs_log). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const surface = sp.get("surface");
  const purpose = sp.get("purpose");
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 200, 1), 1000);
  const eq: Record<string, string> = {};
  if (surface && /^[a-z]{2,12}$/.test(surface)) eq.surface = surface;
  if (purpose && /^[a-z_]{2,40}$/.test(purpose)) eq.purpose = purpose;
  const rows = await safe(db.select<Row>("runs_log", { eq: Object.keys(eq).length ? eq : undefined, order: { col: "created_at" }, limit }), []);
  const reports = await safe(db.select<Row>("benefit_reports", { order: { col: "created_at" }, limit: 50, select: "id,language,query,cache_hits,cache_misses,cost_usd,created_at" }), []);
  return json({ runs: rows, reports });
}
