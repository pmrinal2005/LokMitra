import "server-only";
import { cfg } from "./config";
import { logRun } from "./store";
import type { StructuredReport } from "./report-shape";
import { keyLabel, reportToMarkdown, reportHost, sectorLabel, sortSectors, statusLabel, verdictLabel } from "./report-shape";
import { L } from "./glossary";

/** Resend (free tier) — Citizen Benefit Report e-mails + sentinel alerts. */
export async function sendEmail(opts: { to: string; subject: string; html: string; text?: string }): Promise<{ id: string | null; error?: string }> {
  const key = cfg.resendKey();
  if (!key) return { id: null, error: "RESEND_API_KEY not configured" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opts.to)) return { id: null, error: "invalid e-mail address" };
  const t0 = Date.now();
  try {
    const res = await fetch(`${cfg.resendBase()}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.resendFrom(), to: [opts.to], subject: opts.subject.slice(0, 200), html: opts.html, text: opts.text }),
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    void logRun({ surface: "email", purpose: "resend", status: res.ok ? "ok" : "error", latency_ms: Date.now() - t0, meta: { http: res.status } });
    return res.ok ? { id: j.id ?? null } : { id: null, error: j.message ?? `resend ${res.status}` };
  } catch (e) {
    return { id: null, error: (e as Error).message };
  }
}

const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Very small markdown → HTML (headings, bullets, bold, links) for report e-mails. */
export function mdToHtml(md: string) {
  const lines = esc(md).split(/\n/);
  const out: string[] = [];
  let inList = false;
  for (const l of lines) {
    const li = l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (li) {
      if (!inList) (out.push("<ul>"), (inList = true));
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (inList) (out.push("</ul>"), (inList = false));
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) out.push(`<h${h[1].length + 1} style="margin:16px 0 6px;color:#0b5d4b">${inline(h[2])}</h${h[1].length + 1}>`);
    else if (l.trim()) out.push(`<p style="margin:6px 0">${inline(l)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}
function inline(s: string) {
  return s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1">$1</a>');
}

export function reportEmailHtml(r: { summary_local: string; summary_en: string; language: string; sources: string[]; report_id: string; link?: string }) {
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,'Noto Sans Devanagari',sans-serif;max-width:640px;margin:auto;padding:20px;color:#111">
  <h1 style="font-size:20px;margin:0 0 4px">LokMitra · Citizen Benefit Report</h1>
  <div style="color:#666;font-size:12px;margin-bottom:16px">Report ${esc(r.report_id)} · ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</div>
  ${mdToHtml(r.summary_local)}
  ${r.language !== "en" ? `<hr style="margin:20px 0;border:0;border-top:1px solid #ddd"><details><summary style="cursor:pointer;color:#666">English version</summary>${mdToHtml(r.summary_en)}</details>` : ""}
  <hr style="margin:20px 0;border:0;border-top:1px solid #ddd">
  <div style="font-size:12px;color:#555"><b>Official sources</b><ul>${r.sources.map((s) => `<li><a href="${esc(s)}">${esc(s)}</a></li>`).join("")}</ul>
  ${r.link ? `<p><a href="${esc(r.link)}">Open this report online / print slip with QR</a></p>` : ""}
  <p>LokMitra never asks for money. Always verify on the official portal or at your nearest CSC.</p></div>
  </body></html>`;
}

/* ------------------------------------------------------------------ */
/* Structured Citizen Benefit Report e-mail (P5)                       */
/* Inline styles + tables only (Gmail / Outlook safe), localised labels */
/* from the offline glossary, QR image of the report link.              */
/* ------------------------------------------------------------------ */

const VCOL: Record<string, [string, string]> = { likely: ["#106b3a", "#eef8f1"], check: ["#8a5300", "#fff7e8"], unlikely: ["#a3122e", "#fdf0f2"], na: ["#555", "#f3f4f6"] };
const badge = (text: string, v: string) => `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;color:${VCOL[v]?.[0] ?? "#555"};background:${VCOL[v]?.[1] ?? "#f3f4f6"};border:1px solid ${VCOL[v]?.[0] ?? "#999"}33">${esc(text)}</span>`;

export function structuredEmailHtml(o: { r: StructuredReport; lang: string; report_id: string; link?: string; qrDataUrl?: string | null; token?: string | null; query?: string | null; cost_usd?: number }) {
  const { r, lang } = o;
  const loc = lang !== "en";
  const pick = (en: string, local?: string) => (loc && local ? local : en);
  const sectors = sortSectors(r.sectors)
    .map((s) => {
      const items = s.items
        .map((it) => {
          const facts = it.facts.slice(0, 5).map((f) => `<tr><td style="padding:2px 8px 2px 0;color:#666;font-size:12px;white-space:nowrap;vertical-align:top">${esc(keyLabel(f.key, lang))}</td><td style="padding:2px 0;font-size:13px">${esc(pick(f.value, f.value_local))}</td></tr>`).join("");
          const reasons = (loc && it.reasons_local?.length ? it.reasons_local : it.reasons).slice(0, 2).join(" ");
          const fc = it.fact_check.filter((f) => f.status !== "not_stated").map((f) => `<span style="display:inline-block;margin:2px 4px 0 0;padding:1px 6px;border-radius:6px;font-size:11px;${f.status === "confirmed" ? "color:#106b3a;background:#eef8f1" : "color:#a3122e;background:#fdf0f2"}">${f.status === "confirmed" ? "✓" : "⚠"} ${esc(f.label)}: ${esc(f.status === "confirmed" ? f.canonical : `${f.found} ≠ ${f.canonical}`)}</span>`).join("");
          const diy = (loc && it.diy_local?.length ? it.diy_local : it.diy)[0];
          return `<div style="border-top:1px dashed #dde;padding:8px 0">
            <div><b style="font-size:14px">${esc(it.scheme_name)}</b> ${it.verdict !== "na" ? badge(verdictLabel(it.verdict, lang), it.verdict) : ""} <span style="font-size:11px;color:#666">· ${esc(statusLabel(it.status, lang))}</span></div>
            ${facts ? `<table role="presentation" style="border-collapse:collapse;margin-top:4px">${facts}</table>` : ""}
            ${reasons ? `<div style="font-size:12px;color:#555;margin-top:4px"><b>${esc(L("why", lang))}:</b> ${esc(reasons)}</div>` : ""}
            ${fc ? `<div style="margin-top:4px">${fc}</div>` : ""}
            ${diy && (it.status !== "ok" || it.verdict === "check") ? `<div style="font-size:12px;color:#555;margin-top:4px"><b>${esc(L("diy", lang))}:</b> ${esc(diy)}</div>` : ""}
            ${it.sources[0] ? `<div style="font-size:11px;margin-top:4px"><a href="${esc(it.sources[0])}" style="color:#0b5d4b">${esc(reportHost(it.sources[0]))} ↗</a></div>` : ""}
          </div>`;
        })
        .join("");
      return `<div style="border:1px solid #dde;border-radius:12px;padding:10px 12px;margin:10px 0"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#0b5d4b;font-weight:700">${s.icon} ${esc(sectorLabel(s.id, lang))}</div>${items}</div>`;
    })
    .join("");
  const list = (title: string, rows: string[], tone = "#0b5d4b", bg = "#fff") => (rows.length ? `<div style="border:1px solid ${tone}44;background:${bg};border-radius:12px;padding:10px 12px;margin:10px 0"><div style="font-weight:700;color:${tone};font-size:13px;margin-bottom:4px">${title}</div><ul style="margin:0;padding-left:18px;font-size:13px">${rows.map((x) => `<li style="margin:3px 0">${x}</li>`).join("")}</ul></div>` : "");
  const contra = r.contradictions.map((c) => `${esc(pick(c.text, c.text_local))}${c.source && /^https?:/.test(c.source) ? ` <a href="${esc(c.source)}" style="color:#a3122e">${esc(reportHost(c.source))}</a>` : ""}`);
  const sent = r.sentinel.map((s) => `<b>${esc(s.scheme_name)}</b> (${esc(s.kind)}): ${esc(pick(s.summary ?? "—", s.summary_local))}`);
  const also = r.also_eligible.map((a) => `<a href="${esc(a.entry)}" style="color:#0b5d4b;font-weight:600">${esc(a.name)}</a> ${badge(verdictLabel(a.verdict, lang), a.verdict)} — ${esc(a.benefit)}`);
  const steps = r.next_steps.map((n) => `${esc(pick(n.text, n.text_local))}${n.url ? ` <a href="${esc(n.url)}" style="color:#0b5d4b">${esc(reportHost(n.url))}</a>` : ""}`);
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(L("title", lang))}</title></head>
<body style="margin:0;background:#f4f6f8;font-family:system-ui,-apple-system,'Segoe UI','Noto Sans','Noto Sans Devanagari',sans-serif;color:#111">
<table role="presentation" width="100%" style="border-collapse:collapse"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" style="max-width:680px;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:#06243a;color:#fff;padding:16px 20px">
  <div style="font-size:12px;letter-spacing:.2em;color:#2EF2C3">LOKMITRA × TINYFISH</div>
  <div style="font-size:20px;font-weight:700;margin-top:2px">${esc(L("title", lang))}</div>
  <div style="font-size:12px;color:#b8c7d4;margin-top:4px">#${esc(o.report_id.slice(0, 8))} · ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST${r.state_code ? ` · ${esc(r.state_code)}` : ""}${r.persona ? ` · ${esc(r.persona)}` : ""}</div>
</td></tr>
<tr><td style="padding:16px 20px">
  <div style="font-size:15px;font-weight:600">${esc(L("greeting", lang))}</div>
  ${o.query ? `<div style="font-size:12px;color:#666;margin-top:4px">${esc(L("question", lang))}: ${esc(o.query)}</div>` : ""}
  <p style="font-size:14px;line-height:1.5;margin:10px 0">${esc(pick(r.headline, r.headline_local))}</p>
  <div style="font-size:11px;color:#555">● ${r.stats.live_sections ?? r.stats.sections}/${r.stats.sections} ${esc(L("live_fetched", lang))} · ✓ ${r.stats.facts_confirmed} ${esc(L("confirmed", lang))}${r.stats.facts_contradicted ? ` · ⚠ ${r.stats.facts_contradicted}` : ""} · ${esc(L("cost", lang))} $${Number(o.cost_usd ?? 0).toFixed(3)}</div>
  ${sectors}
  ${list(`⚠ ${esc(L("contradictions", lang))}`, contra.length ? contra : [`✓ ${esc(L("no_contradictions", lang))}`], contra.length ? "#a3122e" : "#106b3a", contra.length ? "#fdf0f2" : "#fff")}
  ${list(`🔔 ${esc(L("sentinel", lang))}`, sent)}
  ${list(`✨ ${esc(L("also_eligible", lang))}`, also)}
  ${list(`➡ ${esc(L("next_steps", lang))}`, steps)}
  ${list(esc(L("sources", lang)), r.sources.slice(0, 8).map((u) => `<a href="${esc(u)}" style="color:#0b5d4b;word-break:break-all">${esc(u)}</a>`), "#333")}
  <table role="presentation" style="border-collapse:collapse;margin-top:12px;border:1px dashed #99a;border-radius:10px;width:100%"><tr>
    ${o.qrDataUrl ? `<td style="padding:10px;width:110px"><img src="${o.qrDataUrl}" width="100" height="100" alt="QR"></td>` : ""}
    <td style="padding:10px;font-size:12px;color:#333">
      ${o.token ? `<div>${esc(L("slip_token", lang))}: <b style="font-family:monospace;font-size:16px;letter-spacing:.15em">${esc(o.token)}</b></div>` : ""}
      ${o.link ? `<div style="margin-top:4px"><a href="${esc(o.link)}" style="color:#0b5d4b">${esc(L("report_qr", lang))} ↗</a></div>` : ""}
      <div style="margin-top:6px;color:#666">LokMitra never asks for money or OTPs over the phone. Always verify on the official portal or at your nearest CSC.</div>
    </td></tr></table>
</td></tr></table></td></tr></table></body></html>`;
}

/** Plain-text alternative part (deliverability + screen readers). */
export function structuredEmailText(r: StructuredReport, lang: string, link?: string) {
  return `${reportToMarkdown(r, lang, { local: lang !== "en" }).replace(/\*\*/g, "")}${link ? `\n\n${link}` : ""}`;
}
