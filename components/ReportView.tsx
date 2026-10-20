import type { StructuredReport } from "@/lib/lokmitra/report-shape";
import { factStatusLabel, keyLabel, reportHost, sectorLabel, sortSectors, statusLabel, verdictLabel } from "@/lib/lokmitra/report-shape";
import { L } from "@/lib/lokmitra/glossary";
import { Icon, SectorIcon } from "./Icon";
import { mdToHtml } from "@/lib/md";

/**
 * Structured Citizen Benefit Report renderer — sector cards, verdict badges, key facts,
 * guideline fact-check, contradictions, Sentinel facts, also-eligible and next steps.
 * Hook-free so it renders in client pages (Sahayak) and server pages (printable slip).
 * `tone="print"` switches to the light slip palette.
 */
export function ReportView({ r, lang, showEnglish = false, tone = "dark" }: { r: StructuredReport; lang: string; showEnglish?: boolean; tone?: "dark" | "print" }) {
  const loc = !showEnglish && lang !== "en";
  const l = showEnglish ? "en" : lang;
  const pick = (en: string, local?: string) => (loc && local ? local : en);
  const ans = r.answer?.text ? r.answer : null;
  // narrow questions (yes/no, brief) show ONLY the direct answer up-front; the full report folds away below it
  const compact = !!ans && (ans.style === "binary" || ans.style === "brief");
  const body = (
    <>
      {!compact && r.headline !== ans?.text && <p className="rv-headline">{pick(r.headline, r.headline_local)}</p>}
      <div className="rv-stats">
        <span className="chip hit">● {r.stats.live_sections ?? r.stats.sections}/{r.stats.sections} {L("live_fetched", l)}</span>
        <span className="chip"><Icon name="check" /> {r.stats.facts_confirmed} {L("confirmed", l)}</span>
        {r.stats.facts_contradicted > 0 && <span className="chip miss"><Icon name="alert" /> {r.stats.facts_contradicted} {L("contradiction", l)}</span>}
        <span className="chip" title={r.translation.model ?? undefined}>
          <Icon name="globe" /> {r.translation.via === "groq" ? `Groq · ${r.translation.model ?? ""}` : r.translation.via === "glossary" ? `offline glossary (${r.translation.glossary_lang})` : "English"}
        </span>
      </div>

      <div className="rv-sectors">
        {sortSectors(r.sectors).map((s) => (
          <section key={s.id} className={`rv-sector sec-${s.id}`}>
            <h4 className="rv-sector-h">
              <span aria-hidden="true"><SectorIcon id={s.id} /></span> {sectorLabel(s.id, l)}
            </h4>
            {s.items.map((it) => {
              const reasons = loc && it.reasons_local?.length ? it.reasons_local : it.reasons;
              const diy = loc && it.diy_local?.length ? it.diy_local : it.diy;
              return (
                <article key={`${it.scheme_id}:${it.task}`} className="rv-item">
                  <div className="rv-item-h">
                    <b>{it.scheme_name}</b>
                    {it.verdict !== "na" && <span className={`verdict v-${it.verdict}`}>{verdictLabel(it.verdict, l)}</span>}
                    <span className={`chip st-${it.status}`}>{statusLabel(it.status, l)}</span>
                    <span className="chip live">● {L("fresh", l)}</span>
                  </div>
                  {it.facts.length > 0 && (
                    <dl className="rv-facts">
                      {it.facts.slice(0, 6).map((f, i) => (
                        <div key={i}>
                          <dt>{keyLabel(f.key, l)}</dt>
                          <dd>{pick(f.value, f.value_local)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {reasons.length > 0 && (
                    <p className="rv-why">
                      <span>{L("why", l)}:</span> {reasons.slice(0, 2).join(" ")}
                    </p>
                  )}
                  {it.fact_check.some((f) => f.status !== "not_stated") && (
                    <div className="rv-fc" aria-label={L("fact_check", l)}>
                      <span className="rv-fc-h">{L("fact_check", l)}:</span>
                      {it.fact_check.filter((f) => f.status !== "not_stated").map((f) => (
                        <span key={f.fact_id} className={`fc fc-${f.status}`} title={f.snippet ?? undefined}>
                          {f.status === "confirmed" ? <Icon name="check" size={11} /> : <Icon name="alert" size={11} />} {f.label}: {f.status === "confirmed" ? f.canonical : `${f.found} ≠ ${f.canonical}`}
                        </span>
                      ))}
                    </div>
                  )}
                  {it.agent && (
                    <p className="rv-why">
                      <span><Icon name="bot" /> Agent:</span> {it.agent.status}
                      {it.agent.registration_status ? ` · ${it.agent.registration_status}` : ""}
                      {it.agent.blocked_by && it.agent.blocked_by !== "none" ? ` · blocked by ${it.agent.blocked_by}` : ""}
                      {typeof it.agent.cost_usd === "number" ? ` · $${it.agent.cost_usd.toFixed(3)}` : ""}
                    </p>
                  )}
                  {diy.length > 0 && (it.status !== "ok" || it.verdict === "check") && (
                    <p className="rv-diy">
                      <span>{L("diy", l)}:</span> {diy.slice(0, 2).join(" → ")}
                    </p>
                  )}
                  {it.sources.length > 0 && (
                    <div className="rv-src">
                      {it.sources.slice(0, 3).map((u) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer noopener">
                          {reportHost(u)} ↗
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>

      <section className={`rv-block ${r.contradictions.length ? "warn" : "okay"}`}>
        <h4><Icon name="alert" /> {L("contradictions", l)}</h4>
        {r.contradictions.length ? (
          <ul>
            {r.contradictions.map((c, i) => (
              <li key={i}>
                {pick(c.text, c.text_local)}
                {c.source && /^https?:/.test(c.source) && (
                  <>
                    {" "}
                    <a href={c.source} target="_blank" rel="noreferrer noopener">
                      {reportHost(c.source)} ↗
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="note"><Icon name="check" /> {L("no_contradictions", l)}</p>
        )}
      </section>

      {r.sentinel.length > 0 && (
        <section className="rv-block">
          <h4><Icon name="bell" /> {L("sentinel", l)}</h4>
          <ul>
            {r.sentinel.map((s) => (
              <li key={s.monitor_id}>
                <b>{s.scheme_name}</b> <span className="chip">{s.kind}{s.state_code !== "IN" ? ` · ${s.state_code}` : ""}</span> {pick(s.summary ?? "—", s.summary_local)}
                {s.facts.length > 0 && (
                  <span className="rv-fc" style={{ display: "inline-flex", marginLeft: 6 }}>
                    {s.facts.map((f) => (
                      <span key={f.fact_id} className={`fc fc-${f.status}`}>
                        {f.status === "confirmed" ? <Icon name="check" size={11} /> : <Icon name="alert" size={11} />} {f.label} {factStatusLabel(f.status, l)}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.also_eligible.length > 0 && (
        <section className="rv-block also">
          <h4><Icon name="sparkle" /> {L("also_eligible", l)}</h4>
          <div className="rv-also">
            {r.also_eligible.map((a) => (
              <a key={a.scheme_id} className="rv-also-card" href={a.entry} target="_blank" rel="noreferrer noopener">
                <b>{a.name}</b>
                <span className={`verdict v-${a.verdict}`}>{verdictLabel(a.verdict, l)}</span>
                <small>{a.benefit}</small>
                <small className="fog">{(loc && a.reasons_local?.length ? a.reasons_local : a.reasons).slice(0, 1).join(" ")}</small>
              </a>
            ))}
          </div>
        </section>
      )}

      {r.next_steps.length > 0 && (
        <section className="rv-block steps">
          <h4><Icon name="arrow" /> {L("next_steps", l)}</h4>
          <ol>
            {r.next_steps.map((n, i) => (
              <li key={i}>
                {pick(n.text, n.text_local)}
                {n.url && (
                  <>
                    {" "}
                    <a href={n.url} target="_blank" rel="noreferrer noopener">
                      {reportHost(n.url)} ↗
                    </a>
                  </>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
  return (
    <div className={`report-view ${tone}`} lang={l}>
      {ans && (
        <section className={`rv-answer a-${ans.style}`} aria-label="Answer to your question">
          <div className="md-body" dangerouslySetInnerHTML={{ __html: mdToHtml(pick(ans.text, ans.text_local)) }} />
          <span className="rv-answer-meta">
            {ans.style === "binary" ? "yes / no" : ans.style === "detailed" ? "in depth" : ans.style}
            {ans.persona ? ` · for a ${ans.persona}` : ""} · {ans.via === "groq" ? "Groq · live evidence" : "rules · live evidence"}
          </span>
        </section>
      )}
      {!ans && <p className="rv-headline">{pick(r.headline, r.headline_local)}</p>}
      {compact ? (
        <details className="rv-more">
          <summary className="note">Full Citizen Benefit Report</summary>
          {body}
        </details>
      ) : (
        body
      )}
    </div>
  );
}
