import { fail, ok } from "@/lib/api-helpers";
import { tf, type TfWallet } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/** GET /api/tinyfish/wallet → GET agent.tinyfish.ai/v1/wallet */
export async function GET() {
  try {
    return ok(await tf<TfWallet>("agent", "/v1/wallet", { timeoutMs: 15_000 }));
  } catch (e) {
    return fail(e);
  }
}
