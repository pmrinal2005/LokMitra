"use client";
import { useT, relTime } from "@/lib/i18n/client";
import type { SessionSummary } from "@/hooks/useSessionSummary";

/**
 * Verified Sources — every page that was READ LIVE (TinyFish Fetch / Agent) to answer this citizen,
 * official government domains first (.gov.in / .nic.in), with the schemes that cited them, latency
 * and when it was last read. Each row links to the original page so the citizen can verify it themselves.
 */
export function VerifiedSource({ data, loading }: { data: SessionSummary | null; loading: boolean }) {
  const { t, lang } = useT();
  const list = data?.sources ?? [];
  const official = list.filter((s) => s.kind === "official").length;
  return (
    <section id="verified-sources" className="panel area-src" style={{ ["--i" as string]: 2 }} aria-labelledby="src-title">
      <header className="panel-head">
        <div>
          <h2 className="panel-title" id="src-title">
            <span className="glyph" style={{ background: "var(--aqua)", boxShadow: "0 0 10px var(--aqua)" }} /> {t("src_title")}
          </h2>
          <div className="panel-sub">{t("src_sub")}</div>
        </div>
        {list.length > 0 && <span className="tag jade">✓ {official}/{list.length}</span>}
      </header>
      {!list.length ? (
        <div className="empty">{loading ? "…" : t("src_empty")}</div>
      ) : (
        <ul className="src-list">
          {list.slice(0, 8).map((s) => (
            <li key={s.url} className={`src-item ${s.kind}`}>
              <span className={`src-badge ${s.kind}`} title={s.kind === "official" ? t("src_official") : t("src_other")} aria-label={s.kind === "official" ? t("src_official") : t("src_other")}>
                {s.kind === "official" ? "🏛" : "🌐"}
              </span>
              <span className="src-main">
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="src-host">
                  {s.host} ↗
                </a>
                <small className="src-title">{s.title ?? s.url.replace(/^https?:\/\//, "").slice(0, 80)}</small>
                {s.schemes.length > 0 && <small className="src-schemes">{s.schemes.slice(0, 3).join(" · ")}</small>}
              </span>
              <span className="src-meta">
                <span className={`chip ${s.ok ? "hit" : "miss"}`}>{s.ok ? "✓" : "✕"} {t("src_read_live")}</span>
                <small>{relTime(s.last_read, lang)}{s.latency_ms ? ` · ${(s.latency_ms / 1000).toFixed(1)}s` : ""}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
