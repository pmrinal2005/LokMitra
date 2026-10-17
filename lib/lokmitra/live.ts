import "server-only";
import { tf } from "../tinyfish";
import { withPage, type PageSnapshot } from "./cdp";
import { cfg } from "./config";
import { rates } from "./ops";
import { logRun, sessions, type SessionRow } from "./store";
import { hostOf, nowIso, seal, unseal } from "./util";

/**
 * Live browser control — TinyFish Browser API (POST api.browser.tinyfish.ai → { session_id, cdp_url, base_url })
 * driven over CDP from serverless routes. Used for:
 *   - the judge-facing "watch live" panel (screenshots refreshed on demand)
 *   - direct session control for Bhulekh / land-record edge cases (fill dropdown, click, navigate)
 *   - Browser Context Profile setup sessions started from /api/tinyfish/profiles/:id/setup-session
 * The raw cdp_url never leaves the server — it is sealed (AES-GCM) inside a "browser" session row;
 * the browser only ever sees an opaque handle (browser_<uuid>).
 * Billing: Browser is metered per minute — we log the estimated cost when a session ends.
 */

export interface LiveData extends Record<string, unknown> {
  kind: "browser_api" | "profile_setup";
  session_id: string;
  profile_id?: string | null;
  cdp: string; // sealed cdp_url
  base_url?: string | null;
  url?: string | null;
  started: number;
  label?: string | null;
  actions?: number;
  last_url?: string | null;
  last_title?: string | null;
  ended?: boolean;
}

export interface LiveView {
  handle: string;
  kind: LiveData["kind"];
  session_id: string;
  profile_id: string | null;
  label: string | null;
  url: string | null;
  last_url: string | null;
  last_title: string | null;
  started_at: string;
  expires_at: string;
  minutes: number;
  est_cost_usd: number;
  actions: number;
  snapshot?: PageSnapshot | null;
  error?: string;
}

function minutesOf(d: LiveData) {
  return Math.max(0, (Date.now() - Number(d.started || Date.now())) / 60_000);
}

async function viewOf(row: SessionRow<LiveData>, extra: Partial<LiveView> = {}): Promise<LiveView> {
  const d = row.data;
  const r = await rates();
  const minutes = minutesOf(d);
  return {
    handle: row.id,
    kind: d.kind,
    session_id: d.session_id,
    profile_id: d.profile_id ?? null,
    label: d.label ?? null,
    url: d.url ?? null,
    last_url: d.last_url ?? null,
    last_title: d.last_title ?? null,
    started_at: new Date(Number(d.started)).toISOString(),
    expires_at: row.expires_at,
    minutes: Math.round(minutes * 10) / 10,
    est_cost_usd: Math.round(Math.max(1, Math.ceil(minutes)) * r.browserPerMin * 10000) / 10000,
    actions: d.actions ?? 0,
    ...extra,
  };
}

export async function listLive(): Promise<LiveView[]> {
  const rows = (await sessions.list("browser", 50)) as unknown as SessionRow<LiveData>[];
  return Promise.all(rows.filter((r) => !r.data.ended).map((r) => viewOf(r)));
}

async function load(handle: string) {
  const s = await sessions.get<LiveData>(handle);
  if (!s || s.kind !== "browser" || s.data.ended) throw Object.assign(new Error("Live session expired or not found."), { status: 410 });
  return s;
}

/** Create a TinyFish Browser API session, open `url`, return a first snapshot. */
export async function startLive(opts: { url?: string | null; timeout_seconds?: number; label?: string | null }): Promise<LiveView> {
  const timeout = Math.min(Math.max(Number(opts.timeout_seconds) || 300, 30), 1800);
  const t0 = Date.now();
  const body: Record<string, unknown> = { timeout_seconds: timeout };
  if (opts.url) body.url = opts.url;
  const r = await tf<{ session_id: string; cdp_url: string; base_url: string }>("browser", "/", { method: "POST", body, timeoutMs: 55_000 });
  const data: LiveData = { kind: "browser_api", session_id: r.session_id, cdp: seal(r.cdp_url), base_url: r.base_url, url: opts.url ?? null, started: Date.now(), label: opts.label ?? null, actions: 0 };
  const row = await sessions.put("browser", data, timeout + 60);
  void logRun({ surface: "browser", purpose: "live_start", run_id: r.session_id, status: "running", latency_ms: Date.now() - t0, meta: { host: hostOf(opts.url ?? ""), timeout } });
  let snapshot: PageSnapshot | null = null;
  let error: string | undefined;
  try {
    snapshot = await withPage(r.cdp_url, async (p) => {
      if (opts.url) {
        const href = await p.eval<string>("location.href").catch(() => "about:blank");
        if (!href.startsWith("http")) await p.navigate(opts.url);
        else await p.waitIdle(6000);
      }
      return p.scan(true);
    });
    await sessions.patch<LiveData>(row.id, { last_url: snapshot.url, last_title: snapshot.title });
  } catch (e) {
    error = `browser created but CDP control failed: ${(e as Error).message}`;
  }
  return viewOf({ ...row, data: { ...data, last_url: snapshot?.url ?? null, last_title: snapshot?.title ?? null } } as SessionRow<LiveData>, { snapshot, error });
}

export type LiveAction = { op: "navigate"; url: string } | { op: "fill"; idx: number; value: string } | { op: "click"; idx: number } | { op: "scan" } | { op: "eval_text" };

/** Apply actions (navigate / fill / click / scan) and return a fresh screenshot + field list. */
export async function actLive(handle: string, actions: LiveAction[]): Promise<LiveView> {
  const s = await load(handle);
  const cdpUrl = unseal<string>(s.data.cdp);
  if (!cdpUrl) throw Object.assign(new Error("session key rotated — start a new live session"), { status: 410 });
  const snapshot = await withPage(cdpUrl, async (p) => {
    for (const a of actions.slice(0, 12)) {
      if (a.op === "navigate" && /^https?:\/\//.test(a.url)) await p.navigate(a.url);
      else if (a.op === "fill") await p.fill(a.idx, String(a.value).slice(0, 300));
      else if (a.op === "click") await p.click(a.idx);
    }
    return p.scan(true);
  });
  const next = await sessions.patch<LiveData>(handle, { actions: (s.data.actions ?? 0) + actions.length, last_url: snapshot.url, last_title: snapshot.title });
  return viewOf((next ?? s) as SessionRow<LiveData>, { snapshot });
}

/** Terminate: Browser API → DELETE /{session_id}; profile setup → setup-session/cancel. Logs metered cost. */
export async function stopLive(handle: string): Promise<{ stopped: true; minutes: number; cost_usd: number }> {
  const s = await sessions.get<LiveData>(handle);
  if (!s) return { stopped: true, minutes: 0, cost_usd: 0 };
  const d = s.data;
  const minutes = minutesOf(d);
  const r = await rates();
  const cost = d.kind === "browser_api" ? Math.max(1, Math.ceil(minutes)) * r.browserPerMin : 0;
  try {
    if (d.kind === "browser_api") await tf("browser", `/${encodeURIComponent(d.session_id)}`, { method: "DELETE", timeoutMs: 20_000 });
    else if (d.profile_id) await tf("agent", `/v1/profiles/${d.profile_id}/setup-session/cancel`, { method: "POST", body: { session_id: d.session_id }, timeoutMs: 20_000 });
  } catch (e) {
    if (!/404|not.?found|already/i.test((e as Error).message)) console.warn("[lokmitra:live] stop:", (e as Error).message);
  }
  await sessions.del(handle);
  void logRun({ surface: "browser", purpose: d.kind === "browser_api" ? "live_stop" : "profile_setup_cancel", run_id: d.session_id, cost_usd: cost, meta: { minutes: Math.round(minutes * 10) / 10, actions: d.actions ?? 0 } });
  return { stopped: true, minutes: Math.round(minutes * 10) / 10, cost_usd: Math.round(cost * 10000) / 10000 };
}

/** Save a profile setup session (from the Live page) into its Browser Context Profile. */
export async function saveLiveProfile(handle: string, signedInSites: string[] = []) {
  const s = await load(handle);
  if (s.data.kind !== "profile_setup" || !s.data.profile_id) throw Object.assign(new Error("not a profile setup session"), { status: 400 });
  const body: Record<string, unknown> = { session_id: s.data.session_id };
  const sites = signedInSites.length ? signedInSites : [hostOf(s.data.last_url ?? s.data.url ?? "")].filter(Boolean);
  if (sites.length) body.signed_in_sites = sites.slice(0, 20);
  const res = await tf<{ domains_updated: string[]; cookie_count: number }>("agent", `/v1/profiles/${s.data.profile_id}/save`, { method: "POST", body, timeoutMs: 60_000 });
  await sessions.patch<LiveData>(handle, { ended: true });
  await sessions.del(handle);
  void logRun({ surface: "browser", purpose: "profile_saved", run_id: s.data.session_id, meta: { cookies: res.cookie_count, domains: res.domains_updated } });
  return { saved: true, profile_id: s.data.profile_id, ...res, at: nowIso() };
}

export function liveConfigured() {
  return { tinyfish: !!process.env.TINYFISH_API_KEY, rate_fallback_per_min: cfg.browserRateFallback() };
}
