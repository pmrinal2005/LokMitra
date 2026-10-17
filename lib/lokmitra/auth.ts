import "server-only";
import { NextResponse } from "next/server";
import { cfg } from "./config";
import { safeEqual } from "./util";

/**
 * Operator guard for paid / mutating dashboard actions (Agent discovery, Browser sessions,
 * Monitor create/delete, profile deletion, Telegram setup).
 * - If ADMIN_TOKEN is unset the deck runs in open demo mode (every action allowed).
 * - Otherwise send `x-admin-token: <token>` (Settings page stores it in localStorage).
 * Citizen flows (ask / confirm / relay) are NOT admin-gated: they are protected by the
 * per-user rate limit, the confirmation gate and the wallet guard instead.
 */
export function isAdmin(req: Request): boolean {
  const t = cfg.adminToken();
  if (!t) return true;
  const h = req.headers.get("x-admin-token") || "";
  if (h && safeEqual(h, t)) return true;
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)lm_admin=([^;]+)/);
  return !!m && safeEqual(decodeURIComponent(m[1]), t);
}

export function requireAdmin(req: Request): Response | null {
  if (isAdmin(req)) return null;
  return NextResponse.json({ error: { code: "ADMIN_REQUIRED", message: "This action needs the operator token (Settings → Operator token)." } }, { status: 401, headers: { "Cache-Control": "no-store" } });
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Manual: ?secret=… */
export function isCron(req: Request): boolean {
  const s = cfg.cronSecret();
  if (!s) return isAdmin(req);
  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${s}`) return true;
  const q = new URL(req.url).searchParams.get("secret") || "";
  return (!!q && safeEqual(q, s)) || isAdmin(req);
}

/** TinyFish webhooks carry ?s=<WEBHOOK_SECRET> (we append it when registering webhook_url). */
export function isWebhook(req: Request): boolean {
  const s = cfg.webhookSecret();
  if (!s) return true;
  const q = new URL(req.url).searchParams.get("s") || "";
  return !!q && safeEqual(q, s);
}

export function sanitizeUserId(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return /^(web|tg|csc|email|anon):[A-Za-z0-9_.@-]{1,80}$/.test(s) ? s : null;
}
