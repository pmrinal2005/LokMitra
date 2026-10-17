import "server-only";
import { tf } from "../tinyfish";
import { cfg } from "./config";
import { withPage, type PageSnapshot } from "./cdp";
import { db, safe, type Row } from "./db";
import { schemeById, stateByCode } from "./schemes";
import { logRun, sessions } from "./store";
import { hostOf, nowIso, seal, shortId, unseal } from "./util";

/**
 * OTP relay — Browser Context Profiles + CDP (docs: /agent-api/browser-context-profiles)
 * ------------------------------------------------------------------------------------
 *  1. POST /v1/profiles                        → short-lived profile "lokmitra-otp-…"
 *  2. POST /v1/profiles/{id}/setup-session     → { session_id, cdp_url, expires_at }
 *  3. LokMitra drives cdp_url: opens the official login/status page, pre-fills the
 *     citizen's identifiers, shows a screenshot (CAPTCHA) and relays the OTP the
 *     citizen just received on their phone — the citizen stays in control.
 *  4. POST /v1/profiles/{id}/save {session_id} → authenticated cookies captured
 *  5. Agent run with use_profile:true + profile_id → status extraction WITHOUT a paid
 *     login sequence; every follow-up within the OTP session validity reuses it.
 *  6. The profile is deleted at TinyFish on finish/cancel or by the cron after
 *     OTP_SESSION_TTL_SECONDS (no long-term credential storage).
 */

export interface RelayData extends Record<string, unknown> {
  profile_id: string;
  setup_session_id: string;
  cdp: string; // sealed cdp_url (never sent to the browser)
  setup_expires_at: string;
  scheme_id: string;
  state_code: string;
  task: "status" | "land";
  entry_url: string;
  sealed_ids: string;
  confirm_id?: string | null;
  saved?: boolean;
  saved_at?: string | null;
  cookie_count?: number;
  domains?: string[];
  language?: string;
  steps: number;
}

export interface RelayView {
  relay_id: string;
  profile_id: string;
  scheme_id: string;
  scheme_name: string;
  state_code: string;
  entry_url: string;
  saved: boolean;
  expires_at: string;
  snapshot?: PageSnapshot | null;
  autofilled?: string[];
  error?: string;
}

const LABEL_MAP: { key: string; re: RegExp }[] = [
  { key: "reg_no", re: /registration|reg\.? ?no|enrol/i },
  { key: "application_no", re: /application|policy/i },
  { key: "application_id", re: /application id|otr/i },
  { key: "mobile_or_aadhaar", re: /mobile|aadhaar|aadhar|phone/i },
  { key: "uan", re: /\buan\b|universal account/i },
  { key: "udyam_no", re: /udyam/i },
  { key: "account_no", re: /account/i },
];

function viewOf(id: string, d: RelayData, expires: string, extra: Partial<RelayView> = {}): RelayView {
  return { relay_id: id, profile_id: d.profile_id, scheme_id: d.scheme_id, scheme_name: schemeById(d.scheme_id)?.name ?? d.scheme_id, state_code: d.state_code, entry_url: d.entry_url, saved: !!d.saved, expires_at: expires, ...extra };
}

export async function deleteProfile(profileId: string) {
  try {
    await tf("agent", `/v1/profiles/${encodeURIComponent(profileId)}`, { method: "DELETE", timeoutMs: 20_000 });
  } catch (e) {
    if (!/404|not.?found/i.test((e as Error).message)) throw e;
  }
  await safe(db.update("ephemeral_profiles", { profile_id: profileId }, { deleted_at: nowIso() }), []);
}

/** Start a relay from a confirmation gate (preferred) or an explicit scheme/state. */
export async function startRelay(opts: { confirm_id?: string; scheme_id?: string; state_code?: string; identifiers?: Record<string, string>; user_id?: string | null }): Promise<RelayView> {
  let schemeId = opts.scheme_id ?? "";
  let state = opts.state_code ?? "IN";
  let task: "status" | "land" = "status";
  let entry = "";
  let ids: Record<string, string> = { ...(opts.identifiers ?? {}) };
  let language = "en";
  if (opts.confirm_id) {
    const c = await sessions.get<{ scheme_id: string; state_code: string; task: "status" | "land"; entry_url: string; sealed: string; language?: string }>(opts.confirm_id);
    if (!c) throw Object.assign(new Error("Confirmation expired — ask again."), { status: 410 });
    schemeId = c.data.scheme_id;
    state = c.data.state_code;
    task = c.data.task;
    entry = c.data.entry_url;
    language = c.data.language ?? "en";
    ids = { ...(unseal<Record<string, string>>(c.data.sealed) ?? {}), ...ids };
  }
  const scheme = schemeById(schemeId);
  if (!scheme) throw Object.assign(new Error("unknown scheme"), { status: 400 });
  if (!entry) entry = task === "land" ? stateByCode(state).land ?? scheme.entry : scheme.statusUrl ?? scheme.entry;

  const ttl = cfg.otpSessionTtlSec();
  const t0 = Date.now();
  const prof = await tf<{ id: string; name: string }>("agent", "/v1/profiles", { method: "POST", body: { name: `lokmitra-otp-${scheme.id}-${shortId(6)}`.slice(0, 100), set_as_default: false, proxy_country_code: "IN" }, timeoutMs: 20_000 });
  await safe(db.insert("ephemeral_profiles", { profile_id: prof.id, user_id: opts.user_id ?? null, scheme_id: scheme.id, state_code: state, purpose: "otp_relay", expires_at: new Date(Date.now() + ttl * 1000).toISOString(), created_at: nowIso() }, { onConflict: "profile_id" }), []);
  let setup: { session_id: string; cdp_url: string; base_url: string; timeout_seconds: number; expires_at: string };
  try {
    setup = await tf("agent", `/v1/profiles/${prof.id}/setup-session`, { method: "POST", body: { url: entry, timeout_seconds: Math.min(ttl, 1800) }, timeoutMs: 60_000 });
  } catch (e) {
    await deleteProfile(prof.id).catch(() => null);
    throw e;
  }
  const data: RelayData = { profile_id: prof.id, setup_session_id: setup.session_id, cdp: seal(setup.cdp_url), setup_expires_at: setup.expires_at, scheme_id: scheme.id, state_code: state, task, entry_url: entry, sealed_ids: seal(ids), confirm_id: opts.confirm_id ?? null, saved: false, language, steps: 0 };
  const sess = await sessions.put("otp", data, ttl, { user_id: opts.user_id ?? null });
  void logRun({ surface: "browser", purpose: "otp_relay_start", scheme_id: scheme.id, state_code: state, run_id: setup.session_id, latency_ms: Date.now() - t0, meta: { host: hostOf(entry), profile: prof.id } });

  // open + auto-fill identifiers (citizen still types CAPTCHA/OTP and clicks)
  let snapshot: PageSnapshot | null = null;
  const autofilled: string[] = [];
  let error: string | undefined;
  try {
    snapshot = await withPage(setup.cdp_url, async (p) => {
      if (!(await p.eval<string>("location.href")).startsWith("http")) await p.navigate(entry);
      else await p.waitIdle(8000);
      let s = await p.scan(false);
      for (const f of s.fields.filter((x) => x.kind === "text")) {
        const m = LABEL_MAP.find((l) => l.re.test(f.label) && ids[l.key]);
        if (m && !f.value) {
          await p.fill(f.idx, ids[m.key]);
          autofilled.push(f.label);
        }
      }
      s = await p.scan(true);
      return s;
    });
  } catch (e) {
    error = `browser connected but page control failed: ${(e as Error).message}`;
  }
  return viewOf(sess.id, data, sess.expires_at, { snapshot, autofilled, error });
}

async function load(relayId: string) {
  const s = await sessions.get<RelayData>(relayId);
  if (!s || s.kind !== "otp") throw Object.assign(new Error("Relay session expired or not found."), { status: 410 });
  return s;
}

export type RelayAction = { op: "fill"; idx: number; value: string } | { op: "click"; idx: number } | { op: "navigate"; url: string } | { op: "scan" };

/** Apply citizen actions (CAPTCHA text, OTP, button clicks) and return a fresh snapshot. */
export async function relayAct(relayId: string, actions: RelayAction[]): Promise<RelayView> {
  const s = await load(relayId);
  if (s.data.saved) return viewOf(relayId, s.data, s.expires_at, { error: "already saved — run the status check" });
  const cdpUrl = unseal<string>(s.data.cdp);
  if (!cdpUrl) throw new Error("relay key rotated — start again");
  const snapshot = await withPage(cdpUrl, async (p) => {
    for (const a of actions.slice(0, 12)) {
      if (a.op === "fill") await p.fill(a.idx, String(a.value).slice(0, 200));
      else if (a.op === "click") await p.click(a.idx);
      else if (a.op === "navigate" && /^https?:\/\//.test(a.url)) await p.navigate(a.url);
    }
    return p.scan(true);
  });
  await sessions.patch<RelayData>(relayId, { steps: (s.data.steps ?? 0) + actions.length });
  return viewOf(relayId, s.data, s.expires_at, { snapshot });
}

/** Save the logged-in state into the Browser Context Profile. */
export async function relaySave(relayId: string): Promise<RelayView & { cookie_count: number; domains: string[] }> {
  const s = await load(relayId);
  if (s.data.saved) return { ...viewOf(relayId, s.data, s.expires_at), cookie_count: s.data.cookie_count ?? 0, domains: s.data.domains ?? [] };
  const res = await tf<{ domains_updated: string[]; cookie_count: number }>("agent", `/v1/profiles/${s.data.profile_id}/save`, {
    method: "POST",
    body: { session_id: s.data.setup_session_id, signed_in_sites: [hostOf(s.data.entry_url)].filter(Boolean) },
    timeoutMs: 60_000,
  });
  const patch = { saved: true, saved_at: nowIso(), cookie_count: res.cookie_count ?? 0, domains: res.domains_updated ?? [] };
  const next = await sessions.patch<RelayData>(relayId, patch);
  void logRun({ surface: "browser", purpose: "otp_relay_saved", scheme_id: s.data.scheme_id, state_code: s.data.state_code, run_id: s.data.setup_session_id, meta: { cookies: res.cookie_count, domains: res.domains_updated } });
  return { ...viewOf(relayId, (next?.data ?? { ...s.data, ...patch }) as RelayData, s.expires_at), cookie_count: patch.cookie_count, domains: patch.domains };
}

export async function relayCancel(relayId: string) {
  const s = await sessions.get<RelayData>(relayId);
  if (!s) return { cancelled: true };
  if (!s.data.saved) await tf("agent", `/v1/profiles/${s.data.profile_id}/setup-session/cancel`, { method: "POST", body: { session_id: s.data.setup_session_id }, timeoutMs: 20_000 }).catch(() => null);
  await deleteProfile(s.data.profile_id).catch(() => null);
  await sessions.del(relayId);
  return { cancelled: true, profile_deleted: s.data.profile_id };
}

export async function relayGet(relayId: string) {
  const s = await load(relayId);
  return { session: s, view: viewOf(relayId, s.data, s.expires_at) };
}

/** Cron: delete every expired LokMitra OTP profile at TinyFish. */
export async function purgeExpiredProfiles(): Promise<{ deleted: string[]; errors: string[] }> {
  const rows = await safe(db.select<Row>("ephemeral_profiles", { eq: { deleted_at: null }, lt: { col: "expires_at", val: nowIso() }, limit: 50 }), []);
  const deleted: string[] = [];
  const errors: string[] = [];
  for (const r of rows) {
    try {
      await deleteProfile(String(r.profile_id));
      deleted.push(String(r.profile_id));
    } catch (e) {
      errors.push(`${r.profile_id}: ${(e as Error).message}`);
    }
  }
  return { deleted, errors };
}
