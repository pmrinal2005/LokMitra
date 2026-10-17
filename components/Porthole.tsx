"use client";
import type { MissionState } from "@/hooks/useMission";

export function Porthole({ state, activeElsewhere }: { state: MissionState; activeElsewhere: number }) {
  const shot = (state.lastResult as { _lastScreenshot?: string | null } | null)?._lastScreenshot ?? null;
  const live = !!state.streamingUrl && state.running;
  const rivets = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { left: `${50 + Math.cos(a) * 45.5}%`, top: `${50 + Math.sin(a) * 45.5}%` };
  });

  return (
    <>
      <div className="porthole">
        <div className="bezel" aria-hidden="true" />
        {rivets.map((r, i) => (
          <span key={i} className="rivet" style={r} aria-hidden="true" />
        ))}
        <div className="glass-window">
          {state.streamingUrl ? (
            <iframe
              src={state.streamingUrl}
              title="Live TinyFish agent browser view"
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          ) : shot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="shot" src={shot} alt="Last captured step of the replayed agent run" />
          ) : (
            <div className="port-idle">
              {state.running ? (
                <>
                  <div className="school" aria-label="Waiting for stream">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span>surfacing browser stream…</span>
                </>
              ) : (
                <>
                  <div className="school" style={{ opacity: 0.5 }} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span>
                    {activeElsewhere > 0 ? `${activeElsewhere} agent(s) active elsewhere` : "porthole sealed"}
                    <br />
                    dispatch an AGENT mission to look outside
                  </span>
                </>
              )}
            </div>
          )}
          <div className={`radar ${state.running ? "" : "paused"}`} aria-hidden="true" />
        </div>
      </div>
      <div className="port-caption" aria-live="polite">
        AGENT_VIEW // <b>{state.host || "—"}</b> // {live ? `step ${state.step}` : state.status === "running" ? "connecting" : state.status.toLowerCase()}
      </div>
      {state.streamingUrl && (
        <a className="port-caption" href={state.streamingUrl} target="_blank" rel="noreferrer noopener" style={{ marginTop: 6, color: "var(--aqua)" }}>
          open full stream ↗
        </a>
      )}
    </>
  );
}
