import "server-only";
import { db, safe, type Row } from "./db";
import { DISCOVERY_SCHEMA, fill, schemeById, stateByCode, STATES, type SchemeDef, type TaskKind } from "./schemes";
import { search_schemes, type SearchHit } from "./ops";
import { hostOf, isGovHost, nowIso, redact, uniq } from "./util";
import { logRun } from "./store";

/**
 * Discover-Once-Fetch-Forever
 * ------------------------------------------------------------------
 * portal_map is keyed by (state_code × scheme_id × task). A row is the
 * shared "virtual API" for that combination:
 *   - deep_links : official URLs that free Fetch can read (info/deadline/price)
 *   - nav_path   : the click-path an Agent discovered (status/land) — replayed as
 *                  hints so later Agent runs take fewer (cheaper) steps
 *   - selectors  : field labels the Agent found (shown to citizens up-front)
 * Rows are created by (1) seed registry, (2) free Search, (3) a paid Agent run —
 * the cost of (3) is paid exactly once and recorded in discovery_cost_usd.
 */

export interface DeepLink {
  url: string;
  label: string;
  kind: "info" | "status" | "deadline" | "price" | "land" | "notice";
}

export interface PortalRow {
  id: string;
  state_code: string;
  scheme_id: string;
  task: TaskKind;
  entry_url: string;
  deep_links: DeepLink[];
  nav_path: string[];
  selectors: Record<string, unknown>;
  output_schema?: Record<string, unknown> | null;
  source: "seed" | "search" | "agent";
  discovered_by_run?: string | null;
  discovery_cost_usd: number;
  hits: number;
  last_verified_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Central schemes share one row nationwide ("IN"); state-specific ones get one row per state. */
export function cacheState(scheme: SchemeDef, state: string | null | undefined, task: TaskKind) {
  if (scheme.stateSpecific || task === "land" || task === "price") return state && state !== "IN" ? state : "IN";
  return "IN";
}

export async function getPortal(state: string, schemeId: string, task: TaskKind): Promise<PortalRow | null> {
  const row = await safe(db.one<Row>("portal_map", { eq: { state_code: state, scheme_id: schemeId, task } }), null);
  return (row as unknown as PortalRow) ?? null;
}

export async function listPortals(limit = 500): Promise<PortalRow[]> {
  return (await safe(db.select<Row>("portal_map", { order: { col: "updated_at" }, limit }), [])) as unknown as PortalRow[];
}

export async function recordHit(row: PortalRow) {
  await safe(db.rpc("lokmitra_portal_hit", { p_id: row.id }), null);
}

export async function upsertPortal(p: Partial<PortalRow> & { state_code: string; scheme_id: string; task: TaskKind; entry_url: string }) {
  const existing = await getPortal(p.state_code, p.scheme_id, p.task);
  const row: Row = {
    ...(existing ?? {}),
    ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)),
    updated_at: nowIso(),
  };
  if (!existing) {
    row.created_at = nowIso();
    row.hits = 0;
    row.discovery_cost_usd = p.discovery_cost_usd ?? 0;
  } else if (existing.discovery_cost_usd && p.discovery_cost_usd !== undefined) {
    // keep the original one-time discovery cost; re-verification is tracked in runs_log
    row.discovery_cost_usd = existing.discovery_cost_usd;
  }
  delete row.id;
  const out = await db.insert<Row>("portal_map", row, { onConflict: "state_code,scheme_id,task" });
  return (out[0] ?? row) as unknown as PortalRow;
}

/** Seed links from the registry (zero network). */
export function seedLinks(scheme: SchemeDef, state: string, task: TaskKind): DeepLink[] {
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
  return fill(scheme.searchInfo, { state: stateName, district: ctx.district ?? "", commodity: ctx.commodity ?? "", persona: ctx.persona ?? "citizens" });
}

/**
 * Resolve the portal for a (state × scheme × task). Cache HIT → stored row.
 * Cache MISS → free TinyFish Search over official domains, merged with seeds, written back.
 */
export async function resolvePortal(
  schemeId: string,
  task: TaskKind,
  ctx: { state?: string | null; district?: string | null; commodity?: string | null; persona?: string | null },
): Promise<{ row: PortalRow; hit: boolean; searched: SearchHit[]; searchError?: string }> {
  const scheme = schemeById(schemeId);
  if (!scheme) throw new Error(`unknown scheme ${schemeId}`);
  const state = cacheState(scheme, ctx.state, task);
  // price is commodity-specific → deep links carry the commodity; keep it in a per-commodity task row via selectors
  const existing = await getPortal(state, scheme.id, task);
  const exSel = (existing?.selectors ?? {}) as { commodity?: string; district?: string };
  const commodityOk = task !== "price" || !ctx.commodity || (exSel.commodity === ctx.commodity && (exSel.district ?? null) === (ctx.district ?? null));
  if (existing && existing.deep_links?.length && commodityOk) {
    await recordHit(existing);
    return { row: { ...existing, hits: (existing.hits ?? 0) + 1 }, hit: true, searched: [] };
  }

  const q = searchQueryFor(scheme, task, { ...ctx, state });
  const st = stateByCode(state);
  const domains = uniq([...scheme.domains, ...(st.land && task === "land" ? [hostOf(st.land)] : [])]);
  const { hits, error } = await search_schemes(q, {
    include_domains: task === "price" ? undefined : domains,
    purpose: `Find the official Indian government page for ${scheme.name} (${task}) for citizens of ${st.name}`,
    scheme_id: scheme.id,
    state_code: state,
    recency_minutes: task === "deadline" ? 60 * 24 * 120 : undefined,
  });
  const ranked = rankHits(hits, scheme, state).slice(0, task === "price" ? 4 : 3);
  const links = dedupeLinks([
    ...(task === "deadline" ? seedLinks(scheme, state, task).slice(0, 1) : []), // the scheme's own portal carries the notices
    ...(task === "price" ? priceLinks(state, ctx) : []),
    ...ranked.map((h) => ({ url: h.url, label: h.title || hostOf(h.url), kind: (task === "price" ? "price" : task === "deadline" ? "notice" : task === "land" ? "land" : "info") as DeepLink["kind"] })),
    ...seedLinks(scheme, state, task),
  ]).slice(0, task === "price" ? 4 : 5);

  const row = await upsertPortal({
    state_code: state,
    scheme_id: scheme.id,
    task,
    entry_url: task === "land" && st.land ? st.land : scheme.statusUrl && task === "status" ? scheme.statusUrl : scheme.entry,
    deep_links: links,
    nav_path: existing?.nav_path ?? [],
    selectors: { ...(existing?.selectors ?? {}), ...(task === "price" && ctx.commodity ? { commodity: ctx.commodity, district: ctx.district ?? undefined } : {}) },
    source: existing?.source === "agent" ? "agent" : ranked.length ? "search" : "seed",
    last_verified_at: nowIso(),
  });
  return { row, hit: false, searched: hits, searchError: error };
}

/* ------------------------------------------------------------------ */
/* Agent discovery write-back                                          */
/* ------------------------------------------------------------------ */
export interface DiscoveryResult {
  status_page_url?: string | null;
  input_fields?: { label: string; kind: string }[];
  navigation_steps?: string[];
  requires_otp?: boolean;
  requires_captcha?: boolean;
  public_info_urls?: string[];
  notes?: string | null;
}

/** Remove any citizen-entered values from an agent's step list before it becomes shared cache. */
export function sanitizeNavPath(actions: (string | null | undefined)[], secrets: string[]): string[] {
  return actions
    .filter((a): a is string => !!a)
    .map((a) => {
      let s = a;
      for (const v of secrets.filter((x) => x && x.length >= 3)) s = s.split(v).join("[USER_INPUT]");
      return redact(s).slice(0, 220);
    })
    .slice(0, 20);
}

export async function saveAgentDiscovery(opts: {
  scheme_id: string;
  state_code: string;
  task: TaskKind;
  entry_url: string;
  run_id: string | null;
  cost_usd: number;
  discovery?: DiscoveryResult | null;
  nav_path?: string[];
}) {
  const existing = await getPortal(opts.state_code, opts.scheme_id, opts.task);
  const d = opts.discovery ?? {};
  const extraLinks: DeepLink[] = (d.public_info_urls ?? []).filter((u) => /^https?:\/\//.test(u)).map((u) => ({ url: u, label: hostOf(u), kind: "info" }));
  if (d.status_page_url && /^https?:\/\//.test(d.status_page_url)) extraLinks.unshift({ url: d.status_page_url, label: "status page (agent-discovered)", kind: "status" });
  const firstTime = !existing || existing.source !== "agent";
  const row = await upsertPortal({
    state_code: opts.state_code,
    scheme_id: opts.scheme_id,
    task: opts.task,
    entry_url: d.status_page_url && /^https?:\/\//.test(d.status_page_url) ? d.status_page_url : opts.entry_url,
    deep_links: dedupeLinks([...(existing?.deep_links ?? []), ...extraLinks]).slice(0, 8),
    nav_path: (d.navigation_steps?.length ? d.navigation_steps.map((s) => redact(s).slice(0, 220)) : opts.nav_path) ?? existing?.nav_path ?? [],
    selectors: { ...(existing?.selectors ?? {}), input_fields: d.input_fields ?? (existing?.selectors as Row | undefined)?.input_fields ?? [], requires_otp: d.requires_otp ?? null, requires_captcha: d.requires_captcha ?? null, notes: d.notes ?? null },
    output_schema: opts.task === "status" || opts.task === "land" ? undefined : (DISCOVERY_SCHEMA as unknown as Record<string, unknown>),
    source: "agent",
    discovered_by_run: firstTime ? opts.run_id : existing?.discovered_by_run ?? opts.run_id,
    discovery_cost_usd: firstTime ? Math.round(opts.cost_usd * 10000) / 10000 : existing!.discovery_cost_usd,
    last_verified_at: nowIso(),
  });
  void logRun({ surface: "agent", purpose: firstTime ? "discovery_saved" : "discovery_refreshed", scheme_id: opts.scheme_id, state_code: opts.state_code, run_id: opts.run_id, cost_usd: 0, meta: { first_time: firstTime } });
  return { row, firstTime };
}

/** Goal text hints from a cached agent path → fewer exploratory steps on later runs. */
export function navHints(row: PortalRow | null): string {
  if (!row?.nav_path?.length) return "";
  return `Known working path from a previous run (follow it, skip exploration): ${row.nav_path.slice(0, 8).map((s, i) => `${i + 1}) ${s}`).join(" ")}.`;
}

export function statesList() {
  return STATES;
}
