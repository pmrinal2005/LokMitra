"use client";
/**
 * Tiny client-side event bus that decouples live data sources
 * (SSE agent stream, overview polling) from visual effects
 * (map fish, ring sparks, nav pulse, sonar bloop).
 */
export type FishEvent =
  | { type: "swim"; id: string; target: string; color?: string; persistent?: boolean; from?: string }
  | { type: "hop"; id: string; target?: string }
  | { type: "end"; id: string; ok: boolean };

/** Citizen-journey telemetry (Sahayak → terminal / porthole / map). */
export type JourneyEvent =
  | { type: "stage"; stage: string; message: string }
  | { type: "search"; scheme: string; results: number; host?: string; error?: string | null; state?: string }
  | { type: "fetch"; ok: number; total: number; hosts: string[] }
  | { type: "task"; scheme: string; host: string; auto: boolean; kind?: "verify" | "personal" }
  | { type: "agent"; phase: "start" | "stream" | "step" | "done" | "error"; scheme: string; host?: string; run_id?: string | null; streaming_url?: string | null; text?: string; ok?: boolean; steps?: number; cost_usd?: number }
  | { type: "otp"; phase: "start" | "saved" | "closed"; scheme: string }
  | { type: "report"; report_id: string; sections: number; elapsed_ms?: number };

type Events = {
  fish: FishEvent;
  journey: JourneyEvent;
  ping: { kind: string };
  spark: { count: number };
  bloop: { ok: boolean };
};

type Handler<T> = (payload: T) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers = new Map<keyof Events, Set<Handler<any>>>();

export const bus = {
  on<K extends keyof Events>(event: K, fn: Handler<Events[K]>) {
    let set = handlers.get(event);
    if (!set) handlers.set(event, (set = new Set()));
    set.add(fn);
    return () => {
      set!.delete(fn);
    };
  },
  emit<K extends keyof Events>(event: K, payload: Events[K]) {
    handlers.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error(e);
      }
    });
  },
};
