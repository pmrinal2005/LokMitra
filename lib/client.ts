"use client";
/**
 * Browser-side helpers shared by every dashboard page.
 *  - api(): JSON fetch that attaches the operator token (Settings → Operator token, kept in localStorage)
 *  - ssePost(): POST + parse a Server-Sent Events response (LokMitra routes emit `event:` + `data:`)
 *  - citizenId(): stable anonymous web identity ("web:<id>") for rate limits / chat follow-ups / alerts
 */

export const ADMIN_KEY = "lm-admin-token";

export function adminToken(): string {
  try {
    return localStorage.getItem(ADMIN_KEY) || "";
  } catch {
    return "";
  }
}

export function setAdminToken(t: string) {
  try {
    if (t) localStorage.setItem(ADMIN_KEY, t);
    else localStorage.removeItem(ADMIN_KEY);
    document.cookie = t ? `lm_admin=${encodeURIComponent(t)}; path=/; SameSite=Strict; max-age=2592000` : "lm_admin=; path=/; max-age=0";
  } catch {
    /* ignore */
  }
}

export function citizenId(): string {
  try {
    let id = localStorage.getItem("lm-citizen");
    if (!id) {
      id = `web:${(crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 24)}`;
      localStorage.setItem("lm-citizen", id);
    }
    return id;
  } catch {
    return "web:anonymous";
  }
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const t = adminToken();
  if (t) headers["x-admin-token"] = t;
  const res = await fetch(path, { method: init.method ?? (init.body !== undefined ? "POST" : "GET"), headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined, signal: init.signal, cache: "no-store" });
  const text = await res.text();
  let j: unknown = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    j = text;
  }
  if (!res.ok) {
    const e = (j as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? (typeof j === "string" ? j.slice(0, 200) : res.statusText));
  }
  return j as T;
}

export interface SseMsg {
  event: string;
  data: Record<string, unknown>;
}

/** POST JSON and iterate SSE events until the stream ends. */
export async function ssePost(path: string, body: unknown, onMsg: (m: SseMsg) => void, signal?: AbortSignal): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream" };
  const t = adminToken();
  if (t) headers["x-admin-token"] = t;
  const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null);
    throw new ApiError(res.status, j?.error?.code ?? `HTTP_${res.status}`, j?.error?.message ?? `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let m: RegExpExecArray | null;
    while ((m = /\r?\n\r?\n/.exec(buf))) {
      const raw = buf.slice(0, m.index);
      buf = buf.slice(m.index + m[0].length);
      let event = "message";
      const data: string[] = [];
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (!data.length) continue;
      try {
        onMsg({ event, data: JSON.parse(data.join("\n")) });
      } catch {
        /* ignore malformed */
      }
    }
  }
}

export const fmtUsd = (n: number | null | undefined, d = 3) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `$${n.toFixed(d)}`);
export const ago = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s)) return "—";
  if (s < 60) return `${Math.max(0, s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
export const hostOf = (u: string | null | undefined) => {
  try {
    return new URL(String(u)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
