"use client";
import { useCallback, useEffect, useState } from "react";
import { citizenId } from "@/lib/client";

export interface SummaryScheme { scheme_id: string; scheme_name: string; sector: string; verdict: string; status: string; benefit: string | null; deadline: string | null; last_seen: string; report_id: string; agent_status: string | null; url: string | null }
export interface SummarySource { url: string; host: string; kind: "official" | "other"; schemes: string[]; reports: number; last_read: string; title: string | null; latency_ms: number | null; ok: boolean }
export interface SessionSummary {
  user_id: string;
  reports: number;
  languages: string[];
  snapshot: {
    schemes: SummaryScheme[];
    counts: { total: number; likely: number; check: number; unlikely: number; info: number };
    likely: string[];
    deadlines: { scheme_id: string; scheme_name: string; text: string; source: string | null; seen: string }[];
    actions: { text: string; text_local?: string; url: string | null; priority: number; scheme_id: string | null }[];
    agent_checks: number;
    live_calls: { search: number; fetch_urls: number; fetch_ok: number };
  };
  sources: SummarySource[];
  generated_at: string;
}

/** Shared loader for /api/lokmitra/session-summary; refreshes whenever a journey finishes ("lm-report"). */
export function useSessionSummary() {
  const [data, setData] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/lokmitra/session-summary?user_id=${encodeURIComponent(citizenId())}&limit=20`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      setData(j);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const on = () => setTimeout(load, 600);
    window.addEventListener("lm-report", on);
    return () => window.removeEventListener("lm-report", on);
  }, [load]);
  return { data, error, loading, reload: load };
}
