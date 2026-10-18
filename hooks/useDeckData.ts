"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DeckOverview } from "@/lib/deck-types";
import { bus } from "@/lib/bus";

/**
 * Polls the live aggregator (/api/deck/overview → 6 TinyFish endpoints).
 * Cadence: 6s while any agent is active (or `boost` is on), 15s when idle,
 * paused while the tab is hidden. Emits bus events for *changes* so the
 * visuals react to real activity (new runs, new free calls).
 */
export function useDeckData(boost: boolean) {
  const [data, setData] = useState<DeckOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const prev = useRef<DeckOverview | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch("/api/deck/overview", { cache: "no-store" });
      const json = (await res.json()) as DeckOverview;
      if (!res.ok) throw new Error((json as unknown as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`);
      diffAndEmit(prev.current, json);
      prev.current = json;
      setData(json);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") await load();
      const active = (prev.current?.runs.active ?? 0) > 0;
      timer.current = setTimeout(tick, boost || active ? 6000 : 15000);
    };
    tick();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, boost]);

  return { data, error, loading, refresh: load };
}

function diffAndEmit(a: DeckOverview | null, b: DeckOverview) {
  // Persistent fish for every RUNNING/PENDING run (including ones started elsewhere)
  for (const r of b.runs.recent) {
    if (r.status === "RUNNING" || r.status === "PENDING") {
      bus.emit("fish", { type: "swim", id: r.run_id, target: r.state, persistent: true, color: "#2EF2C3" });
    }
  }
  if (!a) return;
  const before = new Map(a.runs.recent.map((r) => [r.run_id, r.status]));
  for (const r of b.runs.recent) {
    const was = before.get(r.run_id);
    const terminal = r.status === "COMPLETED" || r.status === "FAILED" || r.status === "CANCELLED";
    if (terminal && was && was !== r.status) bus.emit("fish", { type: "end", id: r.run_id, ok: r.status === "COMPLETED" });
    if (terminal && !was) bus.emit("fish", { type: "swim", id: `t-${r.run_id}`, target: r.state, color: r.status === "COMPLETED" ? "#6EF2A0" : "#FF5C7A" });
  }
  const dFree = b.live.open_web_calls - a.live.open_web_calls;
  if (dFree > 0) {
    bus.emit("spark", { count: Math.min(dFree, 5) });
    const hot = [...b.nodes].sort((x, y) => (y.last_updated ?? "").localeCompare(x.last_updated ?? ""))[0];
    if (hot) bus.emit("fish", { type: "swim", id: `free-${Date.now()}`, target: hot.id, color: "#4FD9FF" });
  }
}
