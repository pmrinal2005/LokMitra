import { badRequest, fail, ok, readJson } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/lokmitra/auth";
import { tf } from "@/lib/tinyfish";

export const dynamic = "force-dynamic";

/** GET /api/tinyfish/profiles → GET /v1/profiles (Browser Context Profiles) */
export async function GET() {
  try {
    return ok(await tf<{ profiles: unknown[] }>("agent", "/v1/profiles", { timeoutMs: 15_000 }));
  } catch (e) {
    return fail(e);
  }
}

const COUNTRIES = ["US", "GB", "CA", "AU", "DE", "FR", "IT", "ES", "NL", "JP", "SG", "BR", "IN"];

/** POST /api/tinyfish/profiles { name, set_as_default?, proxy_country_code? } → POST /v1/profiles (operator) */
export async function POST(req: Request) {
  const deny = requireAdmin(req);
  if (deny) return deny;
  const b = (await readJson<Record<string, unknown>>(req)) ?? {};
  if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 100) return badRequest("`name` (1–100 chars) required");
  const body: Record<string, unknown> = { name: b.name.trim() };
  if (typeof b.set_as_default === "boolean") body.set_as_default = b.set_as_default;
  if (b.proxy_country_code === null || (typeof b.proxy_country_code === "string" && COUNTRIES.includes(b.proxy_country_code))) body.proxy_country_code = b.proxy_country_code;
  try {
    return ok(await tf("agent", "/v1/profiles", { method: "POST", body, timeoutMs: 20_000 }), { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
