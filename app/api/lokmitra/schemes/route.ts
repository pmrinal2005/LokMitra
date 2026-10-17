import { json } from "@/lib/lokmitra/http";
import { LANGUAGES } from "@/lib/lokmitra/languages";
import { SCHEMES, STATES } from "@/lib/lokmitra/schemes";

export const dynamic = "force-static";

/** GET /api/lokmitra/schemes — public registry for UI selectors (schemes, states, 22 languages). */
export async function GET() {
  return json({
    schemes: SCHEMES.map((s) => ({ id: s.id, name: s.name, hindi: s.hindi, sector: s.sector, entry: s.entry, has_status: !!s.statusUrl, state_specific: !!s.stateSpecific, benefit: s.benefit })),
    states: STATES.map((s) => ({ code: s.code, name: s.name, hindi: s.hindi, has_land: !!s.land })),
    languages: LANGUAGES.map((l) => ({ code: l.code, name: l.name, native: l.native, speech: l.speech, priority: !!l.priority })),
  });
}
