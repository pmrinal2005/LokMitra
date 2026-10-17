/**
 * TinyFish server-side client.
 * ------------------------------------------------------------------
 * - The API key NEVER leaves the server: it is read from process.env
 *   (TINYFISH_API_KEY) inside Next.js Route Handlers only.
 * - Endpoints follow the official OpenAPI specs published at
 *   https://agent.tinyfish.ai/v1/openapi/{main,search,fetch,browser}
 */
import "server-only";

export const TF_BASE = {
  agent: process.env.TINYFISH_AGENT_BASE_URL || "https://agent.tinyfish.ai",
  search: process.env.TINYFISH_SEARCH_BASE_URL || "https://api.search.tinyfish.ai",
  fetch: process.env.TINYFISH_FETCH_BASE_URL || "https://api.fetch.tinyfish.ai",
  browser: process.env.TINYFISH_BROWSER_BASE_URL || "https://api.browser.tinyfish.ai",
} as const;

export type TfService = keyof typeof TF_BASE;

export class TinyFishError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getApiKey(): string | null {
  const k = process.env.TINYFISH_API_KEY?.trim();
  return k ? k : null;
}

export function hasApiKey(): boolean {
  return getApiKey() !== null;
}

interface TfRequestInit {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  accept?: string;
}

function buildUrl(service: TfService, path: string, query?: TfRequestInit["query"]) {
  const base = TF_BASE[service].replace(/\/+$/, "");
  const url = new URL(base + (path.startsWith("/") ? path : `/${path}`));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/** Low-level request returning the raw Response (used for SSE + binary passthrough). */
export async function tfRaw(service: TfService, path: string, init: TfRequestInit = {}): Promise<Response> {
  const key = getApiKey();
  if (!key) {
    throw new TinyFishError(
      503,
      "TINYFISH_API_KEY_MISSING",
      "TINYFISH_API_KEY is not configured on the server. Add it to .env.local (local) or Vercel → Project → Settings → Environment Variables.",
    );
  }
  const controller = new AbortController();
  const timeout = init.timeoutMs ?? 30_000;
  const timer = timeout > 0 ? setTimeout(() => controller.abort(new Error("timeout")), timeout) : null;
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const headers: Record<string, string> = {
    "X-API-Key": key,
    Accept: init.accept ?? "application/json",
    "User-Agent": "LokMitra-CommandDeck/1.0 (+nextjs)",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(buildUrl(service, path, init.query), {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    return res;
  } catch (e) {
    const aborted = controller.signal.aborted;
    throw new TinyFishError(
      aborted ? 504 : 502,
      aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNREACHABLE",
      aborted ? `TinyFish ${service} did not respond within ${timeout}ms` : `Could not reach TinyFish ${service}: ${(e as Error).message}`,
    );
  } finally {
    // For streaming responses the caller keeps reading after we return; only clear
    // the connect timer — body reads are bounded by the caller's own signal.
    if (timer) clearTimeout(timer);
  }
}

/** JSON request with normalized errors. */
export async function tf<T = unknown>(service: TfService, path: string, init: TfRequestInit = {}): Promise<T> {
  const res = await tfRaw(service, path, init);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } | string } | undefined)?.error;
    const code = typeof err === "object" && err?.code ? err.code : `HTTP_${res.status}`;
    const message =
      typeof err === "object" && err?.message ? err.message : typeof err === "string" ? err : text.slice(0, 300) || res.statusText;
    throw new TinyFishError(res.status, code, message, json);
  }
  return (json ?? (text as unknown)) as T;
}

/* ------------------------------------------------------------------ */
/* Typed shapes (subset of the official OpenAPI schemas)               */
/* ------------------------------------------------------------------ */

export type RunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface TfRunError {
  code?: string;
  message: string;
  category: "SYSTEM_FAILURE" | "AGENT_FAILURE" | "BILLING_FAILURE" | "UNKNOWN";
  retry_after?: number | null;
  help_url?: string;
  help_message?: string;
}

export interface TfRun {
  run_id: string;
  status: RunStatus;
  goal: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  num_of_steps: number | null;
  result: Record<string, unknown> | null;
  error: TfRunError | null;
  streaming_url?: string | null;
  video_url?: string | null;
  browser_config?: Record<string, unknown> | null;
  steps?: TfRunStep[];
}

export interface TfRunStep {
  id: string;
  timestamp: string;
  status: RunStatus;
  action: string | null;
  screenshot: string | null;
  html: string | null;
  duration: string | null;
}

export interface TfRunList {
  data: TfRun[];
  pagination: { total: number; next_cursor: string | null; has_more: boolean };
}

export interface TfWallet {
  available_balance: string;
  currency: "USD";
  as_of: string;
  auto_reload: { state: string; threshold?: string; recharge_to?: string } | null;
  pending_top_up: { amount: string; started_at: string } | null;
  rates: { meters: { label: string; unit_amount: string; currency: "USD"; per?: string }[]; as_of: string } | null;
}

export interface TfUsagePage<T> {
  items: T[];
  total: number;
  limit: number;
  page: number;
  total_pages: number;
  has_more: boolean;
}

export interface TfSearchUsageItem {
  id: number;
  request_id: string;
  query: string;
  status_code: number;
  result_count: number;
  cached: boolean | null;
  created_at: string;
}

export interface TfFetchUsageItem {
  id: string;
  url: string;
  final_url: string;
  title: string | null;
  language: string | null;
  status: "completed" | "failed";
  latency_ms: number | null;
  created_at: string;
  error: string | null;
}

export interface TfBrowserUsageItem {
  session_id: string;
  mode: string;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  status: "running" | "ended" | "created";
  created_at: string;
}

export interface TfMonitor {
  id: string;
  name?: string | null;
  type: "fetch" | "search";
  config: Record<string, unknown>;
  schedule_cron: string;
  status: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface TfSearchResponse {
  query: string;
  results: { position: number; site_name: string; snippet: string; title: string; url: string; date?: string }[];
  total_results: number;
  page: number;
  request_id?: string;
}

export interface TfFetchResponse {
  results: {
    url: string;
    final_url: string | null;
    title: string | null;
    description?: string | null;
    language: string | null;
    format: string;
    text: unknown;
    latency_ms?: number | null;
  }[];
  errors: { url: string; error: string; status?: number }[];
  request_id?: string;
}
