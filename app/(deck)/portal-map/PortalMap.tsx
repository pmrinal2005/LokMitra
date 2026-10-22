"use client";
import { useState } from "react";
import { api, hostOf, ssePost } from "@/lib/client";
import { Flash, Json, Kpi, PageHead, Panel, useAction, useApi } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface DeepLink { url: string; label: string; kind: string }
interface LivePortal { scheme_id: string; state_code: string; task: string; entry_url: string; deep_links: DeepLink[]; resolved_via: "search" | "registry"; resolved_at: string }
interface LiveRes {
  live: true;
  portal: LivePortal;
  search: { query: string; latency_ms: number; error: string | null; results: { title: string; url: string; snippet: string; position: number }[] };
  pages: { url: string; final_url: string | null; title: string | null; chars: number; latency_ms: number | null; error: string | null; preview: string }[];
  elapsed_ms: number;
}
interface Registry { schemes: { id: string; name: string; hindi: string; sector: string; has_status: boolean; state_specific: boolean }[]; states: { code: string; name: string; has_land: boolean }[] }
interface Disc { stages: string[]; steps: number; streaming_url: string | null; result: Record<string, unknown> | null; error: string | null; running: boolean; run_id?: string | null }

/**
 * Live Portal Explorer (replaces the old cached "Portal Map").
 * Every press runs a fresh TinyFish Search (and optionally a live Fetch / Agent) against the
 * real government portal right now. Nothing is stored on the server; the comparison list below
 * lives only in this browser tab so you can see two consecutive live resolutions side by side.
 */
export function PortalMap() {
  const reg = useApi<Registry>("/api/lokmitra/schemes");
  const act = useAction();
  const [form, setForm] = useState({ scheme_id: "pm-kisan", state_code: "IN", task: "info", commodity: "", district: "" });
  const [withFetch, setWithFetch] = useState(true);
  const [history, setHistory] = useState<(LiveRes & { at: string; label: string })[]>([]);
  const [disc, setDisc] = useState<Disc | null>(null);

  const schemeName = (id: string) => reg.data?.schemes.find((s) => s.id === id)?.name ?? id;
  const latest = history[0] ?? null;

  const resolve = () =>
    act.run(
      withFetch ? "Live TinyFish Search + live Fetch of the official pages" : "Live TinyFish Search on official domains",
      () => api<LiveRes>("/api/lokmitra/portals", { body: { ...form, commodity: form.commodity || undefined, district: form.district || undefined, fetch: withFetch } }),
      (r) => {
        if (!r) return undefined;
        setHistory((h) => [{ ...r, at: new Date().toISOString(), label: `${schemeName(form.scheme_id)} · ${form.task} · ${form.state_code}` }, ...h].slice(0, 8));
        const ok = r.pages.filter((p) => !p.error && p.chars > 0).length;
        return `Live: ${r.search.results.length} search result(s) in ${(r.search.latency_ms / 1000).toFixed(1)} s${withFetch ? ` · ${ok}/${r.pages.length} page(s) fetched live` : ""} · nothing stored`;
      },
    );

  const discover = async () => {
    if (form.task !== "status" && form.task !== "land") return act.setError("Live Agent mapping is for gated STATUS or LAND flows. Use “Resolve live” for info / price / deadline.");
    setDisc({ stages: [], steps: 0, streaming_url: null, result: null, error: null, running: true });
    const up = (f: (d: Disc) => Disc) => setDisc((d) => (d ? f(d) : d));
    try {
      await ssePost("/api/lokmitra/discover", { scheme_id: form.scheme_id, state_code: form.state_code, task: form.task }, ({ event, data }) => {
        if (event === "stage") up((d) => ({ ...d, stages: [...d.stages, String(data.message)] }));
        else if (event === "agent") {
          const t = String(data.type ?? "");
          if (t === "STREAMING_URL" && data.streaming_url) up((d) => ({ ...d, streaming_url: String(data.streaming_url) }));
          if (t === "STARTED") up((d) => ({ ...d, run_id: String(data.run_id ?? ""), stages: [...d.stages, `run ${String(data.run_id ?? "").slice(0, 8)} started`] }));
          if (t === "PROGRESS") up((d) => ({ ...d, steps: d.steps + 1, stages: [...d.stages, `▶ ${String(data.purpose ?? "step")}`].slice(-40) }));
        } else if (event === "result") up((d) => ({ ...d, result: data, stages: [...d.stages, `Done: ${String(data.message ?? "done")}`] }));
        else if (event === "error") up((d) => ({ ...d, error: String(data.error ?? data.message ?? "error") }));
      });
    } catch (e) {
      up((d) => ({ ...d, error: (e as Error).message }));
    } finally {
      up((d) => ({ ...d, running: false }));
    }
  };

  const scheme = reg.data?.schemes.find((s) => s.id === form.scheme_id);
  const sameAsPrev = history.length >= 2 && history[0].label === history[1].label;

  return (
    <div className="page">
      <PageHead
        title="Live Portal Explorer"
        sub={<>Locate any official scheme portal <b>live, right now</b>. Each press runs a fresh TinyFish Search over the scheme’s official domains (government URLs change without notice), optionally a live Fetch of the pages it found, or a live Agent that maps a gated status / land-record checker. <b>Nothing is cached or stored</b> — pressing again repeats the whole live run.</>}
      />

      <div className="grid-4">
        <Kpi label="last live search" value={latest ? `${latest.search.results.length} results` : "—"} sub={latest ? `${(latest.search.latency_ms / 1000).toFixed(1)} s · ${latest.portal.resolved_via}` : "press Resolve live"} tone="teal" />
        <Kpi label="pages fetched live" value={latest ? `${latest.pages.filter((p) => !p.error && p.chars > 0).length}/${latest.pages.length}` : "—"} sub={latest ? `total ${(latest.elapsed_ms / 1000).toFixed(1)} s` : "Fetch on"} tone="jade" />
        <Kpi label="live runs this tab" value={history.length} sub="session-only list, never stored" />
        <Kpi label="stored on server" value="0" sub="no portal cache anywhere" tone="amber" />
      </div>

      <Panel title="Resolve live or map with the Agent" sub="Resolve live = fresh TinyFish Search (+ live Fetch). Map live = TinyFish Agent run with a strict output_schema on the real portal (operator).">
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
            <>
              <label>
                <span className="label">Commodity</span>
                <input className="input" placeholder="wheat, onion…" value={form.commodity} onChange={(e) => setForm({ ...form, commodity: e.target.value })} />
              </label>
              <label>
                <span className="label">District (optional)</span>
                <input className="input" placeholder="Nashik" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
              </label>
            </>
          )}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!!act.busy} onClick={resolve}><Icon name="search" /> Resolve live</button>
          <label className="row note" style={{ gap: 6 }}>
            <input type="checkbox" checked={withFetch} onChange={(e) => setWithFetch(e.target.checked)} /> also Fetch the pages live
          </label>
          <button className="btn paid" disabled={!!disc?.running || !(form.task === "status" || form.task === "land")} onClick={discover} title={scheme?.has_status || form.task === "land" ? "Live TinyFish Agent maps the gated checker right now" : "This scheme has no gated status checker"}>
            <Icon name="bot" /> Map live with Agent
          </button>
        </div>
        <Flash {...act} />

        {latest && (
          <div className="section-card" style={{ marginTop: 12 }}>
            <h4>
              {schemeName(latest.portal.scheme_id)} <span className="chip">{latest.portal.task}</span> <span className="note">{new Date(latest.at).toLocaleTimeString("en-IN")}</span>
            </h4>
            <div className="note">search query: <code>{latest.search.query}</code></div>
            <div className="note">entry: <a href={latest.portal.entry_url} target="_blank" rel="noreferrer noopener">{latest.portal.entry_url}</a></div>
            <div className="grid-2" style={{ marginTop: 8 }}>
              <div className="stack">
                <span className="label">Official pages located just now</span>
                <LinkList links={latest.portal.deep_links} />
              </div>
              <div className="stack">
                <span className="label">Live search results (ranked by TinyFish)</span>
                <ol className="note" style={{ margin: 0, paddingLeft: 18 }}>
                  {latest.search.results.slice(0, 6).map((r) => (
                    <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer noopener">{r.title || hostOf(r.url)}</a> <span className="mono fog">{hostOf(r.url)}</span></li>
                  ))}
                </ol>
                {latest.search.error && <p className="note err">search: {latest.search.error}</p>}
              </div>
            </div>
            {latest.pages.length > 0 && (
              <div className="stack" style={{ marginTop: 10 }}>
                <span className="label">Live Fetch</span>
                {latest.pages.map((p) => (
                  <details key={p.url} className="note">
                    <summary style={{ cursor: "pointer" }}>
                      {p.error ? <Icon name="x" /> : <Icon name="check" />} {hostOf(p.final_url || p.url)} · {p.error ? p.error : `${p.chars.toLocaleString()} chars`}{p.latency_ms ? ` · ${(p.latency_ms / 1000).toFixed(1)} s` : ""} {p.title ? `· ${p.title}` : ""}
                    </summary>
                    {p.preview && <pre className="mono" style={{ whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto", margin: "6px 0 0" }}>{p.preview}</pre>}
                  </details>
                ))}
              </div>
            )}
          </div>
        )}

        {disc && (
          <div className="gate" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{disc.running ? `Agent mapping the portal live… step ${disc.steps}` : disc.error ? "Live mapping finished with an issue" : "Live mapping finished (not stored)"}</b>
              {disc.streaming_url && <a className="btn sm" href={disc.streaming_url} target="_blank" rel="noreferrer noopener">▶ Watch live ↗</a>}
            </div>
            {disc.streaming_url && disc.running && <iframe className="live-frame" src={disc.streaming_url} title="Live TinyFish agent" sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" />}
            <div className="stage-list" style={{ maxHeight: 160, overflow: "auto" }}>{disc.stages.map((s, i) => <span key={i}>{s}</span>)}</div>
            {disc.result && <Json value={(disc.result.discovery as Record<string, unknown>) ?? disc.result} />}
            {disc.error && <p className="note err"><Icon name="alert" /> {disc.error}</p>}
          </div>
        )}
      </Panel>

      <Panel title={`Live runs in this tab · ${history.length}`} sub="Kept only in your browser for comparison — the server keeps nothing. Run the same scheme twice to see two independent live resolutions.">
        {sameAsPrev && (
          <p className="note ok">
            <Icon name="check" /> Same request run twice → two independent live Searches ({(history[1].search.latency_ms / 1000).toFixed(1)} s and {(history[0].search.latency_ms / 1000).toFixed(1)} s). Nothing from the first run was reused.
          </p>
        )}
        {!history.length ? (
          <div className="empty">No live runs yet — press “Resolve live” above.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>When</th><th>Request</th><th>Search</th><th>Fetch</th><th>Entry</th><th>Total</th></tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={`${h.at}-${i}`}>
                    <td className="mono">{new Date(h.at).toLocaleTimeString("en-IN")}</td>
                    <td>{h.label}</td>
                    <td className="mono">{h.search.results.length} · {(h.search.latency_ms / 1000).toFixed(1)}s</td>
                    <td className="mono">{h.pages.length ? `${h.pages.filter((p) => !p.error && p.chars > 0).length}/${h.pages.length}` : "—"}</td>
                    <td className="mono"><span className="ellipsis" style={{ maxWidth: 220 }}>{hostOf(h.portal.entry_url)}</span></td>
                    <td className="mono">{(h.elapsed_ms / 1000).toFixed(1)}s</td>
                  </tr>
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
