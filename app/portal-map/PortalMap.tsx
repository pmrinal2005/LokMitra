"use client";
import { Fragment, useMemo, useState } from "react";
import { api, ago, hostOf, ssePost } from "@/lib/client";
import { Flash, Json, Kpi, PageHead, Panel, useAction, useApi, usd } from "@/components/ui";

interface DeepLink { url: string; label: string; kind: string }
interface Portal { id: string; state_code: string; scheme_id: string; task: string; entry_url: string; deep_links: DeepLink[]; nav_path: string[]; selectors: Record<string, unknown>; source: "seed" | "search" | "agent"; discovered_by_run?: string | null; discovery_cost_usd: number; hits: number; last_verified_at?: string | null; updated_at?: string }
interface PortalsRes { portals: Portal[]; totals: { rows: number; hits: number; agent: number; discovery_usd: number; amortised_usd_per_hit: number | null } }
interface Registry { schemes: { id: string; name: string; hindi: string; sector: string; has_status: boolean; state_specific: boolean }[]; states: { code: string; name: string; has_land: boolean }[] }
interface Disc { stages: string[]; steps: number; streaming_url: string | null; result: Record<string, unknown> | null; error: string | null; running: boolean }

export function PortalMap() {
  const portals = useApi<PortalsRes>("/api/lokmitra/portals", 20_000);
  const reg = useApi<Registry>("/api/lokmitra/schemes");
  const act = useAction();
  const [filter, setFilter] = useState("");
  const [src, setSrc] = useState<"" | "seed" | "search" | "agent">("");
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ scheme_id: "pm-kisan", state_code: "IN", task: "info", commodity: "" });
  const [resolved, setResolved] = useState<{ hit: boolean; portal: Portal; search_results: { title: string; url: string }[]; search_error: string | null } | null>(null);
  const [disc, setDisc] = useState<Disc | null>(null);

  const schemeName = (id: string) => reg.data?.schemes.find((s) => s.id === id)?.name ?? id;
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (portals.data?.portals ?? []).filter((p) => (!src || p.source === src) && (!q || `${p.scheme_id} ${schemeName(p.scheme_id)} ${p.state_code} ${p.task} ${p.entry_url}`.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portals.data, filter, src, reg.data]);

  const resolve = () =>
    act.run("Resolving via LokMitra cache / free TinyFish Search", () => api<typeof resolved>("/api/lokmitra/portals", { body: { ...form, commodity: form.commodity || undefined } }), (r) => {
      setResolved(r);
      void portals.reload();
      return r ? (r.hit ? "Cache HIT — served from portal_map for $0" : `Cache MISS → free Search found ${r.search_results.length} results and wrote a new portal_map row`) : undefined;
    });

  const discover = async (force = false) => {
    if (form.task !== "status" && form.task !== "land") return act.setError("Paid discovery maps gated STATUS or LAND flows. Use “Resolve (free)” for info / price / deadline.");
    setDisc({ stages: [], steps: 0, streaming_url: null, result: null, error: null, running: true });
    const up = (f: (d: Disc) => Disc) => setDisc((d) => (d ? f(d) : d));
    try {
      await ssePost("/api/lokmitra/discover", { scheme_id: form.scheme_id, state_code: form.state_code, task: form.task, force }, ({ event, data }) => {
        if (event === "stage") up((d) => ({ ...d, stages: [...d.stages, String(data.message)] }));
        else if (event === "agent") {
          const t = String(data.type ?? "");
          if (t === "STREAMING_URL" && data.streaming_url) up((d) => ({ ...d, streaming_url: String(data.streaming_url) }));
          if (t === "STARTED") up((d) => ({ ...d, stages: [...d.stages, `run ${String(data.run_id ?? "").slice(0, 8)} started`] }));
          if (t === "PROGRESS") up((d) => ({ ...d, steps: d.steps + 1, stages: [...d.stages, `▶ ${String(data.purpose ?? "step")}`].slice(-40) }));
        } else if (event === "result") up((d) => ({ ...d, result: data, stages: [...d.stages, `✓ ${String(data.message ?? "done")}`] }));
        else if (event === "error") up((d) => ({ ...d, error: String(data.error ?? data.message ?? "error") }));
      });
    } catch (e) {
      up((d) => ({ ...d, error: (e as Error).message }));
    } finally {
      up((d) => ({ ...d, running: false }));
      void portals.reload();
    }
  };

  const t = portals.data?.totals;
  const scheme = reg.data?.schemes.find((s) => s.id === form.scheme_id);

  return (
    <div className="page">
      <PageHead
        title="Portal Map"
        sub={<>The shared <b>“virtual API”</b> registry behind Discover-Once-Fetch-Forever. Each row is one (state × scheme × task) path. The paid Agent maps a gated portal once; after that every citizen is served by free Fetch on the cached deep links.</>}
      >
        <span className="chip hit">Search · Fetch = FREE</span>
        <span className="chip miss">Agent = once per combo</span>
      </PageHead>

      <div className="grid-4">
        <Kpi label="cached paths" value={t?.rows ?? "—"} sub={`${t?.agent ?? 0} mapped by Agent`} tone="teal" />
        <Kpi label="citizens served from cache" value={t?.hits ?? "—"} sub="each hit = $0 Wallet" tone="jade" />
        <Kpi label="one-time discovery spend" value={usd(t?.discovery_usd ?? 0, 3)} sub="paid exactly once" tone="amber" />
        <Kpi label="amortised cost / citizen" value={t?.amortised_usd_per_hit === null || t?.amortised_usd_per_hit === undefined ? "—" : `$${t.amortised_usd_per_hit.toFixed(5)}`} sub="falls with every hit" />
      </div>

      <Panel title="Resolve or discover a path" sub="Resolve = cache lookup → free TinyFish Search on official domains. Discover = one paid Agent run with a strict output_schema (operator).">
        <div className="field-grid">
          <label>
            <span className="label">Scheme</span>
            <select className="select" value={form.scheme_id} onChange={(e) => setForm({ ...form, scheme_id: e.target.value })}>
              {(reg.data?.schemes ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name} · {s.sector}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">State</span>
            <select className="select" value={form.state_code} onChange={(e) => setForm({ ...form, state_code: e.target.value })}>
              {(reg.data?.states ?? [{ code: "IN", name: "All India (central)", has_land: false }]).map((s) => (
                <option key={s.code} value={s.code}>{s.name}{s.has_land ? " · land" : ""}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Task</span>
            <select className="select" value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })}>
              {["info", "deadline", "price", "status", "land"].map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
          {form.task === "price" && (
            <label>
              <span className="label">Commodity</span>
              <input className="input" placeholder="wheat, onion…" value={form.commodity} onChange={(e) => setForm({ ...form, commodity: e.target.value })} />
            </label>
          )}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!!act.busy} onClick={resolve}>🔎 Resolve (free)</button>
          <button className="btn paid" disabled={!!disc?.running || !(form.task === "status" || form.task === "land")} onClick={() => discover(false)} title={scheme?.has_status || form.task === "land" ? "One-time paid Agent discovery" : "This scheme has no gated status checker"}>
            🐟 Discover once (paid)
          </button>
          <button className="btn sm" disabled={!!disc?.running || !(form.task === "status" || form.task === "land")} onClick={() => discover(true)} title="Re-run discovery even if a path is cached (portal redesigned)">↻ Force re-discover</button>
        </div>
        <Flash {...act} />
        {resolved && (
          <div className="section-card" style={{ marginTop: 12 }}>
            <h4>
              {schemeName(resolved.portal.scheme_id)} <span className="chip">{resolved.portal.task}</span> <span className={`chip ${resolved.hit ? "hit" : "miss"}`}>{resolved.hit ? "HIT" : "MISS → Search"}</span> <span className="chip">{resolved.portal.source}</span>
            </h4>
            <div className="note">entry: <a href={resolved.portal.entry_url} target="_blank" rel="noreferrer noopener">{resolved.portal.entry_url}</a></div>
            <LinkList links={resolved.portal.deep_links} />
            {resolved.search_error && <p className="note err">search: {resolved.search_error}</p>}
          </div>
        )}
        {disc && (
          <div className="gate" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{disc.running ? `🐟 Agent mapping the portal… step ${disc.steps}` : disc.error ? "Discovery finished with an issue" : "Discovery finished"}</b>
              {disc.streaming_url && <a className="btn sm" href={disc.streaming_url} target="_blank" rel="noreferrer noopener">▶ Watch live ↗</a>}
            </div>
            {disc.streaming_url && disc.running && <iframe className="live-frame" src={disc.streaming_url} title="Live TinyFish agent" sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" />}
            <div className="stage-list" style={{ maxHeight: 160, overflow: "auto" }}>{disc.stages.map((s, i) => <span key={i}>{s}</span>)}</div>
            {disc.result && <Json value={disc.result.portal ?? disc.result} />}
            {disc.error && <p className="note err">⚠ {disc.error}</p>}
          </div>
        )}
      </Panel>

      <Panel
        title={`portal_map · ${rows.length} rows`}
        sub="Click a row to see its deep links, recorded navigation path and selectors."
        right={
          <>
            <input className="input" style={{ width: 220 }} placeholder="filter scheme / state / host" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <select className="select" style={{ width: 130 }} value={src} onChange={(e) => setSrc(e.target.value as typeof src)}>
              <option value="">all sources</option>
              <option value="seed">seed</option>
              <option value="search">search</option>
              <option value="agent">agent</option>
            </select>
            <button className="btn sm" onClick={portals.reload}>↻</button>
          </>
        }
      >
        {portals.error && <p className="note err">⚠ {portals.error}</p>}
        {!rows.length ? (
          <div className="empty">{portals.loading ? "loading…" : "No cached paths yet — ask something on Sahayak or press Resolve above."}</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Scheme</th><th>State</th><th>Task</th><th>Source</th><th>Entry</th><th>Links</th><th>Hits</th><th>Discovery</th><th>Updated</th></tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <Fragment key={p.id}>
                    <tr onClick={() => setOpen(open === p.id ? null : p.id)} style={{ cursor: "pointer" }}>
                      <td><b>{schemeName(p.scheme_id)}</b></td>
                      <td className="mono">{p.state_code}</td>
                      <td><span className="chip">{p.task}</span></td>
                      <td><span className={`chip ${p.source === "agent" ? "miss" : p.source === "search" ? "" : "hit"}`}>{p.source}</span></td>
                      <td className="mono"><span className="ellipsis" style={{ maxWidth: 220 }}>{hostOf(p.entry_url)}</span></td>
                      <td className="mono">{p.deep_links?.length ?? 0}</td>
                      <td className="mono">{p.hits ?? 0}</td>
                      <td className="mono">{Number(p.discovery_cost_usd) > 0 ? usd(p.discovery_cost_usd, 3) : "$0"}</td>
                      <td className="mono">{ago(p.updated_at ?? p.last_verified_at)}</td>
                    </tr>
                    {open === p.id && (
                      <tr>
                        <td colSpan={9}>
                          <div className="grid-2">
                            <div className="stack">
                              <span className="label">Deep links (free Fetch targets)</span>
                              <LinkList links={p.deep_links} />
                              {p.discovered_by_run && <span className="note">discovered by run <code>{p.discovered_by_run}</code></span>}
                            </div>
                            <div className="stack">
                              <span className="label">Navigation path (identifiers scrubbed)</span>
                              {p.nav_path?.length ? <ol className="note" style={{ margin: 0, paddingLeft: 18 }}>{p.nav_path.map((s, i) => <li key={i}>{s}</li>)}</ol> : <span className="note">—</span>}
                              {p.selectors && Object.keys(p.selectors).length > 0 && <Json value={p.selectors} max={180} />}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function LinkList({ links }: { links: DeepLink[] }) {
  if (!links?.length) return <span className="note">—</span>;
  return (
    <ul className="note" style={{ margin: 0, paddingLeft: 18 }}>
      {links.slice(0, 12).map((l) => (
        <li key={l.url}>
          <span className="chip" style={{ marginRight: 6 }}>{l.kind}</span>
          <a href={l.url} target="_blank" rel="noreferrer noopener">{l.label || hostOf(l.url)}</a> <span className="mono fog">{hostOf(l.url)}</span>
        </li>
      ))}
    </ul>
  );
}
