import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cfg } from "./config";

export const nowIso = () => new Date().toISOString();
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const shortId = (n = 10) => randomBytes(16).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, n);
export const uuid = () => globalThis.crypto.randomUUID();

export function clip(s: string | null | undefined, n = 280) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export function hostOf(u: string | null | undefined) {
  try {
    return new URL(String(u)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isGovHost(u: string) {
  const h = hostOf(u);
  return /(\.gov\.in|\.nic\.in|\.gov$|^gov\.in|myscheme\.gov\.in)$/.test(h) || h.endsWith(".gov.in") || h.endsWith(".nic.in");
}

/**
 * PII redaction for anything that is logged or persisted (runs_log.meta, reports).
 * Aadhaar (12 digits), mobile (10 digits starting 6-9), long account / registration numbers, OTP-ish codes.
 */
export function redact(text: string): string {
  return String(text ?? "")
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "XXXX-XXXX-####")
    .replace(/\b[6-9]\d{9}\b/g, (m) => `${m.slice(0, 2)}XXXXXX${m.slice(-2)}`)
    .replace(/\b[A-Z]{2,4}\d{8,14}\b/gi, (m) => `${m.slice(0, 3)}…${m.slice(-3)}`)
    .replace(/\b\d{11,18}\b/g, (m) => `${"X".repeat(m.length - 4)}${m.slice(-4)}`);
}

export function mask(v: string) {
  const s = String(v ?? "");
  if (s.length <= 4) return "•".repeat(s.length);
  return `${"•".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/* Symmetric encryption for ephemeral identifiers (AES-256-GCM)        */
/* Key = SESSION_SECRET (or ADMIN_TOKEN / CRON_SECRET) → sha256.       */
/* Without any secret a per-process random key is used (memory mode).  */
/* ------------------------------------------------------------------ */
const g = globalThis as unknown as { __lmKey?: Buffer };
function key(): Buffer {
  const secret = process.env.SESSION_SECRET?.trim() || cfg.adminToken() || cfg.cronSecret();
  if (secret) return createHash("sha256").update(`lokmitra:${secret}`).digest();
  // no explicit secret: derive from the (server-only) TinyFish key so every serverless instance shares one key —
  // sealed task tokens from /ask then still open on a different /confirm instance
  const tf = process.env.TINYFISH_API_KEY?.trim();
  if (tf) return createHash("sha256").update(`lokmitra:seal:${tf}`).digest();
  return (g.__lmKey ??= randomBytes(32));
}
export function seal(obj: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}
export function unseal<T = unknown>(token: string | null | undefined): T | null {
  try {
    const [v, iv, tag, data] = String(token ?? "").split(".");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Simple concurrency-limited map. */
export async function pMap<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function uniq<T>(arr: T[]) {
  return [...new Set(arr)];
}

/** Parse a TinyFish SSE text stream into JSON events. */
export async function* sseEvents(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let m: RegExpExecArray | null;
      while ((m = /\r?\n\r?\n/.exec(buf))) {
        const raw = buf.slice(0, m.index);
        buf = buf.slice(m.index + m[0].length);
        const data = raw
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue;
        try {
          yield JSON.parse(data);
        } catch {
          /* ignore malformed */
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

export const sseLine = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
