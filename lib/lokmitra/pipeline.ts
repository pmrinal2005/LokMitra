import "server-only";
import { cfg } from "./config";
import { db, safe } from "./db";
import { extractFromMarkdown, followUp, parseIntent, synthesize, translate, type Intent, type SectionInput, type SubQuery } from "./groq";
import { langByCode } from "./languages";
import { fetch_clean_markdown, rates, type FetchedPage } from "./ops";
import { cacheState, getPortal, resolvePortal, type PortalRow } from "./portal";
import { estimateSteps, INFO_SCHEMA, PRICE_SCHEMA, schemeById, stateByCode, type SchemeDef } from "./schemes";
import { getUser, logRun, rateLimit, seal, sessions, upsertUser } from "./store";
import { clip, hostOf, nowIso, redact, uuid } from "./util";

export type Emit = (event: string, data: Record<string, unknown>) => void | Promise<void>;

export interface AskInput {
  text: string;
  user_id?: string | null;
  channel?: "web" | "telegram" | "email" | "csc";
  language?: string | null; // preferred reply language (UI selector)
  state_code?: string | null;
  district?: string | null;
  identifiers?: Record<string, string>;
}

export interface Section extends SectionInput {
  cache: "hit" | "miss";
  portal_state: string;
  confirm?: ConfirmPlan;
  excerpt_sources?: { url: string; title: string | null; cached: boolean; error?: string }[];
}

export interface ConfirmPlan {
  confirm_id: string;
  scheme_id: string;
  scheme_name: string;
  task: "status" | "land";
  entry_url: string;
  est_steps: number;
  est_cost_usd: number;
  cached_path: boolean;
  requires_otp: boolean | null;
  fields: { key: string; label: string; provided: boolean }[];
  expires_at: string;
}

export interface AskResult {
  report_id: string;
  language: string;
  intent: Intent;
  intent_via: "groq" | "heuristic";
  sections: Section[];
  summary_en: string;
  summary_local: string;
  sources: string[];
  cache_hits: number;
  cache_misses: number;
  cost_usd: number;
  follow_up?: boolean;
  elapsed_ms: number;
}

const LAND_FIELDS = [
  { key: "district", label: "District" },
  { key: "tehsil", label: "Tehsil / Taluka" },
  { key: "village", label: "Village" },
  { key: "khasra_no", label: "Khasra / Survey / Gat number" },
];

/* ------------------------------------------------------------------ */
/* Free-path extraction                                                */
/* ------------------------------------------------------------------ */
const INFO_HINT = `{"scheme_name":string,"benefit":string|null,"eligibility":string[],"exclusions":string[],"documents_required":string[],"how_to_apply":string[],"deadline":string|null,"helpline":string|null,"official_url":string|null}`;
const PRICE_HINT = `{"commodity":string,"prices":[{"market":string,"min_price":string|null,"max_price":string|null,"modal_price":string|null,"unit":string|null,"date":string|null}]}`;
const DEADLINE_HINT = `{"deadline":string|null,"season":string|null,"latest_notice_title":string|null,"latest_notice_date":string|null,"what_changed":string|null,"official_url":string|null}`;

function excerpt(text: string, re: RegExp, max = 900) {
  const paras = text.split(/\n{1,}/).map((p) => p.trim()).filter((p) => p.length > 30 && !/^\[?!\[/.test(p));
  const hits = paras.filter((p) => re.test(p));
  const pick = (hits.length ? hits : paras).slice(0, 6).join("\n");
  return clip(pick, max);
}

async function extractSection(scheme: SchemeDef, sub: SubQuery, pages: FetchedPage[], intent: Intent): Promise<{ data: Record<string, unknown>; status: Section["status"] }> {
  const good = pages.filter((p) => p.text && p.text.length > 80);
  if (!good.length) return { data: { excerpt: null, errors: pages.map((p) => `${hostOf(p.url)}: ${p.error ?? "empty"}`) }, status: "error" };
  const md = good.map((p) => `## SOURCE ${p.final_url ?? p.url}\n# ${p.title ?? ""}\n${p.text}`).join("\n\n").slice(0, 15000);
  if (sub.task === "price") {
    const q = `Latest mandi prices for ${intent.commodity ?? "the commodity"}${intent.district ? ` near ${intent.district}` : ""}${intent.state_code ? ` in ${stateByCode(intent.state_code).name}` : ""}`;
    const x = await extractFromMarkdown<Record<string, unknown>>({ markdown: md, schemaHint: PRICE_HINT, question: q, purpose: "extract_price" });
    if (x && Array.isArray(x.prices) && x.prices.length) return { data: x, status: "ok" };
    return { data: { commodity: intent.commodity, prices: [], excerpt: excerpt(md, new RegExp(`${intent.commodity ?? "price"}|₹|rs\\.?|quintal|modal`, "i")) }, status: "partial" };
  }
  if (sub.task === "deadline") {
    const x = await extractFromMarkdown<Record<string, unknown>>({ markdown: md, schemaHint: DEADLINE_HINT, question: `What is the current last date / latest notice for ${scheme.name}?`, purpose: "extract_deadline" });
    if (x && (x.deadline || x.latest_notice_title)) return { data: x, status: "ok" };
    return { data: { excerpt: excerpt(md, /last date|deadline|अंतिम|extended|notice|circular|\b20\d\d\b/i) }, status: "partial" };
  }
  const x = await extractFromMarkdown<Record<string, unknown>>({ markdown: md, schemaHint: INFO_HINT, question: `Eligibility, benefits, documents and how to apply for ${scheme.name}${intent.persona ? ` (citizen is a ${intent.persona})` : ""}`, purpose: "extract_info" });
  if (x && Array.isArray(x.eligibility) && x.eligibility.length) return { data: x, status: "ok" };
  return { data: { scheme_name: scheme.name, benefit: scheme.benefit, excerpt: excerpt(md, /eligib|benefit|document|apply|पात्र|लाभ|last date|helpline/i) }, status: "partial" };
}

/* ------------------------------------------------------------------ */
/* Confirmation gate for paid Agent work                               */
/* ------------------------------------------------------------------ */
async function planConfirm(scheme: SchemeDef, sub: SubQuery, intent: Intent, portalState: string, userId: string | null, identifiers: Record<string, string>): Promise<ConfirmPlan> {
  const task = sub.task === "land" ? "land" : "status";
  const existing = await getPortal(portalState, scheme.id, task);
  const cached = existing?.source === "agent";
  const steps = estimateSteps(task, cached);
  const r = await rates();
  const fieldsDef = task === "land" ? LAND_FIELDS : scheme.statusIdentifiers ?? [{ key: "reg_no", label: "Registration / application number" }];
  const ids: Record<string, string> = { ...identifiers };
  if (task === "land" && intent.district && !ids.district) ids.district = intent.district;
  const st = stateByCode(portalState);
  const entry = existing?.entry_url ?? (task === "land" ? st.land ?? scheme.entry : scheme.statusUrl ?? scheme.entry);
  const ttl = cfg.confirmTtlSec();
  const sess = await sessions.put(
    "confirm",
    {
      scheme_id: scheme.id,
      task,
      state_code: portalState,
      entry_url: entry,
      est_steps: steps,
      sealed: seal(ids),
      language: intent.language,
      created: nowIso(),
    },
    ttl,
    { user_id: userId },
  );
  return {
    confirm_id: sess.id,
    scheme_id: scheme.id,
    scheme_name: scheme.name,
    task,
    entry_url: entry,
    est_steps: steps,
    est_cost_usd: Math.round(steps * r.step * 1000) / 1000,
    cached_path: cached,
    requires_otp: (existing?.selectors as { requires_otp?: boolean } | undefined)?.requires_otp ?? (scheme.statusIdentifiers?.some((f) => /otp/i.test(f.label)) || null),
    fields: fieldsDef.map((f) => ({ key: f.key, label: f.label, provided: !!ids[f.key] })),
    expires_at: sess.expires_at,
  };
}

/* ------------------------------------------------------------------ */
/* Main entry                                                          */
/* ------------------------------------------------------------------ */
export async function ask(input: AskInput, emit: Emit = () => {}): Promise<AskResult> {
  const t0 = Date.now();
  const text = String(input.text ?? "").trim().slice(0, 2000);
  if (!text) throw new Error("empty query");
  const userId = input.user_id || `anon:${uuid()}`;
  const rl = await rateLimit(userId);
  if (!rl.ok) throw Object.assign(new Error(`Rate limit reached (${rl.limit}/hour). Please try again later.`), { status: 429 });

  const user = await getUser(userId);
  const hint = { language: input.language ?? user?.language ?? null, state_code: input.state_code ?? user?.state_code ?? null, district: input.district ?? user?.district ?? null };
  await emit("stage", { stage: "nlu", message: "Understanding your question…" });
  const { intent, via } = await parseIntent(text, hint);
  if (input.state_code && !intent.state_code) intent.state_code = input.state_code;
  if (input.district && !intent.district) intent.district = input.district;
  Object.assign(intent.identifiers, input.identifiers ?? {});
  const replyLang = input.language || intent.language || user?.language || "en";
  await emit("intent", { intent: { ...intent, identifiers: Object.keys(intent.identifiers) }, via, reply_language: replyLang });
  void upsertUser({ id: userId, channel: input.channel ?? "web", language: replyLang, state_code: intent.state_code ?? user?.state_code ?? null, district: intent.district ?? user?.district ?? null });

  /* ---- follow-up questions answered from the previous report ---- */
  if (intent.follow_up) {
    const chat = await sessions.get<{ summary_en: string }>(`chat_${userId}`.slice(0, 128));
    if (chat?.data.summary_en) {
      const ans = await followUp(text, chat.data.summary_en, replyLang);
      if (ans) {
        const report_id = uuid();
        await emit("report", { report_id, summary_en: ans, summary_local: ans, language: replyLang, follow_up: true });
        return { report_id, language: replyLang, intent, intent_via: via, sections: [], summary_en: ans, summary_local: ans, sources: [], cache_hits: 0, cache_misses: 0, cost_usd: 0, follow_up: true, elapsed_ms: Date.now() - t0 };
      }
    }
  }

  /* ---- resolve portals (cache lookup → free Search on miss) ---- */
  await emit("stage", { stage: "cache", message: `Checking LokMitra's portal map for ${intent.sub_queries.length} request(s)…` });
  const subs = intent.sub_queries.slice(0, 6);
  const resolved = await Promise.all(
    subs.map(async (sub) => {
      const scheme = schemeById(sub.scheme_id)!;
      const portalState = cacheState(scheme, intent.state_code, sub.task);
      try {
        const r = await resolvePortal(scheme.id, sub.task, { state: intent.state_code, district: intent.district, commodity: intent.commodity, persona: intent.persona });
        await emit("cache", { scheme_id: scheme.id, scheme: scheme.name, task: sub.task, state: portalState, hit: r.hit, source: r.row.source, hits: r.row.hits, links: r.row.deep_links.map((l) => l.url), search_results: r.searched.length, search_error: r.searchError ?? null });
        return { sub, scheme, portalState, row: r.row as PortalRow | null, hit: r.hit };
      } catch (e) {
        await emit("cache", { scheme_id: scheme.id, scheme: scheme.name, task: sub.task, state: portalState, hit: false, error: (e as Error).message });
        return { sub, scheme, portalState, row: null, hit: false };
      }
    }),
  );

  /* ---- one batched free Fetch for every public page (≤10 URLs per request) ---- */
  const freeOnes = resolved.filter((r) => !(r.sub.personal && (r.sub.task === "status" || r.sub.task === "land")));
  const urlPlan = new Map<string, string[]>();
  for (const r of freeOnes) urlPlan.set(`${r.scheme.id}:${r.sub.task}`, (r.row?.deep_links ?? []).slice(0, 2).map((l) => l.url));
  const allUrls = [...new Set([...urlPlan.values()].flat())];
  let pages: FetchedPage[] = [];
  if (allUrls.length) {
    await emit("stage", { stage: "fetch", message: `Reading ${allUrls.length} official page(s) via TinyFish Fetch (free)…`, urls: allUrls });
    pages = await fetch_clean_markdown(allUrls, { purpose: `Citizen question: ${clip(intent.english_query || text, 200)}`, state_code: intent.state_code ?? undefined });
    await emit("fetch", { pages: pages.map((p) => ({ url: p.url, title: p.title, cached: p.cached, chars: p.text.length, error: p.error ?? null })) });
  }
  const byUrl = new Map(pages.map((p) => [p.url, p]));

  /* ---- build sections ---- */
  const sections: Section[] = [];
  for (const r of resolved) {
    const { sub, scheme } = r;
    const base = { scheme_id: scheme.id, scheme_name: scheme.name, task: sub.task, diy: scheme.diy, benefit: scheme.benefit, cache: r.hit ? "hit" : "miss", portal_state: r.portalState } as const;
    if (sub.personal && (sub.task === "status" || sub.task === "land")) {
      await emit("stage", { stage: "confirm", message: `${scheme.name}: personal ${sub.task} check needs your consent before a paid agent run.` });
      const plan = await planConfirm(scheme, sub, intent, r.portalState, userId, intent.identifiers);
      const portal = r.row;
      const sec: Section = {
        ...base,
        status: "needs_confirmation",
        data: { input_fields: (portal?.selectors as { input_fields?: unknown } | undefined)?.input_fields ?? null, known_path: portal?.nav_path?.length ?? 0 },
        sources: [plan.entry_url],
        confirm: plan,
      };
      sections.push(sec);
      await emit("confirm_required", plan as unknown as Record<string, unknown>);
      await emit("section", sec as unknown as Record<string, unknown>);
      continue;
    }
    const urls = urlPlan.get(`${scheme.id}:${sub.task}`) ?? [];
    const ps = urls.map((u) => byUrl.get(u)).filter(Boolean) as FetchedPage[];
    const { data, status } = await extractSection(scheme, sub, ps, intent);
    const sec: Section = { ...base, status, data, sources: ps.filter((p) => p.text).map((p) => p.final_url ?? p.url).concat(ps.length ? [] : [scheme.entry]), excerpt_sources: ps.map((p) => ({ url: p.url, title: p.title, cached: p.cached, error: p.error })) };
    sections.push(sec);
    await emit("section", sec as unknown as Record<string, unknown>);
  }

  /* ---- synthesis + localisation ---- */
  await emit("stage", { stage: "synthesis", message: "Writing your Citizen Benefit Report…" });
  const { summary_en } = await synthesize({ query: text, intent, sections });
  let summary_local = summary_en;
  if (replyLang !== "en") {
    await emit("stage", { stage: "translate", message: `Translating into ${langByCode(replyLang).native}…` });
    summary_local = (await translate(summary_en, replyLang, { purpose: "translate_report" })).text;
  }
  const sources = [...new Set(sections.flatMap((s) => s.sources))].slice(0, 20);
  const cache_hits = sections.filter((s) => s.cache === "hit").length;
  const cache_misses = sections.length - cache_hits;
  const report_id = uuid();
  await safe(
    db.insert("benefit_reports", {
      id: report_id,
      user_id: userId,
      language: replyLang,
      query: redact(text),
      intent: { ...intent, identifiers: Object.keys(intent.identifiers) },
      sections: sections.map((s) => ({ ...s, data: JSON.parse(clip(JSON.stringify(s.data ?? null), 6000).replace(/…$/, "") || "null") ?? s.data })),
      summary_en,
      summary_local,
      sources,
      cost_usd: 0,
      cache_hits,
      cache_misses,
      created_at: nowIso(),
    }).catch(async () => db.insert("benefit_reports", { id: report_id, user_id: userId, language: replyLang, query: redact(text), intent: {}, sections: [], summary_en, summary_local, sources, cache_hits, cache_misses, created_at: nowIso() })),
    [],
  );
  await safe(sessions.put("chat", { summary_en, report_id }, 3600 * 6, { id: `chat_${userId}`.slice(0, 128), user_id: userId }), null);
  void logRun({ surface: "llm", purpose: "report", state_code: intent.state_code, cache: cache_misses ? "miss" : "hit", latency_ms: Date.now() - t0, meta: { sections: sections.length, via, lang: replyLang, channel: input.channel ?? "web" } });

  const result: AskResult = { report_id, language: replyLang, intent, intent_via: via, sections, summary_en, summary_local, sources, cache_hits, cache_misses, cost_usd: 0, elapsed_ms: Date.now() - t0 };
  await emit("report", { report_id, summary_en, summary_local, language: replyLang, sources, cache_hits, cache_misses, elapsed_ms: result.elapsed_ms });
  return result;
}

export async function getReport(id: string) {
  return safe(db.one("benefit_reports", { eq: { id } }), null);
}
