import "server-only";
import { tf, type TfMonitor } from "../tinyfish";
import { cfg } from "./config";
import { db, safe, type Row } from "./db";
import { extractFromMarkdown, translate } from "./groq";
import { create_monitor, fetch_clean_markdown, rates, run_monitor_now, search_schemes } from "./ops";
import { usefulText } from "./extract";
import { resolvePortalLive } from "./portal";
import { schemeById, stateByCode } from "./schemes";
import { logRun } from "./store";
import { clip, hostOf, isGovHost, nowIso, sha256, uniq } from "./util";
import { sendEmail } from "./email";
import { tgSend } from "./telegram";
import { factCheck, type FactResult } from "./facts";

/**
 * Deadline, Circular & Compliance Sentinel — TinyFish Monitor (never Agent).
 * One Monitor per (scheme × state × kind):
 *   deadline   → Page Monitor (type "fetch") on the scheme's notice/deadline page
 *   circular   → Topic Monitor (type "search") for new GR / circular PDFs
 *   compliance → Page Monitor on the guideline page; diffs are checked against the live
 *                guideline facts (deterministic + Groq) to flag guideline-vs-portal contradictions
 * Scheduled runs POST to /api/webhooks/monitor → fan-out to every subscribed citizen.
 */

export type SentinelKind = "deadline" | "circular" | "compliance";

export interface SentinelRow {
  id?: string;
  monitor_id: string;
  monitor_type: "fetch" | "search";
  scheme_id: string;
  state_code: string;
  kind: SentinelKind;
  target: string;
  schedule_cron: string;
  purpose?: string | null;
  last_run_at?: string | null;
  last_change?: Record<string, unknown> | null;
  created_at?: string;
}

function hookUrl() {
  const base = cfg.publicBaseUrl();
  if (!base) return undefined;
  const s = cfg.webhookSecret();
  return `${base}/api/webhooks/monitor${s ? `?s=${encodeURIComponent(s)}` : ""}`;
}

export async function listSentinels(): Promise<SentinelRow[]> {
  return (await safe(db.select<Row>("sentinels", { order: { col: "created_at" }, limit: 200 }), [])) as unknown as SentinelRow[];
}

export async function getSentinel(monitorId: string) {
  return (await safe(db.one<Row>("sentinels", { eq: { monitor_id: monitorId } }), null)) as unknown as SentinelRow | null;
}

/**
 * Choose the page a Page Monitor should watch — LIVE, at registration time (nothing reused later).
 * Many portals are JS shells for Fetch (e.g. myScheme returns only its footer), which would leave the
 * compliance fact-check with nothing to check. So: live portal Search (+ a gov-only guideline Search for
 * compliance) → one batched live Fetch of the candidates → first page with real content, preferring
 * pages on which the deterministic fact-check actually finds the guideline facts.
 */
export async function pickLiveTarget(schemeId: string, kind: SentinelKind, state: string): Promise<{ url: string; ranked: string[]; probed: { url: string; chars: number; facts: number; error?: string | null }[] }> {
  const scheme = schemeById(schemeId)!;
  const r = await resolvePortalLive(scheme.id, kind === "deadline" ? "deadline" : "info", { state });
  const extra =
    kind === "compliance"
      ? (await search_schemes(`${scheme.name} operational guidelines benefit eligibility official`, { purpose: `Official guideline page for ${scheme.name} (compliance sentinel)`, scheme_id: scheme.id, state_code: state })).hits
          .filter((h) => isGovHost(h.url))
          .map((h) => h.url)
      : [];
  const candidates = uniq([...r.portal.deep_links.map((l) => l.url), ...extra, ...scheme.infoLinks, scheme.entry]).slice(0, 10);
  const pages = await fetch_clean_markdown(candidates, { purpose: `LokMitra sentinel target probe for ${scheme.name} (${kind})`, scheme_id: scheme.id, state_code: state });
  const probed = candidates.map((u) => {
    const p = pages.find((x) => x.url === u);
    const text = p?.text ?? "";
    const facts = text ? factCheck(scheme.id, text, u).filter((f) => f.status !== "not_stated").length : 0;
    return { url: u, chars: text.length, facts, useful: usefulText(text), error: p?.error ?? null };
  });
  const withFacts = kind === "compliance" ? probed.filter((p) => p.useful && p.facts > 0).sort((a, b) => b.facts - a.facts) : [];
  const ranked = uniq([...withFacts.map((p) => p.url), ...probed.filter((p) => p.useful).map((p) => p.url)]);
  const fallback = r.portal.deep_links[0]?.url ?? scheme.entry;
  return { url: ranked[0] ?? fallback, ranked: ranked.length ? ranked.slice(0, 3) : [fallback], probed: probed.map(({ useful: _u, ...x }) => x) };
}

/** Register (or return the existing) Monitor for scheme × state × kind. */
export async function ensureSentinel(opts: { scheme_id: string; state_code?: string | null; kind: SentinelKind; schedule_cron?: string; target?: string }): Promise<{ sentinel: SentinelRow; created: boolean; baseline?: unknown }> {
  const scheme = schemeById(opts.scheme_id);
  if (!scheme) throw Object.assign(new Error("unknown scheme"), { status: 400 });
  const state = opts.state_code || "IN";
  const existing = await safe(db.one<Row>("sentinels", { eq: { scheme_id: scheme.id, state_code: state, kind: opts.kind } }), null);
  if (existing) return { sentinel: existing as unknown as SentinelRow, created: false };

  const st = stateByCode(state);
  const cron = opts.schedule_cron || cfg.sentinelCron();
  let type: "fetch" | "search";
  let config: Record<string, unknown>;
  let target: string;
  let purpose: string;
  let candidates: string[] = [];
  if (opts.kind === "circular") {
    type = "search";
    target = opts.target || `${scheme.name} new circular OR notification OR guidelines ${st.code === "IN" ? "" : st.name} ${new Date().getFullYear()}`.replace(/\s+/g, " ").trim();
    config = { query: target, recency_minutes: 60 * 24 * 14, result_limit: 10 };
    purpose = `A new official circular, GR, notification or guideline PDF is published for ${scheme.name}${st.code === "IN" ? "" : ` in ${st.name}`}.`;
  } else {
    type = "fetch";
    candidates = opts.target ? [opts.target] : (await pickLiveTarget(scheme.id, opts.kind, state)).ranked;
    target = candidates[0];
    config = { url: target, format: "markdown" };
    purpose =
      opts.kind === "deadline"
        ? `The enrollment / application last date, season window or deadline for ${scheme.name} changes or is extended.`
        : `Eligibility criteria, benefit amount, required documents or process for ${scheme.name} change (compare against the live portal).`;
  }
  const body: Parameters<typeof create_monitor>[0] = { type, name: `LokMitra · ${scheme.name} · ${st.code} · ${opts.kind}`.slice(0, 100), config, schedule_cron: cron, purpose };
  const hook = hookUrl();
  if (hook) body.webhook_url = hook;
  // The Monitor's own baseline fetch can fail where the probe succeeded (e.g. target_unreachable on a
  // large PDF) — either as an error or as status "failed". Never keep a dead watcher: delete it and
  // fall through to the next live-ranked page.
  const queue = candidates.length ? candidates : [target];
  let res: Awaited<ReturnType<typeof create_monitor>> | null = null;
  let lastErr: unknown = null;
  for (const url of queue) {
    target = url;
    if (type === "fetch") body.config = { url, format: "markdown" };
    try {
      res = await create_monitor(body);
    } catch (e) {
      lastErr = e;
      res = null;
      continue;
    }
    if (res.monitor.status !== "failed") break;
    await tf("agent", `/v1/monitors/${res.monitor.id}`, { method: "DELETE", timeoutMs: 20_000 }).catch(() => null);
    lastErr = new Error(`monitor baseline failed for ${url}`);
    res = null;
  }
  if (!res) throw lastErr instanceof Error ? lastErr : new Error("monitor create failed");
  const row: SentinelRow = { monitor_id: res.monitor.id, monitor_type: type, scheme_id: scheme.id, state_code: state, kind: opts.kind, target, schedule_cron: cron, purpose, last_run_at: nowIso(), last_change: null, created_at: nowIso() };
  await db.insert("sentinels", row as unknown as Row, { onConflict: "monitor_id" });
  const base = (res.run ?? {}) as PagePayload;
  const baseText = textOf(base);
  const baseFacts = type === "fetch" && baseText ? factCheck(scheme.id, baseText, target).filter((f) => f.status !== "not_stated") : [];
  await safe(db.insert("monitor_events", { monitor_id: row.monitor_id, run_id: (res.run as { id?: string } | undefined)?.id ?? null, source: "baseline", changed: false, summary: baseFacts.length ? `baseline captured · fact-check: ${factSummary(baseFacts)}` : "baseline captured", payload: { baseline: true, target, ...(baseText ? { hash: sha256(baseText), excerpt: baseText.slice(0, 6000) } : {}), facts: baseFacts }, created_at: nowIso() }), []);
  return { sentinel: row, created: true, baseline: res.run };
}

export async function deleteSentinel(monitorId: string) {
  try {
    await tf("agent", `/v1/monitors/${encodeURIComponent(monitorId)}`, { method: "DELETE", timeoutMs: 20_000 });
  } catch (e) {
    if (!/404|not.?found/i.test((e as Error).message)) throw e;
  }
  await safe(db.remove("sentinels", { eq: { monitor_id: monitorId } }), 0);
  await safe(db.remove("monitor_subscriptions", { eq: { monitor_id: monitorId } }), 0);
  return { deleted: true, monitor_id: monitorId };
}

export async function liveMonitors(): Promise<{ monitors: TfMonitor[]; error?: string }> {
  try {
    return await tf<{ monitors: TfMonitor[] }>("agent", "/v1/monitors", { timeoutMs: 15_000 });
  } catch (e) {
    return { monitors: [], error: (e as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/* Subscriptions                                                       */
/* ------------------------------------------------------------------ */
export async function subscribe(opts: { monitor_id: string; user_id: string; email?: string | null; channel?: "telegram" | "email" | "web" }) {
  const s = await getSentinel(opts.monitor_id);
  if (!s) throw Object.assign(new Error("unknown sentinel"), { status: 404 });
  await safe(db.insert("users", { id: opts.user_id, channel: opts.user_id.startsWith("tg:") ? "telegram" : opts.user_id.startsWith("email:") ? "email" : "web", language: "hi", email: opts.email ?? null, created_at: nowIso(), updated_at: nowIso() }, { onConflict: "id" }), []);
  const row = { monitor_id: opts.monitor_id, user_id: opts.user_id, scheme_id: s.scheme_id, state_code: s.state_code, kind: s.kind, channel: opts.channel ?? (opts.user_id.startsWith("tg:") ? "telegram" : opts.email ? "email" : "web"), email: opts.email ?? null, created_at: nowIso() };
  await db.insert("monitor_subscriptions", row, { onConflict: "monitor_id,user_id" });
  return row;
}

export async function unsubscribe(monitorId: string, userId: string) {
  return safe(db.remove("monitor_subscriptions", { eq: { monitor_id: monitorId, user_id: userId } }), 0);
}

export async function subscriptionsFor(monitorId: string) {
  return safe(db.select<Row>("monitor_subscriptions", { eq: { monitor_id: monitorId }, limit: 2000 }), []);
}

/* ------------------------------------------------------------------ */
/* Change detection + fan-out                                          */
/* ------------------------------------------------------------------ */
interface PagePayload {
  fetch_monitor_id?: string;
  search_monitor_id?: string;
  id?: string;
  is_baseline?: boolean;
  results?: { url?: string; title?: string | null; text?: unknown; position?: number; snippet?: string }[];
  new_result_positions?: number[];
  errors?: unknown[];
  query?: string;
}

function textOf(p: PagePayload) {
  return (p.results ?? []).map((r) => (typeof r.text === "string" ? r.text : r.text ? JSON.stringify(r.text) : `${r.title ?? ""} ${r.snippet ?? ""} ${r.url ?? ""}`)).join("\n").slice(0, 30_000);
}

async function prevHash(monitorId: string) {
  const ev = await safe(db.select<Row>("monitor_events", { eq: { monitor_id: monitorId }, order: { col: "created_at" }, limit: 5 }), []);
  for (const e of ev) {
    const h = (e.payload as Row | undefined)?.hash;
    if (typeof h === "string") return { hash: h, text: String((e.payload as Row).excerpt ?? "") };
  }
  return null;
}

/** Process a Monitor result (scheduled webhook or run-now) and fan out alerts if something changed. */
export async function processMonitorResult(payload: PagePayload, source: "webhook" | "run_now"): Promise<{ changed: boolean; summary: string; notified: number; monitor_id: string | null; facts?: FactResult[] }> {
  const monitorId = payload.fetch_monitor_id ?? payload.search_monitor_id ?? null;
  if (!monitorId) return { changed: false, summary: "no monitor id", notified: 0, monitor_id: null, facts: [] };
  const s = await getSentinel(monitorId);
  const text = textOf(payload);
  const hash = sha256(text);
  const prev = await prevHash(monitorId);
  let changed = false;
  let summary = "no change";
  if (payload.search_monitor_id) {
    const fresh = (payload.new_result_positions ?? []).map((pos) => payload.results?.find((r) => r.position === pos)).filter(Boolean) as NonNullable<PagePayload["results"]>;
    changed = fresh.length > 0;
    if (changed) summary = `New: ${fresh.slice(0, 3).map((r) => `${r.title} (${hostOf(r.url)})`).join(" · ")}`;
  } else if (!payload.is_baseline && prev && prev.hash !== hash) {
    changed = true;
    summary = "Official page changed";
    if (s && cfg.groqKey()) {
      const x = await extractFromMarkdown<{ what_changed?: string | null; deadline?: string | null; contradiction?: string | null }>({
        markdown: `PREVIOUS:\n${prev.text.slice(0, 5000)}\n\nCURRENT:\n${text.slice(0, 8000)}`,
        schemaHint: `{"what_changed":string|null,"deadline":string|null,"contradiction":string|null}`,
        question: `What changed on this ${schemeById(s.scheme_id)?.name ?? ""} ${s.kind} page? If kind is compliance, note any contradiction between the guideline and the live portal facts.`,
        purpose: "sentinel_diff",
      });
      if (x?.what_changed) summary = clip(x.what_changed, 400);
      if (x?.contradiction) summary += ` Guideline/portal contradiction: ${clip(x.contradiction, 240)}`;
      if (x?.deadline) summary += ` · Deadline: ${x.deadline}`;
    }
  }
  // Deterministic compliance fact-check (free, no LLM): guideline facts vs the live page text
  let facts: FactResult[] = [];
  if (s && !payload.search_monitor_id && text) {
    facts = factCheck(s.scheme_id, text, s.target.startsWith("http") ? s.target : null).filter((f) => f.status !== "not_stated");
    const bad = facts.filter((f) => f.status === "contradiction");
    if (bad.length && (s.kind === "compliance" || changed)) {
      const note = `Guideline/portal contradiction (deterministic): ${bad.map((f) => `${f.label} shows "${f.found}" vs guideline ${f.canonical}`).join("; ")}`;
      if (!summary.includes("deterministic")) summary = changed ? `${summary} ${note}` : note;
      if (s.kind === "compliance" && !changed) changed = !(await lastFactsHadSame(monitorId, bad));
    }
  }
  let notified = 0;
  if (changed && s) notified = await fanOut(s, summary);
  await safe(db.insert("monitor_events", { monitor_id: monitorId, run_id: payload.id ?? null, source, changed, summary: facts.length && summary === "no change" ? `no change · fact-check: ${factSummary(facts)}` : summary, payload: { hash, excerpt: text.slice(0, 6000), urls: (payload.results ?? []).map((r) => r.url).slice(0, 10), errors: payload.errors ?? [], facts }, notified, created_at: nowIso() }), []);
  if (s) await safe(db.update("sentinels", { monitor_id: monitorId }, { last_run_at: nowIso(), ...(changed ? { last_change: { summary, at: nowIso() } } : {}) }), []);
  // scheduled runs are billed per run ($0.005 + free Fetch/Search); run-now was already billed in run_monitor_now()
  const cost = source === "webhook" ? (await rates()).monitor : 0;
  void logRun({ surface: "monitor", purpose: `sentinel_${source}`, scheme_id: s?.scheme_id, state_code: s?.state_code, run_id: monitorId, cost_usd: cost, meta: { changed, notified } });
  return { changed, summary, notified, monitor_id: monitorId, facts };
}

function factSummary(f: FactResult[]) {
  return f.map((x) => `${x.label} ${x.status === "confirmed" ? "(confirmed)" : "(mismatch)"}`).join(" · ");
}

/** Avoid re-alerting the same standing contradiction on every scheduled run. */
async function lastFactsHadSame(monitorId: string, bad: FactResult[]) {
  const ev = await safe(db.select<Row>("monitor_events", { eq: { monitor_id: monitorId }, order: { col: "created_at" }, limit: 3 }), []);
  const prev = ev.map((e) => ((e.payload as Row | undefined)?.facts as FactResult[] | undefined) ?? []).find((f) => f.length);
  if (!prev) return false;
  return bad.every((b) => prev.some((p) => p.fact_id === b.fact_id && p.status === "contradiction" && p.found === b.found));
}

/* ------------------------------------------------------------------ */
/* Starter pack — one click registers the essential sentinels         */
/* ------------------------------------------------------------------ */
export const STARTER_PACK: { scheme_id: string; kind: SentinelKind; scope: "state" | "central"; why: string }[] = [
  { scheme_id: "pmfby", kind: "deadline", scope: "state", why: "Kharif / Rabi enrolment cut-off for your state" },
  { scheme_id: "nsp", kind: "deadline", scope: "central", why: "National Scholarship Portal last date" },
  { scheme_id: "pm-kisan", kind: "compliance", scope: "central", why: "₹6,000 / 3 instalments guideline vs live portal" },
  { scheme_id: "ayushman", kind: "compliance", scope: "central", why: "₹5 lakh cover guideline vs live portal" },
  { scheme_id: "pm-kisan", kind: "circular", scope: "central", why: "New PM-KISAN circulars / instalment notices" },
];

export async function starterPackPlan(state: string) {
  const r = await rates();
  const existing = await listSentinels();
  const items = STARTER_PACK.map((p) => {
    const st = p.scope === "state" ? state || "IN" : "IN";
    const ex = existing.find((e) => e.scheme_id === p.scheme_id && e.state_code === st && e.kind === p.kind);
    return { ...p, state_code: st, scheme_name: schemeById(p.scheme_id)?.name ?? p.scheme_id, exists: !!ex, monitor_id: ex?.monitor_id ?? null };
  });
  const toCreate = items.filter((i) => !i.exists).length;
  return { items, to_create: toCreate, est_cost_usd: Math.round(toCreate * r.monitor * 1000) / 1000, per_run_usd: r.monitor };
}

export async function registerStarterPack(state: string, opts: { user_id?: string | null; email?: string | null; schedule_cron?: string } = {}) {
  const plan = await starterPackPlan(state);
  const results: { scheme_id: string; kind: SentinelKind; state_code: string; created: boolean; monitor_id: string | null; error?: string }[] = [];
  for (const it of plan.items) {
    try {
      const r = await ensureSentinel({ scheme_id: it.scheme_id, state_code: it.state_code, kind: it.kind, schedule_cron: opts.schedule_cron });
      if (opts.user_id) await safe(subscribe({ monitor_id: r.sentinel.monitor_id, user_id: opts.user_id, email: opts.email ?? null }), null);
      results.push({ scheme_id: it.scheme_id, kind: it.kind, state_code: it.state_code, created: r.created, monitor_id: r.sentinel.monitor_id });
    } catch (e) {
      results.push({ scheme_id: it.scheme_id, kind: it.kind, state_code: it.state_code, created: false, monitor_id: null, error: (e as Error).message });
    }
  }
  return { plan, results, created: results.filter((r) => r.created).length };
}

async function fanOut(s: SentinelRow, summary: string): Promise<number> {
  const subs = await subscriptionsFor(s.monitor_id);
  const scheme = schemeById(s.scheme_id);
  const title = `${scheme?.name ?? s.scheme_id} (${stateByCode(s.state_code).name}) — ${s.kind} update`;
  const msgEn = `${title}\n\n${summary}\n\nSource: ${s.target.startsWith("http") ? s.target : scheme?.entry ?? ""}`;
  const byLang = new Map<string, string>();
  let n = 0;
  for (const sub of subs.slice(0, 500)) {
    const uid = String(sub.user_id ?? "");
    const user = await safe(db.one<Row>("users", { eq: { id: uid } }), null);
    const lang = String(user?.language ?? "hi");
    if (!byLang.has(lang)) byLang.set(lang, lang === "en" ? msgEn : (await translate(msgEn, lang, { purpose: "translate_alert" })).text);
    const text = byLang.get(lang)!;
    try {
      if (uid.startsWith("tg:") && cfg.telegramToken()) {
        await tgSend(uid.slice(3), text);
        n++;
      } else if ((sub.email || user?.email) && cfg.resendKey()) {
        await sendEmail({ to: String(sub.email || user?.email), subject: title, text, html: `<pre style="font-family:system-ui;white-space:pre-wrap">${escapeHtml(text)}</pre>` });
        n++;
      }
    } catch (e) {
      console.warn("[sentinel:fanout]", (e as Error).message);
    }
  }
  return n;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function runSentinelNow(idOrMonitorId: string) {
  // accept either the TinyFish monitor_id (UI) or the LokMitra sentinel row id
  let monitorId = idOrMonitorId;
  if (!(await getSentinel(monitorId))) {
    const row = (await safe(db.one<Row>("sentinels", { eq: { id: idOrMonitorId } }), null)) as unknown as SentinelRow | null;
    if (row?.monitor_id) monitorId = row.monitor_id;
  }
  const res = await run_monitor_now(monitorId);
  const run = (res.run ?? {}) as PagePayload & Record<string, unknown>;
  const s = await getSentinel(monitorId);
  const payload: PagePayload = s?.monitor_type === "search" ? { ...run, search_monitor_id: monitorId } : { ...run, fetch_monitor_id: monitorId };
  const processed = await processMonitorResult(payload, "run_now");
  return { run, processed };
}

export async function sentinelEvents(monitorId?: string, limit = 50) {
  return safe(db.select<Row>("monitor_events", { eq: monitorId ? { monitor_id: monitorId } : undefined, order: { col: "created_at" }, limit }), []);
}
