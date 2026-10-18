import { bad, body, err, json } from "@/lib/lokmitra/http";
import { resolvePortalLive } from "@/lib/lokmitra/portal";
import { fetch_clean_markdown } from "@/lib/lokmitra/ops";
import { schemeById, type TaskKind } from "@/lib/lokmitra/schemes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 150;

/**
 * POST /api/lokmitra/portals { scheme_id, task, state_code?, commodity?, district?, fetch? }
 * Live Portal Explorer: a fresh TinyFish Search locates the official page(s) right now and,
 * with fetch=true, a live TinyFish Fetch reads them. Nothing is stored or reused.
 */
export async function POST(req: Request) {
  const b = await body<{ scheme_id?: string; task?: TaskKind; state_code?: string; commodity?: string; district?: string; fetch?: boolean }>(req);
  if (!b.scheme_id || !schemeById(b.scheme_id)) return bad("valid scheme_id required");
  const task = (["info", "status", "land", "price", "deadline"].includes(String(b.task)) ? b.task : "info") as TaskKind;
  try {
    const t0 = Date.now();
    const r = await resolvePortalLive(b.scheme_id, task, { state: b.state_code ?? null, commodity: b.commodity ?? null, district: b.district ?? null });
    const pages = b.fetch ? await fetch_clean_markdown(r.portal.deep_links.slice(0, 5).map((l) => l.url), { purpose: `Live Portal Explorer: ${b.scheme_id} ${task}`, maxChars: 1200 }) : [];
    return json({
      live: true,
      portal: r.portal,
      search: { query: r.query, latency_ms: r.latency_ms, error: r.searchError ?? null, results: r.searched.slice(0, 10) },
      pages: pages.map((p) => ({ url: p.url, final_url: p.final_url, title: p.title, chars: p.text.length, latency_ms: p.latency_ms ?? null, error: p.error ?? null, preview: p.text.slice(0, 600) })),
      elapsed_ms: Date.now() - t0,
    });
  } catch (e) {
    return err(e);
  }
}
