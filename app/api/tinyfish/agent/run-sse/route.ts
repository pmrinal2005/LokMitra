import { badRequest, fail, NO_STORE, readJson } from "@/lib/api-helpers";
import { buildAgentBody } from "@/lib/agent-body";
import { tfRaw } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel: allow long-lived streaming. Hobby caps at 60s (Fluid compute: up to 300s); Pro up to 800s.
export const maxDuration = 300;

/**
 * POST /api/tinyfish/agent/run-sse → POST /v1/automation/run-sse
 * Pipes TinyFish's Server-Sent Events stream (STARTED, STREAMING_URL, PROGRESS,
 * TF_API_RESULT, HEARTBEAT, COMPLETE) straight through to the browser.
 * If the client disconnects, the upstream fetch is aborted.
 */
export async function POST(req: Request) {
  const { body, error } = buildAgentBody(await readJson(req));
  if (error) return badRequest(error);
  try {
    const upstream = await tfRaw("agent", "/v1/automation/run-sse", {
      method: "POST",
      body,
      accept: "text/event-stream",
      timeoutMs: 45_000, // connect / first-byte timeout only
      signal: req.signal,
    });
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      return new Response(text || JSON.stringify({ error: { code: `HTTP_${upstream.status}`, message: upstream.statusText } }), {
        status: upstream.status || 502,
        headers: { "Content-Type": "application/json", ...NO_STORE },
      });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
