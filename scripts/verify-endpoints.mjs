#!/usr/bin/env node
/**
 * LokMitra deck — endpoint verifier.
 *   node scripts/verify-endpoints.mjs [baseUrl]        (default http://localhost:3000)
 *   DECK_VERIFY_PAID=1 node scripts/verify-endpoints.mjs   → also launches a tiny paid Agent SSE run
 *
 * Read-only + free calls by default (wallet, runs, usage, monitors list, profiles,
 * Search, Fetch). Exits non-zero if any check fails.
 */
const BASE = (process.argv[2] || process.env.DECK_URL || "http://localhost:3000").replace(/\/+$/, "");
const PAID = process.env.DECK_VERIFY_PAID === "1";
const results = [];

async function check(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, note: note ?? "" });
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, note: e.message });
  }
}
async function j(path, init) {
  const r = await fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!r.ok) throw new Error(`HTTP ${r.status} ${body?.error?.code ?? ""} ${body?.error?.message ?? String(text).slice(0, 160)}`);
  return body;
}
const need = (cond, msg) => { if (!cond) throw new Error(msg); };

await check("GET /api/health", async () => {
  const b = await j("/api/health");
  need(b.ok === true, "ok!=true");
  need(b.tinyfish_configured === true, "TINYFISH_API_KEY not configured on server");
  return "key configured";
});
await check("GET /api/tinyfish/wallet", async () => {
  const b = await j("/api/tinyfish/wallet");
  need(typeof b.available_balance === "string", "no available_balance");
  return `$${b.available_balance} ${b.currency}`;
});
let firstRun = null;
await check("GET /api/tinyfish/runs", async () => {
  const b = await j("/api/tinyfish/runs?limit=5");
  need(Array.isArray(b.data), "no data[]");
  firstRun = b.data[0] ?? null;
  return `${b.pagination?.total ?? b.data.length} runs`;
});
if (firstRun) {
  await check("GET /api/tinyfish/runs/:id", async () => {
    const b = await j(`/api/tinyfish/runs/${firstRun.run_id}`);
    need(b.run_id === firstRun.run_id, "run_id mismatch");
    return `${b.status} · ${b.steps?.length ?? 0} steps`;
  });
  await check("POST /api/tinyfish/runs/batch", async () => {
    const b = await j("/api/tinyfish/runs/batch", { method: "POST", body: JSON.stringify({ run_ids: [firstRun.run_id] }) });
    return `${(b.data ?? b.runs ?? b.results ?? []).length} returned`;
  });
}
for (const k of ["search", "fetch", "browser"]) {
  await check(`GET /api/tinyfish/usage/${k}`, async () => {
    const b = await j(`/api/tinyfish/usage/${k}?limit=5`);
    need(Array.isArray(b.items), "no items[]");
    return `${b.total} total`;
  });
}
await check("GET /api/tinyfish/monitors", async () => {
  const b = await j("/api/tinyfish/monitors");
  need(Array.isArray(b.monitors), "no monitors[]");
  return `${b.monitors.length} monitors`;
});
await check("GET /api/tinyfish/profiles", async () => {
  const b = await j("/api/tinyfish/profiles");
  return `${(b.profiles ?? []).length} profiles`;
});
await check("GET /api/tinyfish/search (free)", async () => {
  const b = await j("/api/tinyfish/search?query=" + encodeURIComponent("PM Kisan official site") + "&location=IN&language=en");
  need(Array.isArray(b.results), "no results[]");
  return `${b.results.length} results · top: ${b.results[0]?.url ?? "-"}`;
});
await check("POST /api/tinyfish/fetch (free)", async () => {
  const b = await j("/api/tinyfish/fetch", { method: "POST", body: JSON.stringify({ urls: ["https://www.india.gov.in/"], format: "markdown" }) });
  need(Array.isArray(b.results), "no results[]");
  return `${b.results.length} ok · ${b.errors?.length ?? 0} errors · "${b.results[0]?.title ?? ""}"`;
});
await check("GET /api/deck/overview (aggregator)", async () => {
  const b = await j("/api/deck/overview");
  need(b.configured === true, "configured=false");
  const errs = Object.keys(b.errors || {});
  need(errs.length === 0, `upstream errors: ${errs.map((k) => `${k}=${b.errors[k].message}`).join("; ")}`);
  return `${b.nodes.length} reefs · ${b.cache.free_pct}% free · ${b.ticker.length} ticker items`;
});
if (PAID) {
  await check("POST /api/tinyfish/agent/run-sse (PAID)", async () => {
    const r = await fetch(BASE + "/api/tinyfish/agent/run-sse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.india.gov.in/", goal: "Return the page title as JSON {\"title\": string}", agent_config: { max_duration_seconds: 60 } }),
    });
    need(r.ok && r.body, `HTTP ${r.status}`);
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ""; const seen = new Set();
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      for (const m of buf.matchAll(/"type"\s*:\s*"([A-Z_]+)"/g)) seen.add(m[1]);
      if (seen.has("COMPLETE")) { reader.cancel(); break; }
    }
    need(seen.has("STARTED"), "no STARTED event");
    return [...seen].join(",");
  });
}

const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);
console.log(`\nLokMitra endpoint verification → ${BASE}\n`);
for (const r of results) console.log(`${r.ok ? "✓" : "✕"} ${pad(r.name, 44)} ${pad(r.ms + "ms", 8)} ${r.note}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed${PAID ? "" : " (set DECK_VERIFY_PAID=1 to include a paid Agent SSE run)"}\n`);
process.exit(failed ? 1 : 0);
