"use client";
import { useEffect, useState } from "react";
import { adminToken, api, setAdminToken } from "@/lib/client";
import { Flash, Json, PageHead, Panel, useAction, useApi } from "@/components/ui";
import { UsageInfrastructure } from "@/components/UsageInfrastructure";
import { useRole } from "@/hooks/useRole";
import { useT } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";

interface S {
  integrations: Record<string, boolean | string | null>;
  database: { ok: boolean; backend: string; error?: string } & Record<string, unknown>;
  wallet: { balance: string | null; error: string | null; rates: { step: number; browserPerMin: number; monitor: number; source: string }; raw_meters: { label: string; unit_amount: string; per?: string }[] };
  upstreams: Record<string, string>;
  execution: Record<string, string | number>;
  models: Record<string, string>;
  endpoints: Record<string, string> | null;
  sentinel_cron: string;
  registry: { schemes: number; states: number; languages: number };
  admin: { required: boolean; you_are_admin: boolean };
}
interface Health { ok: boolean; tinyfish_configured: boolean; upstreams: Record<string, string>; time: string }

const INT: { k: string; label: string; env: string; need: string }[] = [
  { k: "tinyfish", label: "TinyFish (Search · Fetch · Agent · Browser · Monitor)", env: "TINYFISH_API_KEY", need: "required" },
  { k: "groq", label: "Groq LLM (intent · synthesis · translation)", env: "GROQ_API_KEY", need: "recommended — heuristic fallback otherwise" },
  { k: "supabase", label: "Supabase Postgres (reports, audit log, sessions, sentinels — no cache)", env: "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY", need: "recommended — in-memory store resets per instance" },
  { k: "telegram", label: "Telegram bot", env: "TELEGRAM_BOT_TOKEN (+ TELEGRAM_WEBHOOK_SECRET)", need: "optional channel" },
  { k: "resend", label: "Resend e-mail", env: "RESEND_API_KEY (+ RESEND_FROM)", need: "optional channel" },
  { k: "admin_token", label: "Operator token", env: "ADMIN_TOKEN", need: "recommended in production (paid actions)" },
  { k: "cron_secret", label: "Cron secret", env: "CRON_SECRET", need: "recommended (Vercel Cron auth)" },
  { k: "session_secret", label: "Session sealing key", env: "SESSION_SECRET", need: "recommended (AES-GCM for identifiers / cdp_url)" },
  { k: "webhook_secret", label: "Webhook secret", env: "WEBHOOK_SECRET", need: "optional (defaults to CRON_SECRET)" },
];

export function Settings() {
  const { isOperator, ready, switchTo, error: roleError } = useRole();
  const { t } = useT();
  const [tok, setTok] = useState("");
  useEffect(() => setTok(adminToken()), []);
  if (!ready) return <div className="page"><p className="note">…</p></div>;
  if (!isOperator) {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <PageHead title={t("role_needed")} sub={t("role_needed_body")} />
        <Panel title="Operator token" sub="Paste ADMIN_TOKEN (if this deployment sets one), then switch to the operator view. Citizens never see wallet, usage or infrastructure data.">
          <div className="row">
            <input className="input" type="password" style={{ flex: 1 }} placeholder="ADMIN_TOKEN (leave empty in open demo mode)" value={tok} onChange={(e) => setTok(e.target.value)} />
            <button className="btn primary" onClick={async () => { setAdminToken(tok.trim()); await switchTo("operator"); }}>{t("role_switch_operator")}</button>
          </div>
          {roleError && <p className="note err"><Icon name="alert" /> {roleError}</p>}
        </Panel>
      </div>
    );
  }
  return <OperatorSettings />;
}

function OperatorSettings() {
  const [tab, setTab] = useState<"integrations" | "usage">(() => (typeof window !== "undefined" && window.location.hash === "#usage" ? "usage" : "integrations"));
  // deep links (nav "Wallet" pill, sidebar wallet footer) may only change the hash on an already-open page
  useEffect(() => {
    const sync = () => setTab(window.location.hash === "#usage" ? "usage" : "integrations");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const { t } = useT();
  const s = useApi<S>("/api/lokmitra/settings");
  const h = useApi<Health>("/api/health");
  const act = useAction();
  const [tok, setTok] = useState("");
  const [tg, setTg] = useState<Record<string, unknown> | null>(null);
  const [cron, setCron] = useState<Record<string, unknown> | null>(null);
  const [verify, setVerify] = useState<{ name: string; ok: boolean; note: string; ms: number }[] | null>(null);

  useEffect(() => setTok(adminToken()), []);

  const saveTok = () => {
    setAdminToken(tok.trim());
    act.setNotice(tok.trim() ? "Operator token saved in this browser" : "Operator token cleared");
    void s.reload();
  };
  const tgStatus = () => act.run("Reading Telegram bot + webhook", () => api<Record<string, unknown>>("/api/telegram/setup"), (r) => void setTg(r));
  const tgSetup = () => act.run("Registering Telegram webhook + commands", () => api<Record<string, unknown>>("/api/telegram/setup", { body: {} }), (r) => (setTg(r), "webhook registered"));
  const runCron = () => act.run("Running nightly maintenance now (purge expired sessions + OTP profiles)", () => api<Record<string, unknown>>("/api/cron/maintenance", { method: "POST" }), (r) => (setCron(r), "maintenance finished"));

  /** In-browser live probe of the free + read-only TinyFish endpoints through this deployment. */
  const probe = async () => {
    const out: { name: string; ok: boolean; note: string; ms: number }[] = [];
    const step = async (name: string, fn: () => Promise<string>) => {
      const t0 = performance.now();
      try {
        out.push({ name, ok: true, note: await fn(), ms: Math.round(performance.now() - t0) });
      } catch (e) {
        out.push({ name, ok: false, note: (e as Error).message, ms: Math.round(performance.now() - t0) });
      }
      setVerify([...out]);
    };
    setVerify([]);
    await step("Agent · GET /v1/wallet", async () => { const w = await api<{ available_balance: string }>("/api/tinyfish/wallet"); return `$${w.available_balance}`; });
    await step("Agent · GET /v1/runs", async () => { const r = await api<{ pagination: { total: number } }>("/api/tinyfish/runs?limit=1"); return `${r.pagination.total} runs`; });
    await step("Agent · GET /v1/profiles", async () => { const r = await api<{ profiles: unknown[] }>("/api/tinyfish/profiles"); return `${r.profiles?.length ?? 0} profiles`; });
    await step("Monitor · GET /v1/monitors", async () => { const r = await api<{ monitors: unknown[] }>("/api/tinyfish/monitors"); return `${r.monitors.length} monitors`; });
    await step("Search · GET / (free)", async () => { const r = await api<{ results: { url: string }[] }>(`/api/tinyfish/search?query=${encodeURIComponent("PM Kisan beneficiary status official")}&location=IN&language=en`); return `${r.results.length} results · ${r.results[0]?.url ?? "-"}`; });
    await step("Fetch · POST / (free)", async () => { const r = await api<{ results: { title: string | null }[]; errors: unknown[] }>("/api/tinyfish/fetch", { body: { urls: ["https://pmkisan.gov.in/"], format: "markdown" } }); return `${r.results.length} ok · ${r.errors.length} err · “${r.results[0]?.title ?? ""}”`; });
    for (const k of ["search", "fetch", "browser"]) await step(`${k} · GET /usage`, async () => { const r = await api<{ total: number }>(`/api/tinyfish/usage/${k}?limit=1`); return `${r.total} total`; });
  };

  const d = s.data;
  return (
    <div className="page">
      <PageHead title="Settings" sub="Integration health (no secret values are ever returned), execution guards, operator token, Telegram webhook, cron and a live endpoint probe.">
        {d && <span className={`chip ${d.admin.you_are_admin ? "hit" : "miss"}`}>{d.admin.required ? (d.admin.you_are_admin ? "operator verified" : "operator token needed") : "open demo mode"}</span>}
      </PageHead>
      <Flash {...act} />
      <div className="mode-switch settings-tabs" role="tablist" aria-label="Settings sections">
        <button role="tab" className="mode-btn" aria-selected={tab === "integrations"} aria-pressed={tab === "integrations"} onClick={() => { setTab("integrations"); history.replaceState(null, "", "#integrations"); }}>{t("tab_integrations")}</button>
        <button role="tab" className="mode-btn" aria-selected={tab === "usage"} aria-pressed={tab === "usage"} onClick={() => { setTab("usage"); history.replaceState(null, "", "#usage"); }}>{t("tab_usage")}</button>
      </div>
      {tab === "usage" ? <UsageInfrastructure /> : <>
      {s.error && <p className="note err"><Icon name="alert" /> {s.error}</p>}

      <div className="grid-2">
        <Panel title="Integrations" sub="Set these in Vercel → Project → Settings → Environment Variables.">
          <div className="stack" style={{ gap: 6 }}>
            {INT.map((i) => {
              const on = !!d?.integrations[i.k];
              return (
                <div key={i.k} className="pf-field" style={{ gridTemplateColumns: "auto 1fr auto" }}>
                  <span className={`chip ${on ? "hit" : "miss"}`}>{on ? "ON" : "OFF"}</span>
                  <span>
                    <b style={{ fontSize: 13 }}>{i.label}</b>
                    <br />
                    <span className="k">{i.env}</span>
                  </span>
                  <span className="note">{on ? "" : i.need}</span>
                </div>
              );
            })}
            <div className="note">Public base URL: <code>{String(d?.integrations.public_base_url ?? "— (set PUBLIC_BASE_URL or rely on VERCEL_URL)")}</code></div>
            <div className="note">Database: <b>{d?.database.backend ?? "…"}</b> {d?.database.ok ? <Icon name="check" /> : d?.database.error ? <><Icon name="x" /> {d.database.error}</> : null}</div>
            <div className="note">Server key check: {h.data ? (h.data.tinyfish_configured ? <><Icon name="check" /> TINYFISH_API_KEY present</> : <><Icon name="x" /> TINYFISH_API_KEY missing</>) : "…"}</div>
          </div>
        </Panel>

        <Panel title="Wallet & live rates" sub="GET /v1/wallet — live rates, used only for informational cost display (no budget cap).">
          <div className="stack" style={{ gap: 6 }}>
            <div className="pf-field"><span className="k">balance</span><b>{d?.wallet.balance ? `$${Number(d.wallet.balance).toFixed(3)}` : d?.wallet.error ?? "—"}</b></div>
            <div className="pf-field"><span className="k">agent step</span><b>${d?.wallet.rates.step ?? "—"}</b></div>
            <div className="pf-field"><span className="k">browser / min</span><b>${d?.wallet.rates.browserPerMin ?? "—"}</b></div>
            <div className="pf-field"><span className="k">monitor run</span><b>${d?.wallet.rates.monitor ?? "—"}</b></div>
            <div className="pf-field"><span className="k">rate source</span><b>{d?.wallet.rates.source ?? "—"}</b></div>
            {d?.wallet.raw_meters?.length ? <Json value={d.wallet.raw_meters} max={140} /> : null}
          </div>
        </Panel>

        <Panel title="Execution & safety guards" sub="Every query runs fully live. No cache, no spend ceiling — only privacy / abuse guards.">
          <div className="stack" style={{ gap: 6 }}>
            {d && Object.entries(d.execution ?? {}).map(([k, v]) => <div key={k} className="pf-field"><span className="k">{k.replace(/_/g, " ")}</span><b>{String(v)}</b></div>)}
            <div className="pf-field"><span className="k">sentinel default cron</span><b className="mono">{d?.sentinel_cron}</b></div>
          </div>
        </Panel>

        <Panel title="Models & registry">
          <div className="stack" style={{ gap: 6 }}>
            {d && Object.entries(d.models).map(([k, v]) => <div key={k} className="pf-field"><span className="k">{k}</span><b className="mono">{v}</b></div>)}
            {d && <div className="note">{d.registry.schemes} schemes · {d.registry.states} states/UTs · {d.registry.languages} languages</div>}
            <div className="note">Speech-to-text runs in the browser (Web Speech API); Telegram voice notes use Groq Whisper.</div>
          </div>
        </Panel>

        <Panel title="Operator token" sub="Paid / mutating actions (discovery, Browser sessions, Monitor create/delete, profile deletion, Telegram setup) require it when ADMIN_TOKEN is set. Stored only in this browser.">
          <div className="row">
            <input className="input" type="password" style={{ flex: 1 }} placeholder="ADMIN_TOKEN" value={tok} onChange={(e) => setTok(e.target.value)} />
            <button className="btn primary" onClick={saveTok}>Save</button>
          </div>
        </Panel>

        <Panel title="Telegram & cron">
          <div className="row">
            <button className="btn sm" disabled={!!act.busy} onClick={tgStatus}>Bot status</button>
            <button className="btn sm" disabled={!!act.busy || !d?.integrations.telegram} onClick={tgSetup}>Register webhook</button>
            <button className="btn sm" disabled={!!act.busy} onClick={runCron}>Run nightly maintenance now</button>
          </div>
          {d?.endpoints && (
            <div className="stack" style={{ gap: 4, marginTop: 10 }}>
              {Object.entries(d.endpoints).map(([k, v]) => <div key={k} className="note"><span className="mono">{k}</span>: <code>{v}</code></div>)}
            </div>
          )}
          {tg && <Json value={tg} max={200} />}
          {cron && <Json value={cron} max={200} />}
        </Panel>
      </div>

      <Panel title="Live TinyFish endpoint probe" sub="Free + read-only calls through this deployment's server-side proxies — real upstream data, $0." right={<button className="btn primary sm" onClick={probe}>▶ Run probe</button>}>
        {!verify ? (
          <div className="empty">Press “Run probe”. For a paid Agent check run <code>DECK_VERIFY_PAID=1 npm run verify:api</code>.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th /><th>Endpoint</th><th>Latency</th><th>Result</th></tr></thead>
              <tbody>{verify.map((v) => <tr key={v.name}><td>{v.ok ? <Icon name="check" /> : <Icon name="x" />}</td><td>{v.name}</td><td className="mono">{v.ms}ms</td><td className={v.ok ? "" : "note err"}>{v.note}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Panel>
      </>}
    </div>
  );
}
