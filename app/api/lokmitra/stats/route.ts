import { json, err } from "@/lib/lokmitra/http";
import { computeStats } from "@/lib/lokmitra/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/lokmitra/stats — judge dashboard: live calls per surface, informational wallet usage (no cap), impact metrics. */
export async function GET() {
  try {
    return json(await computeStats());
  } catch (e) {
    return err(e);
  }
}
