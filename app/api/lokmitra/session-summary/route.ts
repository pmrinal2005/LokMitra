import { sanitizeUserId } from "@/lib/lokmitra/auth";
import { db, safe, type Row } from "@/lib/lokmitra/db";
import { json } from "@/lib/lokmitra/http";
import { overlayAgentResults, type OverlayAgentResult, type StructuredReport } from "@/lib/lokmitra/report-shape";
import { hostOf } from "@/lib/lokmitra/util";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/lokmitra/session-summary?user_id=web:xxxx[&limit=20]
 * Aggregates the citizen's own benefit_reports (no TinyFish call, $0) into:
 *   - snapshot : schemes checked, verdict counts, likely-eligible list, deadlines, next actions, agent checks
 *   - sources  : de-duplicated official URLs that were READ LIVE for this citizen, with host, kind
 *                (official .gov.in / .nic.in / other), which schemes cited them and when they were last read
 *   - latest   : the most recent report (id, query, language, structured) so the journey can resume after reload
 * Feeds the BenefitSnapshot + VerifiedSource cards on the Command Deck.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const uid = sanitizeUserId(sp.get("user_id"));
  if (!uid) return json({ error: { code: "BAD_REQUEST", message: "valid user_id required (web:|csc:|tg:…)" } }, 400);
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 20, 1), 50);
  const rows = await safe(db.select<Row>("benefit_reports", { eq: { user_id: uid }, order: { col: "created_at" }, limit }), []);
  return json(summarize(rows, uid));
}

interface SchemeAgg { scheme_id: string; scheme_name: string; sector: string; verdict: string; status: string; benefit: string | null; deadline: string | null; last_seen: string; report_id: string; agent_status: string | null; url: string | null }
interface SourceAgg { url: string; host: string; kind: "official" | "other"; schemes: string[]; reports: number; last_read: string; title: string | null; latency_ms: number | null; ok: boolean }

const OFFICIAL = /(\.gov\.in|\.nic\.in|\.gov|india\.gov\.in|myscheme\.gov\.in)$/i;

function summarize(rows: Row[], uid: string) {
  const schemes = new Map<string, SchemeAgg>();
  const sources = new Map<string, SourceAgg>();
  const deadlines: { scheme_id: string; scheme_name: string; text: string; source: string | null; seen: string }[] = [];
  const actions = new Map<string, { text: string; text_local?: string; url: string | null; priority: number; scheme_id: string | null }>();
  let agentChecks = 0;
  let liveCalls = { search: 0, fetch_urls: 0, fetch_ok: 0 };
  const languages = new Set<string>();

  // rows are newest-first; iterate oldest → newest so newer facts overwrite older ones
  for (const r of [...rows].reverse()) {
    const created = String(r.created_at ?? "");
    const reportId = String(r.id);
    languages.add(String(r.language ?? "en"));
    const lc = (r.live_calls ?? {}) as Record<string, number>;
    liveCalls = { search: liveCalls.search + (lc.search ?? 0), fetch_urls: liveCalls.fetch_urls + (lc.fetch_urls ?? 0), fetch_ok: liveCalls.fetch_ok + (lc.fetch_ok ?? 0) };
    const agentResults = (Array.isArray(r.agent_results) ? r.agent_results : []) as OverlayAgentResult[];
    agentChecks += agentResults.length;
    const structured = r.structured ? overlayAgentResults(r.structured as StructuredReport, agentResults) : null;

    // live page metadata from sections.excerpt_sources (title, latency, error)
    const pageMeta = new Map<string, { title: string | null; latency_ms: number | null; error?: string }>();
    for (const s of (Array.isArray(r.sections) ? r.sections : []) as Row[]) {
      for (const e of (Array.isArray(s.excerpt_sources) ? s.excerpt_sources : []) as Row[]) pageMeta.set(String(e.url), { title: (e.title as string) ?? null, latency_ms: (e.latency_ms as number) ?? null, error: e.error as string | undefined });
    }

    if (structured) {
      for (const sec of structured.sectors) {
        for (const it of sec.items) {
          const dl = it.facts.find((f) => f.key === "deadline");
          const ben = it.facts.find((f) => f.key === "benefit");
          schemes.set(`${it.scheme_id}:${it.task}`, {
            scheme_id: it.scheme_id,
            scheme_name: it.scheme_name,
            sector: sec.id,
            verdict: it.verdict,
            status: it.status,
            benefit: ben?.value ?? null,
            deadline: dl?.value ?? null,
            last_seen: created,
            report_id: reportId,
            agent_status: it.agent?.registration_status ?? it.agent?.status ?? null,
            url: it.sources[0] ?? null,
          });
          if (dl) deadlines.push({ scheme_id: it.scheme_id, scheme_name: it.scheme_name, text: dl.value, source: it.sources[0] ?? null, seen: created });
          for (const u of it.sources) {
            const prev = sources.get(u);
            const meta = pageMeta.get(u);
            const h = hostOf(u);
            sources.set(u, {
              url: u,
              host: h,
              kind: OFFICIAL.test(h) ? "official" : "other",
              schemes: [...new Set([...(prev?.schemes ?? []), it.scheme_name])],
              reports: (prev?.reports ?? 0) + 1,
              last_read: created,
              title: meta?.title ?? prev?.title ?? null,
              latency_ms: meta?.latency_ms ?? prev?.latency_ms ?? null,
              ok: meta ? !meta.error : prev?.ok ?? true,
            });
          }
        }
      }
      for (const n of structured.next_steps) actions.set(n.text, { text: n.text, text_local: n.text_local, url: n.url ?? null, priority: n.priority, scheme_id: n.scheme_id ?? null });
    } else {
      for (const u of (Array.isArray(r.sources) ? r.sources : []) as string[]) {
        const h = hostOf(u);
        const prev = sources.get(u);
        sources.set(u, { url: u, host: h, kind: OFFICIAL.test(h) ? "official" : "other", schemes: prev?.schemes ?? [], reports: (prev?.reports ?? 0) + 1, last_read: created, title: prev?.title ?? null, latency_ms: null, ok: true });
      }
    }
  }

  const list = [...schemes.values()].sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  const count = (v: string) => list.filter((s) => s.verdict === v).length;
  const dedupDeadlines = [...new Map(deadlines.reverse().map((d) => [d.scheme_id, d])).values()];
  const latest = rows[0]
    ? { report_id: String(rows[0].id), query: String(rows[0].query ?? ""), language: String(rows[0].language ?? "en"), created_at: String(rows[0].created_at ?? ""), structured: (rows[0].structured as StructuredReport) ?? null, summary_local: String(rows[0].summary_local ?? ""), summary_en: String(rows[0].summary_en ?? "") }
    : null;

  return {
    user_id: uid.replace(/:(.{2}).*(.{2})$/, ":$1…$2"),
    reports: rows.length,
    languages: [...languages],
    snapshot: {
      schemes: list,
      counts: { total: list.length, likely: count("likely"), check: count("check"), unlikely: count("unlikely"), info: count("na") },
      likely: list.filter((s) => s.verdict === "likely").map((s) => s.scheme_name),
      deadlines: dedupDeadlines.slice(0, 8),
      actions: [...actions.values()].sort((a, b) => a.priority - b.priority).slice(0, 6),
      agent_checks: agentChecks,
      live_calls: liveCalls,
    },
    sources: [...sources.values()].sort((a, b) => (a.kind === b.kind ? b.last_read.localeCompare(a.last_read) : a.kind === "official" ? -1 : 1)).slice(0, 30),
    latest,
    generated_at: new Date().toISOString(),
  };
}
