import { cfg } from "@/lib/lokmitra/config";
import { reportEmailHtml, sendEmail } from "@/lib/lokmitra/email";
import { bad, body, err, json } from "@/lib/lokmitra/http";
import { getReport } from "@/lib/lokmitra/pipeline";
import { rateLimit } from "@/lib/lokmitra/store";

export const dynamic = "force-dynamic";

/** POST /api/lokmitra/report/:id/email { to } — Resend copy of the report (CSC operators / family). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { to } = await body<{ to?: string }>(req);
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return bad("valid `to` e-mail required");
  const rl = await rateLimit(`email:${to}`, 1);
  if (!rl.ok) return err(Object.assign(new Error("too many e-mails, try later"), { status: 429 }));
  const r = (await getReport(id)) as Record<string, unknown> | null;
  if (!r) return err(Object.assign(new Error("report not found"), { status: 404 }));
  const base = cfg.publicBaseUrl() || new URL(req.url).origin;
  const res = await sendEmail({
    to,
    subject: "LokMitra · Citizen Benefit Report",
    html: reportEmailHtml({ summary_local: String(r.summary_local ?? ""), summary_en: String(r.summary_en ?? ""), language: String(r.language ?? "en"), sources: (r.sources as string[]) ?? [], report_id: id, link: `${base}/report/${id}` }),
    text: String(r.summary_local ?? r.summary_en ?? ""),
  });
  return res.id ? json({ sent: true, id: res.id }) : err(Object.assign(new Error(res.error ?? "send failed"), { status: res.error?.includes("not configured") ? 503 : 502 }));
}
