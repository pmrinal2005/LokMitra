import { ok } from "@/lib/api-helpers";
import { hasApiKey, TF_BASE } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok({
    ok: true,
    service: "lokmitra-command-deck",
    tinyfish_configured: hasApiKey(),
    upstreams: TF_BASE,
    time: new Date().toISOString(),
  });
}
