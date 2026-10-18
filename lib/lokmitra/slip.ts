import "server-only";
import { createHmac } from "node:crypto";
import { cfg } from "./config";
import { safeEqual } from "./util";

/**
 * CSC slip token — a short HMAC of the report id. Printed on every slip (text + QR) so a
 * CSC operator, bank or panchayat officer can verify the slip was produced by this LokMitra
 * deployment and has not been edited: /report/<id>?t=<token> shows "Token verified".
 * Key: SESSION_SECRET → ADMIN_TOKEN → CRON_SECRET → TINYFISH_API_KEY (server-only, never exposed).
 */
function key() {
  return cfg.sessionSecret() || cfg.adminToken() || cfg.cronSecret() || process.env.TINYFISH_API_KEY || "lokmitra-dev";
}

export function slipToken(reportId: string): string {
  const h = createHmac("sha256", `lokmitra-slip:${key()}`).update(reportId).digest("base64url").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4, 8)}`;
}

export function verifySlip(reportId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  return safeEqual(slipToken(reportId), String(token).trim().toUpperCase());
}
