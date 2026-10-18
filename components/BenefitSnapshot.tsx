"use client";
import { useEffect, useState } from "react";
import { useT, relTime, localizeTexts } from "@/lib/i18n/client";
import { L, type GlossKey } from "@/lib/lokmitra/glossary";
import { SectorIcon } from "./Icon";
import type { SessionSummary } from "@/hooks/useSessionSummary";
import { Icon } from "./Icon";

const VERDICT_KEY: Record<string, GlossKey> = { likely: "v_likely", check: "v_check", unlikely: "v_unlikely", na: "v_na" };

/**
 * Benefit Snapshot — everything LokMitra found for this citizen across the session
 * (aggregated from their own benefit_reports by /api/lokmitra/session-summary, $0):
 * scheme count + verdict mix, likely-eligible schemes, deadlines, top next actions.
 * Deadlines / actions are localised (report's own *_local text, else Groq via /localize).
 */
export function BenefitSnapshot({ data, loading, error }: { data: SessionSummary | null; loading: boolean; error: string | null }) {
  const { t, lang } = useT();
  const snap = data?.snapshot;
  const [loc, setLoc] = useState<{ deadlines: string[]; actions: string[] } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoc(null);
    if (!snap || lang === "en") return;
    const dls = snap.deadlines.map((d) => d.text);
    const acts = snap.actions.map((a) => a.text_local || a.text);
    const needAct = snap.actions.map((a) => !a.text_local);
    const toTranslate = [...dls, ...acts.filter((_, i) => needAct[i])];
    if (!toTranslate.length) return;
    localizeTexts(toTranslate, lang).then((out) => {
      if (!alive) return;
      const dOut = out.slice(0, dls.length);
      let k = dls.length;
      const aOut = acts.map((a, i) => (needAct[i] ? out[k++] ?? a : a));
      setLoc({ deadlines: dOut, actions: aOut });
    });
    return () => {
      alive = false;
    };
  }, [snap, lang]);

  return (
    <section id="benefit-snapshot" className="panel area-snap" style={{ ["--i" as string]: 1 }} aria-labelledby="snap-title">
      <header className="panel-head">
        <div>
          <h2 className="panel-title" id="snap-title">
            <span className="glyph" style={{ background: "var(--jade)", boxShadow: "0 0 10px var(--jade)" }} /> {t("snap_title")}
          </h2>
          <div className="panel-sub">{t("snap_sub")}</div>
        </div>
        {data && <span className="tag teal">{data.reports} {t("snap_reports")}</span>}
      </header>

      {error && <p className="note err"><Icon name="alert" /> {error}</p>}
      {!snap || !snap.counts.total ? (
        <div className="empty snap-empty">{loading ? "…" : t("snap_empty")}</div>
      ) : (
        <div className="snap-body">
          <div className="snap-kpis">
            <div className="snap-kpi"><span className="k">{t("snap_schemes")}</span><b>{snap.counts.total}</b></div>
            <div className="snap-kpi jade"><span className="k">{t("snap_likely")}</span><b>{snap.counts.likely}</b></div>
            <div className="snap-kpi amber"><span className="k">{t("snap_deadlines")}</span><b>{snap.deadlines.length}</b></div>
          </div>
          <div className="snap-verdicts" aria-label="Verdict mix">
            {(["likely", "check", "unlikely", "info"] as const).map((v) => {
              const n = snap.counts[v];
              if (!n) return null;
              return <span key={v} className={`snap-bar v-${v}`} style={{ flexGrow: n }} title={`${L(VERDICT_KEY[v === "info" ? "na" : v], lang)}: ${n}`} />;
            })}
          </div>

          <ul className="snap-schemes">
            {snap.schemes.slice(0, 6).map((s) => (
              <li key={`${s.scheme_id}:${s.report_id}`} className={`v-${s.verdict}`}>
                <span className="snap-ic" aria-hidden="true"><SectorIcon id={s.sector} /></span>
                <span className="snap-name">
                  <b>{s.scheme_name}</b>
                  {s.benefit && <small>{s.benefit}</small>}
                </span>
                <span className={`chip ${s.verdict === "likely" ? "hit" : s.verdict === "unlikely" ? "" : "miss"}`}>{L(VERDICT_KEY[s.verdict] ?? "v_na", lang)}</span>
              </li>
            ))}
          </ul>

          {snap.deadlines.length > 0 && (
            <div className="snap-block">
              <h3><Icon name="clock" /> {t("snap_deadlines")}</h3>
              <ul>
                {snap.deadlines.slice(0, 4).map((d, i) => (
                  <li key={d.scheme_id}>
                    <b>{d.scheme_name}</b> — {loc?.deadlines[i] ?? d.text} <span className="fog">· {relTime(d.seen, lang)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {snap.actions.length > 0 && (
            <div className="snap-block">
              <h3><Icon name="arrow" /> {t("snap_actions")}</h3>
              <ol>
                {snap.actions.slice(0, 4).map((a, i) => (
                  <li key={a.text}>
                    {a.url ? <a href={a.url} target="_blank" rel="noreferrer noopener">{loc?.actions[i] ?? a.text_local ?? a.text}</a> : loc?.actions[i] ?? a.text_local ?? a.text}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="note snap-foot">● {snap.live_calls.search} Search · {snap.live_calls.fetch_ok}/{snap.live_calls.fetch_urls} Fetch · {snap.agent_checks} Agent</p>
        </div>
      )}
    </section>
  );
}
