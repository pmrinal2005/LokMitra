import { cfg } from "@/lib/lokmitra/config";
import { sendEmail } from "@/lib/lokmitra/email";
import { bad, body, err, json, originOf } from "@/lib/lokmitra/http";
import { getReport } from "@/lib/lokmitra/pipeline";
import { buildReportPayload } from "@/lib/lokmitra/report-payload";
import { rateLimit } from "@/lib/lokmitra/store";

export const dynamic = "force-dynamic";

const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/**
 * GET /api/lokmitra/report/:id/email?preview=1 — renders the exact structured HTML e-mail
 * (inline-styled, table-based, QR + slip token) in the browser. Works without RESEND_API_KEY.
 * ?format=json returns { subject, html, text, link, token } instead.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!validId(id)) return bad("invalid report id");
  const r = (await getReport(id)) as Record<string, unknown> | null;
  if (!r) return err(Object.assign(new Error("report not found (memory store resets on redeploy — configure Supabase)"), { status: 404 }));
  const p = await buildReportPayload(r, { base: cfg.publicBaseUrl() || originOf(req) });
  if (new URL(req.url).searchParams.get("format") === "json") return json({ subject: p.subject, html: p.html, text: p.text, link: p.link, token: p.token, structured: !!p.structured, resend_configured: !!cfg.resendKey() });
  const banner = `<div style="font:12px system-ui;background:#06243a;color:#2EF2C3;padding:8px 14px">E-mail preview · subject: <b style="color:#fff">${p.subject.replace(/</g, "&lt;")}</b> · Resend ${cfg.resendKey() ? "configured" : "NOT configured (preview only)"}</div>`;
  return new Response(p.html.replace(/<body([^>]*)>/, `<body$1>${banner}`), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

/** POST /api/lokmitra/report/:id/email { to } — Resend copy of the structured report (CSC operators / family). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!validId(id)) return bad("invalid report id");
  const { to } = await body<{ to?: string }>(req);
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return bad("valid `to` e-mail required");
  const rl = await rateLimit(`email:${to}`, 1);
  if (!rl.ok) return err(Object.assign(new Error("too many e-mails, try later"), { status: 429 }));
  const r = (await getReport(id)) as Record<string, unknown> | null;
  if (!r) return err(Object.assign(new Error("report not found"), { status: 404 }));
  const p = await buildReportPayload(r, { base: cfg.publicBaseUrl() || originOf(req) });
  const res = await sendEmail({ to, subject: p.subject, html: p.html, text: p.text });
  return res.id ? json({ sent: true, id: res.id, structured: !!p.structured }) : err(Object.assign(new Error(res.error ?? "send failed"), { status: res.error?.includes("not configured") ? 503 : 502 }));
}
