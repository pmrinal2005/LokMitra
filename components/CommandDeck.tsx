"use client";
import { useEffect, useState } from "react";
import { GlassNav } from "./GlassNav";
import { LivingMap } from "./LivingMap";
import { MobileTop3 } from "./MobileTop3";
import { WalletGauge } from "./WalletGauge";
import { CacheRing } from "./CacheRing";
import { AgentTerminal } from "./AgentTerminal";
import { Porthole } from "./Porthole";
import { SectorTiles } from "./SectorTiles";
import { ImpactTicker } from "./ImpactTicker";
import { useDeckData } from "@/hooks/useDeckData";
import { useMission } from "@/hooks/useMission";
import { useSonar } from "@/hooks/useSonar";
import { useCalm } from "@/hooks/useCalm";

export function CommandDeck() {
  const mission = useMission();
  const { data, error, loading, refresh } = useDeckData(mission.state.running);
  const sonar = useSonar();
  const { calm, toggle: toggleCalm } = useCalm();

  // when a local mission finishes, pull fresh numbers immediately
  const [lastStatus, setLastStatus] = useState(mission.state.status);
  useEffect(() => {
    if (mission.state.status !== lastStatus) {
      setLastStatus(mission.state.status);
      if (!mission.state.running) setTimeout(refresh, 1200);
    }
  }, [mission.state.status, mission.state.running, lastStatus, refresh]);

  const configured = data?.configured ?? true;
  const activeAgents = Math.max(data?.runs.active ?? 0, mission.state.running && mission.state.runId ? 1 : 0);
  const connected = !error && !!data;
  const nodes = data?.nodes ?? [];

  return (
    <>
      <GlassNav activeAgents={activeAgents} connected={connected} configured={configured} soundOn={sonar.enabled} onSound={sonar.toggle} calm={calm} onCalm={toggleCalm} />

      <main className="deck" id="main">
        <h1 className="sr-only">LokMitra × TinyFish — Bioluminescent Command Deck</h1>

        {data && !data.configured && (
          <section className="panel setup-banner" style={{ ["--i" as string]: 0 }} aria-live="polite">
            <div>
              <h2 className="panel-title">
                <span className="glyph" style={{ background: "var(--ember)", boxShadow: "0 0 10px var(--ember)" }} /> Sonar offline — API key missing
              </h2>
              <p className="fog" style={{ margin: "8px 0 0" }}>
                Add <code>TINYFISH_API_KEY</code> to <code>.env.local</code> (local) or Vercel → Settings → Environment Variables, then redeploy. The key stays server-side.
              </p>
            </div>
            <a className="cta" href="https://agent.tinyfish.ai/api-keys" target="_blank" rel="noreferrer noopener" style={{ padding: "12px 18px", textDecoration: "none" }}>
              Get a key ↗
            </a>
          </section>
        )}

        {/* ---------------- HERO MAP ---------------- */}
        <section id="mission-deck" className="panel map-panel area-map textile-corner breathe" style={{ ["--i" as string]: 1, ["--bob" as string]: "6s" }} aria-labelledby="map-title">
          <header className="panel-head">
            <h2 className="panel-title" id="map-title">
              <span className="glyph" /> The Living Network
            </h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="tag teal">{nodes.length} reefs discovered</span>
              <span className={`tag ${activeAgents ? "amber" : ""}`}>{activeAgents} swimming</span>
              {loading && !data && <span className="tag">syncing…</span>}
            </div>
          </header>
          <div className="textile-rule" style={{ margin: "10px 0 0" }} aria-hidden="true" />
          <LivingMap nodes={nodes} activeCount={activeAgents} />
          <MobileTop3 nodes={nodes} />
          {data?.errors.runs && <div className="err-note" style={{ padding: "0 22px 14px" }}>runs feed: {data.errors.runs.message}</div>}
        </section>

        {/* ---------------- WALLET ---------------- */}
        <section id="wallet" className="panel area-wallet breathe" style={{ ["--i" as string]: 2, ["--bob" as string]: "5.2s" }} aria-labelledby="wallet-title">
          <header className="panel-head">
            <h2 className="panel-title" id="wallet-title">
              <span className="glyph" style={{ background: "var(--aqua)", boxShadow: "0 0 10px var(--aqua)" }} /> Wallet Telemetry
            </h2>
            <span className="panel-sub">GET /v1/wallet</span>
          </header>
          <WalletGauge data={data} />
        </section>

        {/* ---------------- CACHE RING ---------------- */}
        <section className="panel area-ring breathe" style={{ ["--i" as string]: 3, ["--bob" as string]: "5.8s" }} aria-labelledby="ring-title">
          <header className="panel-head">
            <h2 className="panel-title" id="ring-title">
              <span className="glyph" style={{ background: "var(--jade)", boxShadow: "0 0 10px var(--jade)" }} /> Cache Intelligence
            </h2>
            <span className="panel-sub">search · fetch · runs usage</span>
          </header>
          <CacheRing data={data} />
        </section>

        {/* ---------------- TERMINAL ---------------- */}
        <section id="agent-logs" className="panel term-panel area-term" style={{ ["--i" as string]: 4 }} aria-labelledby="term-title">
          <header className="panel-head">
            <h2 className="panel-title" id="term-title">
              <span className="glyph" style={{ background: "var(--ember)", boxShadow: "0 0 10px var(--ember)" }} /> Live Agent Reasoning
            </h2>
            <div style={{ display: "flex", gap: 8 }}>
              <span className="tag jade">{data?.runs.completed ?? 0} completed</span>
              <span className="tag coral">{data?.runs.failed ?? 0} failed</span>
              <span className="tag">{(data?.runs.steps ?? 0).toLocaleString()} steps</span>
            </div>
          </header>
          <AgentTerminal
            lines={mission.lines}
            state={mission.state}
            recent={data?.runs.recent ?? []}
            onRunAgent={mission.runAgent}
            onRunSearch={mission.runSearch}
            onRunFetch={mission.runFetch}
            onCancel={mission.cancel}
            onClear={mission.clear}
            onInspect={mission.inspectRun}
            disabled={data ? !data.configured : false}
          />
        </section>

        {/* ---------------- PORTHOLE ---------------- */}
        <section className="panel port-panel area-port breathe" style={{ ["--i" as string]: 5, ["--bob" as string]: "6.4s" }} aria-labelledby="port-title">
          <header className="panel-head" style={{ width: "100%" }}>
            <h2 className="panel-title" id="port-title">
              <span className="glyph" /> Browser Porthole
            </h2>
            <span className={`tag ${mission.state.streamingUrl && mission.state.running ? "teal" : ""}`}>{mission.state.streamingUrl && mission.state.running ? "● live" : "standby"}</span>
          </header>
          <Porthole state={mission.state} activeElsewhere={data?.runs.active ?? 0} />
        </section>

        {/* ---------------- SECTORS ---------------- */}
        <section id="sectors" className="panel area-sec" style={{ ["--i" as string]: 6 }} aria-labelledby="sec-title">
          <header className="panel-head">
            <h2 className="panel-title" id="sec-title">
              <span className="glyph" style={{ background: "#B892FF", boxShadow: "0 0 10px #B892FF" }} /> Citizen Sectors
            </h2>
            <span className="panel-sub">classified from live goals, queries & portals</span>
          </header>
          <SectorTiles data={data} />
        </section>

        {/* ---------------- TICKER ---------------- */}
        <section className="panel ticker-panel area-tick" style={{ ["--i" as string]: 7 }} aria-label="Impact ticker">
          <ImpactTicker items={data?.ticker ?? []} configured={configured} />
        </section>

        <footer className="footer-note">
          {data ? `telemetry @ ${new Date(data.generated_at).toLocaleTimeString()} · ` : ""}
          {error ? <span className="err-note">link degraded: {error} · </span> : null}
          LokMitra × TinyFish · Agent · Search · Fetch · Browser · Monitor APIs
        </footer>
      </main>
    </>
  );
}
