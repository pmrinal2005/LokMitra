import "server-only";
import { NextResponse } from "next/server";
import { TinyFishError } from "../tinyfish";
import { sseLine } from "./util";

export const NS = { "Cache-Control": "no-store, max-age=0" };

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: NS });
}

export function err(e: unknown, fallbackStatus = 500) {
  if (e instanceof TinyFishError) return NextResponse.json({ error: { code: e.code, message: e.message, upstream: e.details ?? null } }, { status: e.status, headers: NS });
  const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : fallbackStatus;
  return NextResponse.json({ error: { code: status === 429 ? "RATE_LIMITED" : status === 410 ? "EXPIRED" : status === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR", message: e instanceof Error ? e.message : String(e) } }, { status, headers: NS });
}

export function bad(message: string) {
  return NextResponse.json({ error: { code: "BAD_REQUEST", message } }, { status: 400, headers: NS });
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return ((await req.json()) ?? {}) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Server-Sent Events response. `run(send)` streams named events; a heartbeat comment
 * every 15s keeps proxies (and Vercel) from closing idle connections.
 */
export function sse(req: Request, run: (send: (event: string, data: unknown) => void, signal: AbortSignal) => Promise<void>) {
  const enc = new TextEncoder();
  const ctrl = new AbortController();
  req.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          closed = true;
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\n${sseLine(data)}`);
      const hb = setInterval(() => write(`: hb ${Date.now()}\n\n`), 15_000);
      try {
        await run(send, ctrl.signal);
      } catch (e) {
        send("error", { message: (e as Error).message, status: (e as { status?: number }).status ?? 500 });
      } finally {
        clearInterval(hb);
        send("done", { at: new Date().toISOString() });
        closed = true;
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      ctrl.abort();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
