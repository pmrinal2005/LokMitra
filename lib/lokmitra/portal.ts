import "server-only";
import { fill, schemeById, stateByCode, STATES, type SchemeDef, type TaskKind } from "./schemes";
import { search_schemes, type SearchHit } from "./ops";
import { hostOf, isGovHost, uniq } from "./util";

/**
 * Live portal resolution — NO caching anywhere.
 * ------------------------------------------------------------------
 * Every citizen request locates the official portal afresh:
 *   1. a LIVE TinyFish Search over the scheme's official domains (government URLs
 *      change domains/sub-domains without notice, so we always ask the live web),
 *   2. merged with the static scheme registry (code constants, not stored data),
 *   3. handed straight to a LIVE Fetch / Agent run by the caller.
 * Nothing is written back; nothing is reused by the next query, by this citizen or
 * any other. Two identical questions → two completely independent live executions.
 */

export interface DeepLink {
  url: string;
  label: string;
  kind: "info" | "status" | "deadline" | "price" | "land" | "notice";
}

export interface LivePortal {
  scheme_id: string;
  state_code: string;
  task: TaskKind;
  entry_url: string;
  deep_links: DeepLink[];
  resolved_via: "search" | "registry";
  resolved_at: string;
}

/** Central schemes are national ("IN"); state-specific ones (and land / mandi prices) resolve per state. */
export function portalState(scheme: SchemeDef, state: string | null | undefined, task: TaskKind) {
  if (scheme.stateSpecific || task === "land" || task === "price") return state && state !== "IN" ? state : "IN";
  return "IN";
}

/** Registry links (static code constants — zero network, nothing stored). */
export function registryLinks(scheme: SchemeDef, state: string, task: TaskKind): DeepLink[] {
  const links: DeepLink[] = scheme.infoLinks.map((u) => ({ url: u, label: `${scheme.name} — official`, kind: task === "deadline" ? "notice" : "info" }));
  if (task === "land") {
    const st = stateByCode(state);
    if (st.land) links.unshift({ url: st.land, label: `${st.name} land records`, kind: "land" });
  }
  if (scheme.id === "pds") {
    const st = stateByCode(state);
    if (st.food) links.unshift({ url: st.food, label: `${st.name} food & civil supplies`, kind: "info" });
  }
  return dedupeLinks(links);
}

const slug = (v: string) => v.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Live, bot-friendly mandi price pages (Agmarknet itself answers 403 to Fetch). State table + district overview. */
export function priceLinks(state: string, ctx: { district?: string | null; commodity?: string | null }): DeepLink[] {
  if (!ctx.commodity) return [];
  const st = stateByCode(state);
  const c = slug(ctx.commodity);
  const out: DeepLink[] = [];
  if (ctx.district) out.push({ url: `https://acrop.app/prices/${c}/${slug(st.name)}/${slug(ctx.district)}`, label: `${ctx.commodity} — ${ctx.district} mandis (AgMarkNet data)`, kind: "price" });
  out.push({ url: `https://agriplus.in/prices/${c}/${slug(st.name)}`, label: `${ctx.commodity} — ${st.name} mandi table (AgMarkNet data)`, kind: "price" });
  return out;
}

function dedupeLinks(links: DeepLink[]) {
  const seen = new Set<string>();
  return links.filter((l) => {
    const k = l.url.replace(/\/+$/, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function rankHits(hits: SearchHit[], scheme: SchemeDef, state: string): SearchHit[] {
  const st = stateByCode(state);
  const stateHost = st.land ? hostOf(st.land) : "";
  const score = (h: SearchHit) => {
    const host = hostOf(h.url);
    let s = 0;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return -100; // raw-IP mirrors are never citizen-facing sources
    if (scheme.domains.some((d) => host === d || host.endsWith(`.${d}`))) s += 10;
    if (stateHost && host === stateHost) s += 8;
    if (isGovHost(h.url)) s += 5;
    if (/\.pdf($|\?)/i.test(h.url)) s += 1;
    s -= h.position * 0.1;
    return s;
  };
  return [...hits].filter((h) => score(h) >= 5).sort((a, b) => score(b) - score(a));
}

export function searchQueryFor(scheme: SchemeDef, task: TaskKind, ctx: { state?: string | null; district?: string | null; commodity?: string | null; persona?: string | null }) {
  const stateName = ctx.state && ctx.state !== "IN" ? stateByCode(ctx.state).name : "";
  if (task === "deadline") return `${scheme.name} last date ${stateName} ${new Date().getFullYear()} official notice`.replace(/\s+/g, " ").trim();
  if (task === "status") return `${scheme.name} beneficiary status check official portal ${stateName}`.replace(/\s+/g, " ").trim();
  if (task === "land") return `${stateName} bhulekh land record khasra khatauni official portal`.replace(/\s+/g, " ").trim();
  return fill(scheme.searchInfo, { state: stateName, district: ctx.district ?? "", commodity: ctx.commodity ?? "", persona: ctx.persona ?? "citizens" });
}

/**
 * Resolve the official portal for (state × scheme × task) LIVE — always a fresh TinyFish
 * Search, never a lookup of something resolved earlier.
 */
export async function resolvePortalLive(
  schemeId: string,
  task: TaskKind,
  ctx: { state?: string | null; district?: string | null; commodity?: string | null; persona?: string | null },
): Promise<{ portal: LivePortal; searched: SearchHit[]; query: string; searchError?: string; latency_ms: number }> {
  const scheme = schemeById(schemeId);
  if (!scheme) throw new Error(`unknown scheme ${schemeId}`);
  const state = portalState(scheme, ctx.state, task);
  const st = stateByCode(state);
  const q = searchQueryFor(scheme, task, { ...ctx, state });
  const domains = uniq([...scheme.domains, ...(st.land && task === "land" ? [hostOf(st.land)] : [])]);
  const { hits, error, latency_ms } = await search_schemes(q, {
    include_domains: task === "price" ? undefined : domains,
    purpose: `Find the official Indian government page for ${scheme.name} (${task}) for citizens of ${st.name}`,
    scheme_id: scheme.id,
    state_code: state,
    recency_minutes: task === "deadline" ? 60 * 24 * 120 : undefined,
  });
  const ranked = rankHits(hits, scheme, state).slice(0, task === "price" ? 4 : 3);
  const kind: DeepLink["kind"] = task === "price" ? "price" : task === "deadline" ? "notice" : task === "land" ? "land" : task === "status" ? "status" : "info";
  const links = dedupeLinks([
    ...(task === "deadline" ? registryLinks(scheme, state, task).slice(0, 1) : []), // the scheme's own portal carries the notices
    ...(task === "price" ? priceLinks(state, ctx) : []),
    ...(task === "info" ? registryLinks(scheme, state, task).slice(0, 1) : []), // registry page is known-good → always in the Fetch batch
    ...ranked.map((h) => ({ url: h.url, label: h.title || hostOf(h.url), kind })),
    ...registryLinks(scheme, state, task),
  ]).slice(0, task === "price" ? 4 : 5);

  const entry = task === "land" && st.land ? st.land : task === "status" ? ranked.find((h) => /status|beneficiar|know.?your/i.test(`${h.url} ${h.title}`))?.url ?? scheme.statusUrl ?? scheme.entry : scheme.entry;
  return {
    portal: { scheme_id: scheme.id, state_code: state, task, entry_url: entry, deep_links: links, resolved_via: ranked.length ? "search" : "registry", resolved_at: new Date().toISOString() },
    searched: hits,
    query: q,
    searchError: error,
    latency_ms,
  };
}

export function statesList() {
  return STATES;
}
