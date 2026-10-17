import { json, err } from "@/lib/lokmitra/http";
import { computeStats } from "@/lib/lokmitra/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/lokmitra/stats — judge dashboard: cache hit ratio, wallet spend vs budget, impact metrics. */
export async function GET() {
  try {
    return json(await computeStats());
  } catch (e) {
    return err(e);
  }
}
