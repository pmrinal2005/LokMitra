import { sse } from "@/lib/lokmitra/http";
import { judgeTick } from "@/lib/lokmitra/judge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/lokmitra/judge/stream — SSE telemetry for the Judge Console.
 * `tick` events every ~4 s (wallet, informational usage, live calls per surface, live Agent run + streaming_url).
 * The stream closes itself after ~280 s (Vercel function limit); EventSource reconnects automatically.
 */
export async function GET(req: Request) {
  const every = Math.min(15_000, Math.max(2_500, Number(new URL(req.url).searchParams.get("every")) || 4_000));
  return sse(req, async (send, signal) => {
    const until = Date.now() + 280_000;
    while (!signal.aborted && Date.now() < until) {
      try {
        send("tick", await judgeTick());
      } catch (e) {
        send("warn", { message: (e as Error).message });
      }
      await new Promise((r) => setTimeout(r, every));
    }
  });
}
