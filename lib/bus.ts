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

type Events = {
  fish: FishEvent;
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
