import "server-only";
import { cfg } from "./config";
import { logRun } from "./store";

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
