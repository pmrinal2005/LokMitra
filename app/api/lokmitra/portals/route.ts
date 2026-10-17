import { bad, body, err, json } from "@/lib/lokmitra/http";
import { listPortals, resolvePortal } from "@/lib/lokmitra/portal";
import { schemeById, type TaskKind } from "@/lib/lokmitra/schemes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/lokmitra/portals — the shared "virtual API" registry (portal_map). */
export async function GET() {
  const rows = await listPortals(500);
  const totals = rows.reduce(
    (a, r) => ({ rows: a.rows + 1, hits: a.hits + (r.hits ?? 0), agent: a.agent + (r.source === "agent" ? 1 : 0), discovery_usd: a.discovery_usd + Number(r.discovery_cost_usd ?? 0) }),
    { rows: 0, hits: 0, agent: 0, discovery_usd: 0 },
  );
  return json({ portals: rows, totals: { ...totals, discovery_usd: Math.round(totals.discovery_usd * 10000) / 10000, amortised_usd_per_hit: totals.hits ? Math.round((totals.discovery_usd / totals.hits) * 1e6) / 1e6 : null } });
}

/** POST /api/lokmitra/portals { scheme_id, task, state_code?, commodity? } — resolve via cache or FREE Search (no Agent). */
export async function POST(req: Request) {
  const b = await body<{ scheme_id?: string; task?: TaskKind; state_code?: string; commodity?: string; district?: string }>(req);
  if (!b.scheme_id || !schemeById(b.scheme_id)) return bad("valid scheme_id required");
  const task = (["info", "status", "land", "price", "deadline"] as TaskKind[]).includes(b.task as TaskKind) ? (b.task as TaskKind) : "info";
  try {
    const r = await resolvePortal(b.scheme_id, task, { state: b.state_code ?? null, commodity: b.commodity ?? null, district: b.district ?? null });
    return json({ hit: r.hit, portal: r.row, search_results: r.searched.slice(0, 10), search_error: r.searchError ?? null });
  } catch (e) {
    return err(e);
  }
}
