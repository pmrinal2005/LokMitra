import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/lokmitra/auth";
import { cfg } from "@/lib/lokmitra/config";
import { body } from "@/lib/lokmitra/http";

export const dynamic = "force-dynamic";

/**
 * Role resolution for the dashboard UI (citizen vs operator).
 *   operator ⇔ the request is admin (valid ADMIN_TOKEN header/cookie, or open demo mode with no ADMIN_TOKEN)
 *              AND the browser chose the operator view (cookie lm_view=operator) — when ADMIN_TOKEN is set,
 *              a valid token alone is enough.
 * Citizens never see Wallet / Usage & Infrastructure / Settings. This is UI gating only — every paid or
 * mutating API remains protected server-side by requireAdmin().
 *
 * GET  /api/lokmitra/role                 → { role, is_admin, admin_required, view }
 * POST /api/lokmitra/role { view }        → sets the view cookie; operator view is refused (403) without admin.
 */
function viewOf(req: Request): "operator" | "citizen" {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)lm_view=([^;]+)/);
  return m && decodeURIComponent(m[1]) === "operator" ? "operator" : "citizen";
}

function resolve(req: Request, view = viewOf(req)) {
  const admin = isAdmin(req);
  const required = !!cfg.adminToken();
  const role: "operator" | "citizen" = admin && (required || view === "operator") ? "operator" : "citizen";
  return { role, is_admin: admin, admin_required: required, view };
}

export async function GET(req: Request) {
  return NextResponse.json(resolve(req), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const b = await body<{ view?: string }>(req);
  const view = b.view === "operator" ? "operator" : "citizen";
  const r = resolve(req, view);
  if (view === "operator" && !r.is_admin) {
    return NextResponse.json({ ...r, error: { code: "ADMIN_REQUIRED", message: "Operator view needs the operator token (Settings → Operator token)." } }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const res = NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set("lm_view", view, { path: "/", sameSite: "strict", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
