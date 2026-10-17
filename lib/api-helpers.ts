import "server-only";
import { NextResponse } from "next/server";
import { TinyFishError } from "./tinyfish";

export const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export function ok<T>(data: T, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status ?? 200, headers: NO_STORE });
}

export function fail(e: unknown) {
  if (e instanceof TinyFishError) {
    return NextResponse.json(
      { error: { code: e.code, message: e.message, upstream: e.details ?? null } },
      { status: e.status, headers: NO_STORE },
    );
  }
  const msg = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: msg } }, { status: 500, headers: NO_STORE });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: { code: "BAD_REQUEST", message } }, { status: 400, headers: NO_STORE });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Pick only allowed keys from URLSearchParams. */
export function pickParams(sp: URLSearchParams, keys: string[]) {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = sp.get(k);
    if (v !== null && v !== "") out[k] = v;
  }
  return out;
}

export function isHttpUrl(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

export const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
