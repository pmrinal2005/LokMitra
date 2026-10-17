"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { bus } from "@/lib/bus";

/**
 * Ambient sound design (muted by default, synthesized with WebAudio — zero assets):
 *  - low-frequency underwater hum bed (detuned sines + filtered brown noise, slow LFO)
 *  - gentle sonar "bloop" on successful agent completion, lower soft thud on failure
 */
export function useSonar() {
  const [enabled, setEnabled] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const bedRef = useRef<{ gain: GainNode; stop: () => void } | null>(null);

  const ensureCtx = () => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AC();
    }
    return ctxRef.current;
  };

  const startBed = useCallback(() => {
    const ctx = ensureCtx();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 260;
    lp.Q.value = 0.7;
    lp.connect(master);

    const oscs = [42, 55.2, 82.7].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = i * 7;
      const g = ctx.createGain();
      g.gain.value = [0.35, 0.22, 0.08][i];
      o.connect(g).connect(lp);
      o.start();
      return o;
    });

    // brown noise (water movement)
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.2;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    noise.connect(ng).connect(lp);
    noise.start();

    // slow swell
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();

    master.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 2.5);
    bedRef.current = {
      gain: master,
      stop: () => {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0, t + 0.8);
        setTimeout(() => {
          oscs.forEach((o) => o.stop());
          noise.stop();
          lfo.stop();
          master.disconnect();
        }, 900);
      },
    };
  }, []);

  const bloop = useCallback((ok: boolean) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    const f0 = ok ? 1180 : 320;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(ok ? 620 : 180, t + 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(ok ? 0.22 : 0.14, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 1.4 : 0.6));
    // sonar echo
    const d = ctx.createDelay();
    d.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    o.connect(g);
    g.connect(ctx.destination);
    g.connect(d);
    d.connect(fb).connect(d);
    d.connect(ctx.destination);
    o.start(t);
    o.stop(t + 1.6);
  }, []);

  const toggle = useCallback(async () => {
    const next = !enabled;
    setEnabled(next);
    if (next) {
      const ctx = ensureCtx();
      if (ctx.state === "suspended") await ctx.resume();
      startBed();
      setTimeout(() => bloop(true), 400);
    } else {
      bedRef.current?.stop();
      bedRef.current = null;
    }
  }, [enabled, startBed, bloop]);

  useEffect(() => {
    if (!enabled) return;
    return bus.on("bloop", ({ ok }) => bloop(ok));
  }, [enabled, bloop]);

  useEffect(() => () => bedRef.current?.stop(), []);

  return { enabled, toggle };
}
