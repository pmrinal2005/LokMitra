"use client";
import { useEffect, useState } from "react";
import { GlassNav } from "./GlassNav";
import { LivingMap } from "./LivingMap";
import { MobileTop3 } from "./MobileTop3";
import { SahayakJourney } from "./SahayakJourney";
import { BenefitSnapshot } from "./BenefitSnapshot";
import { VerifiedSource } from "./VerifiedSource";
import { AgentTerminal } from "./AgentTerminal";
import { Porthole } from "./Porthole";
import { SectorTiles } from "./SectorTiles";
import { ImpactTicker } from "./ImpactTicker";
import { useDeckData } from "@/hooks/useDeckData";
import { useMission } from "@/hooks/useMission";
import { useSonar } from "@/hooks/useSonar";
import { useCalm } from "@/hooks/useCalm";
import { useRole } from "@/hooks/useRole";
import { useSessionSummary } from "@/hooks/useSessionSummary";
import { Icon } from "./Icon";
import { useT } from "@/lib/i18n/client";

/**
 * Command Deck. One tree serves BOTH UI modes: every panel stays mounted (shared hooks, state,
 * SSE streams, history) and Casual mode only hides developer panels via html[data-ui-mode] CSS
 * (`.dev-only`). In Casual mode the Benefit Snapshot moves into a dismissible drawer opened
 * from the "My Saved Benefits (n)" pill — same component instance, same data.
 */
export function CommandDeck() {
  const { t } = useT();
  const [snapOpen, setSnapOpen] = useState(false);
  const mission = useMission();
  const { data, error, loading, refresh } = useDeckData(mission.state.running);
  const sonar = useSonar();
  const { calm, toggle: toggleCalm } = useCalm();
  const { isOperator } = useRole();
  const summary = useSessionSummary();

  // when a local mission finishes, pull fresh numbers immediately
  const [lastStatus, setLastStatus] = useState(mission.state.status);
  useEffect(() => {
    if (mission.state.status !== lastStatus) {
      setLastStatus(mission.state.status);
      if (!mission.state.running) setTimeout(refresh, 1200);
    }
  }, [mission.state.status, mission.state.running, lastStatus, refresh]);

  // casual drawer: Escape closes it
  useEffect(() => {
    if (!snapOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSnapOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [snapOpen]);

  const savedReports = summary.data?.reports ?? 0;
  const configured = data?.configured ?? true;
  const activeAgents = Math.max(data?.runs.active ?? 0, mission.state.running && mission.state.runId ? 1 : 0);
  const nodes = data?.nodes ?? [];

  return (
    <>
      <GlassNav soundOn={sonar.enabled} onSound={sonar.toggle} calm={calm} onCalm={toggleCalm} isOperator={isOperator} />

      <main className={`deck ${snapOpen ? "snap-open" : ""}`} id="main">
        <h1 className="sr-only">LokMitra × TinyFish — Bioluminescent Command Deck</h1>

        {data && !data.configured && (
          <section className="panel setup-banner dev-only" style={{ ["--i" as string]: 0 }} aria-live="polite">
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

        {/* ---------------- CITIZEN JOURNEY (hero) + SNAPSHOT + SOURCES ---------------- */}
        <SahayakJourney />

        {/* Casual mode: compact pill → Benefit Snapshot drawer (only when real reports exist) */}
        {savedReports > 0 && (
          <button type="button" className="casual-only casual-benefits-pill" onClick={() => setSnapOpen(true)} aria-expanded={snapOpen} aria-controls="benefit-snapshot">
            <Icon name="clipboard" /> {t("casual_saved")} <b>({savedReports})</b>
          </button>
        )}
        {/* display:contents in Developer mode → the snapshot keeps its exact grid slot */}
        <div className={`snap-host ${snapOpen ? "is-open" : ""}`}>
          <div className="casual-only snap-scrim" onClick={() => setSnapOpen(false)} aria-hidden="true" />
          <BenefitSnapshot data={summary.data} loading={summary.loading} error={summary.error} />
          <button type="button" className="casual-only icon-btn snap-close" onClick={() => setSnapOpen(false)} aria-label={t("casual_close")} title={t("casual_close")}>
            <Icon name="x" />
          </button>
        </div>
        <div className="dev-only-contents">
          <VerifiedSource data={summary.data} loading={summary.loading} />
        </div>

        {/* ---------------- HERO MAP ---------------- */}
        <section id="mission-deck" className="dev-only panel map-panel area-map textile-corner breathe" style={{ ["--i" as string]: 3, ["--bob" as string]: "6s" }} aria-labelledby="map-title">
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

        {/* Wallet Telemetry + Live Execution moved verbatim to Settings → "Usage & Infrastructure" (operator only). */}
        {isOperator && (
          <aside className="dev-only panel area-ops ops-pointer" style={{ ["--i" as string]: 4 }} aria-label="Operator shortcuts">
            <span className="note"><Icon name="wrench" /> Operator · Wallet Telemetry, Live Execution and the run log live in</span>
            <a className="btn sm" href="/settings#usage">Settings → Usage &amp; Infrastructure →</a>
          </aside>
        )}

        {/* ---------------- TERMINAL ---------------- */}
        <section id="agent-logs" className="dev-only panel term-panel area-term" style={{ ["--i" as string]: 4 }} aria-labelledby="term-title">
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
            onRunMonitor={mission.runMonitor}
            onRunMonitorNow={mission.runMonitorNow}
            monitors={data?.monitors.items ?? []}
            onCancel={mission.cancel}
            onClear={mission.clear}
            onInspect={mission.inspectRun}
            disabled={data ? !data.configured : false}
          />
        </section>

        {/* ---------------- PORTHOLE ---------------- */}
        <section className="dev-only panel port-panel area-port breathe" style={{ ["--i" as string]: 5, ["--bob" as string]: "6.4s" }} aria-labelledby="port-title">
          <header className="panel-head" style={{ width: "100%" }}>
            <h2 className="panel-title" id="port-title">
              <span className="glyph" /> Browser Porthole
            </h2>
            <span className={`tag ${mission.state.streamingUrl && mission.state.running ? "teal" : ""}`}>{mission.state.streamingUrl && mission.state.running ? "● live" : "standby"}</span>
          </header>
          <Porthole state={mission.state} activeElsewhere={data?.runs.active ?? 0} />
        </section>

        {/* ---------------- SECTORS ---------------- */}
        <section id="sectors" className="dev-only panel area-sec" style={{ ["--i" as string]: 6 }} aria-labelledby="sec-title">
          <header className="panel-head">
            <h2 className="panel-title" id="sec-title">
              <span className="glyph" style={{ background: "#B892FF", boxShadow: "0 0 10px #B892FF" }} /> Citizen Sectors
            </h2>
            <span className="panel-sub">classified from live goals, queries & portals</span>
          </header>
          <SectorTiles data={data} />
        </section>

        {/* ---------------- TICKER ---------------- */}
        <section className="dev-only panel ticker-panel area-tick" style={{ ["--i" as string]: 7 }} aria-label="Impact ticker">
          <ImpactTicker items={data?.ticker ?? []} configured={configured} />
        </section>

        <footer className="footer-note dev-only">
          {data ? `telemetry @ ${new Date(data.generated_at).toLocaleTimeString()} · ` : ""}
          {error ? <span className="err-note">link degraded: {error} · </span> : null}
          LokMitra × TinyFish · Agent · Search · Fetch · Browser · Monitor APIs
        </footer>
      </main>
    </>
  );
}
