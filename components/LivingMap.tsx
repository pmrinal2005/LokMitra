"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { INDIA_PATH, MAP_H, MAP_W, STATE_NODES } from "@/lib/geo-data";
import type { NodeStat } from "@/lib/deck-types";
import { bus, type FishEvent } from "@/lib/bus";
import { isCalm } from "@/hooks/useCalm";

interface Fish {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  home: string;
  color: string;
  persistent: boolean;
  life: number; // 1 → 0 fade when ending
  ending: boolean;
  trail: { x: number; y: number }[];
  arrivedAt: number;
  wanderAt: number;
  ok?: boolean;
}

const NODE_BY_ID = new Map(STATE_NODES.map((n) => [n.id, n]));
const HUB = NODE_BY_ID.get("DL")!;

function nearest(id: string, k = 4) {
  const n = NODE_BY_ID.get(id) ?? HUB;
  return STATE_NODES.filter((o) => o.id !== n.id)
    .map((o) => ({ o, d: Math.hypot(o.x - n.x, o.y - n.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((x) => x.o);
}

function relTime(iso: string | null) {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const w = 120,
    h = 26;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 3) - 1.5}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ marginTop: 6, overflow: "visible" }}>
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill="rgba(46,242,195,.10)" stroke="none" />
      <polyline points={pts} fill="none" stroke="#2EF2C3" strokeWidth="1.3" style={{ filter: "drop-shadow(0 0 3px #2EF2C3)" }} />
    </svg>
  );
}

export function LivingMap({ nodes, activeCount }: { nodes: NodeStat[]; activeCount: number }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fishRef = useRef<Map<string, Fish>>(new Map());
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [fishCount, setFishCount] = useState(0);

  const stats = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const maxVol = useMemo(() => Math.max(1, ...nodes.map((n) => n.volume)), [nodes]);

  // constellation links: each node to its 2 nearest neighbours
  const links = useMemo(() => {
    const seen = new Set<string>();
    const out: [number, number, number, number][] = [];
    for (const n of STATE_NODES)
      for (const m of nearest(n.id, 2)) {
        const key = [n.id, m.id].sort().join("-");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([n.x, n.y, m.x, m.y]);
      }
    return out;
  }, []);

  /* ---------------- fish simulation (canvas) ---------------- */
  useEffect(() => {
    const spawn = (ev: Extract<FishEvent, { type: "swim" }>) => {
      const map = fishRef.current;
      const target = NODE_BY_ID.get(ev.target) ?? HUB;
      const existing = map.get(ev.id);
      if (existing) {
        if (!existing.ending) {
          existing.home = target.id;
          existing.tx = target.x;
          existing.ty = target.y;
        }
        return;
      }
      const from = ev.from ? NODE_BY_ID.get(ev.from) ?? HUB : target.id === HUB.id ? nearest(HUB.id, 6)[Math.floor(Math.random() * 6)] : HUB;
      map.set(ev.id, {
        id: ev.id,
        x: from.x + (Math.random() - 0.5) * 6,
        y: from.y + (Math.random() - 0.5) * 6,
        vx: 0,
        vy: 0,
        tx: target.x,
        ty: target.y,
        home: target.id,
        color: ev.color ?? "#2EF2C3",
        persistent: !!ev.persistent,
        life: 1,
        ending: false,
        trail: [],
        arrivedAt: 0,
        wanderAt: performance.now() + 2500,
      });
      setFishCount(map.size);
    };
    const off = bus.on("fish", (ev) => {
      const map = fishRef.current;
      if (ev.type === "swim") spawn(ev);
      else if (ev.type === "hop") {
        const f = map.get(ev.id);
        if (f && !f.ending) {
          // multi-step workflow → the fish darts to a neighbouring "reef" then homes back
          const nb = nearest(f.home, 4)[Math.floor(Math.random() * 4)];
          f.tx = nb.x;
          f.ty = nb.y;
          f.wanderAt = performance.now() + 1400;
        }
      } else if (ev.type === "end") {
        const f = map.get(ev.id);
        if (f) {
          const home = NODE_BY_ID.get(f.home) ?? HUB;
          f.tx = home.x;
          f.ty = home.y;
          f.ending = true;
          f.ok = ev.ok;
          f.color = ev.ok ? "#6EF2A0" : "#FF5C7A";
        }
      }
    });
    return off;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0,
      h = 0,
      s = 1,
      ox = 0,
      oy = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = stage.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const pad = 0.9;
      s = Math.min(w / MAP_W, h / MAP_H) * pad;
      ox = (w - MAP_W * s) / 2;
      oy = (h - MAP_H * s) / 2;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    // idle drifter (empty state)
    const idle = { x: MAP_W * 0.45, y: MAP_H * 0.5, a: 0, trail: [] as { x: number; y: number }[] };
    let last = performance.now();

    const drawFish = (x: number, y: number, ang: number, color: string, alpha: number, scale = 1) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.quadraticCurveTo(1, -3.6, -4, 0);
      ctx.quadraticCurveTo(1, 3.6, 6, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-3.5, 0);
      ctx.lineTo(-8, -3);
      ctx.lineTo(-8, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const frame = (t: number) => {
      const dt = Math.min(50, t - last) / 16.67;
      last = t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      const calm = isCalm();
      const map = fishRef.current;

      if (map.size === 0 && !calm) {
        idle.a += 0.004 * dt;
        idle.x = MAP_W * 0.45 + Math.cos(idle.a) * 120 + Math.sin(idle.a * 2.3) * 30;
        idle.y = MAP_H * 0.5 + Math.sin(idle.a * 1.3) * 140;
        const px = ox + idle.x * s,
          py = oy + idle.y * s;
        idle.trail.push({ x: px, y: py });
        if (idle.trail.length > 40) idle.trail.shift();
        for (let i = 1; i < idle.trail.length; i++) {
          const p = idle.trail[i - 1],
            q = idle.trail[i];
          ctx.strokeStyle = `rgba(79,217,255,${(i / idle.trail.length) * 0.25})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
        const pv = idle.trail[idle.trail.length - 2] ?? { x: px - 1, y: py };
        drawFish(px, py, Math.atan2(py - pv.y, px - pv.x), "#4FD9FF", 0.5, 0.9);
      }

      for (const f of map.values()) {
        const dx = f.tx - f.x,
          dy = f.ty - f.y;
        const dist = Math.hypot(dx, dy);
        // steering: seek with arrival + gentle sinusoidal swim wobble
        const maxSpeed = (calm ? 6 : 2.1) * (f.ending ? 1.3 : 1);
        const desired = Math.min(maxSpeed, dist * 0.06);
        const ang = Math.atan2(dy, dx);
        const wob = calm ? 0 : Math.sin(t * 0.008 + f.id.length) * 0.35;
        const ax = (Math.cos(ang + wob) * desired - f.vx) * 0.08;
        const ay = (Math.sin(ang + wob) * desired - f.vy) * 0.08;
        f.vx += ax * dt;
        f.vy += ay * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;

        if (dist < 3) {
          if (!f.arrivedAt) f.arrivedAt = t;
          if (f.ending) f.life -= 0.02 * dt;
          else if (!f.persistent && t - f.arrivedAt > 1200) f.life -= 0.015 * dt;
        } else f.arrivedAt = 0;

        // persistent fish patrol around their home reef while the run is alive
        if (f.persistent && !f.ending && t > f.wanderAt) {
          const home = NODE_BY_ID.get(f.home) ?? HUB;
          if (Math.hypot(f.tx - home.x, f.ty - home.y) > 1) {
            f.tx = home.x;
            f.ty = home.y;
          } else {
            const a = Math.random() * Math.PI * 2;
            f.tx = home.x + Math.cos(a) * 16;
            f.ty = home.y + Math.sin(a) * 16;
          }
          f.wanderAt = t + 1800 + Math.random() * 1600;
        }

        const px = ox + f.x * s,
          py = oy + f.y * s;
        f.trail.push({ x: px, y: py });
        if (f.trail.length > 46) f.trail.shift();

        // comet trail
        for (let i = 1; i < f.trail.length; i++) {
          const p = f.trail[i - 1],
            q = f.trail[i];
          const a = (i / f.trail.length) * 0.6 * Math.max(0, f.life);
          ctx.strokeStyle = hexA(f.color, a);
          ctx.lineWidth = 0.6 + (i / f.trail.length) * 2.2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
        drawFish(px, py, Math.atan2(f.vy, f.vx), f.color, Math.max(0, f.life), 1.1);

        // completion bloom
        if (f.ending && f.arrivedAt) {
          const k = Math.max(0, f.life);
          ctx.strokeStyle = hexA(f.color, k * 0.6);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(px, py, (1 - k) * 34 + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      let removed = false;
      for (const [id, f] of map) if (f.life <= 0) (map.delete(id), (removed = true));
      if (removed) setFishCount(map.size);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const hovered = hover ? STATE_NODES.find((n) => n.id === hover.id) : null;
  const hs = hover ? stats.get(hover.id) : undefined;

  return (
    <div className="map-stage" ref={stageRef}>
      <div className="caustics" aria-hidden="true" />
      {fishCount === 0 && activeCount === 0 && <div className="map-idle-caption">// awaiting next citizen query...</div>}
      <svg className="map-svg" viewBox={`${-MAP_W * 0.0555} ${-MAP_H * 0.0555} ${MAP_W * 1.111} ${MAP_H * 1.111}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Living network map of India showing TinyFish agent activity by state">
        <defs>
          <radialGradient id="landGlow" cx="45%" cy="40%" r="70%">
            <stop offset="0%" stopColor="rgba(46,242,195,0.07)" />
            <stop offset="100%" stopColor="rgba(46,242,195,0.01)" />
          </radialGradient>
          <radialGradient id="nodeHalo">
            <stop offset="0%" stopColor="rgba(46,242,195,0.55)" />
            <stop offset="60%" stopColor="rgba(46,242,195,0.10)" />
            <stop offset="100%" stopColor="rgba(46,242,195,0)" />
          </radialGradient>
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g className="india-grid" aria-hidden="true">
          {Array.from({ length: 13 }, (_, i) => (
            <line key={`v${i}`} x1={i * 50} y1={-20} x2={i * 50} y2={MAP_H + 20} />
          ))}
          {Array.from({ length: 14 }, (_, i) => (
            <line key={`h${i}`} x1={-20} y1={i * 50} x2={MAP_W + 20} y2={i * 50} />
          ))}
        </g>
        <path className="india-outline-2" d={INDIA_PATH} aria-hidden="true" />
        <path className="india-outline" d={INDIA_PATH} aria-hidden="true" />
        <g className="constellation" aria-hidden="true">
          {links.map(([a, b, c, d], i) => (
            <line key={i} x1={a} y1={b} x2={c} y2={d} />
          ))}
        </g>
        {STATE_NODES.map((n) => {
          const st = stats.get(n.id);
          const vol = st?.volume ?? 0;
          const r = vol ? 3 + Math.sqrt(vol / maxVol) * 7 : 2.2;
          const cls = !vol ? "dormant" : st!.active > 0 ? "active" : st!.hits >= st!.misses ? "hit" : "miss";
          return (
            <g
              key={n.id}
              className={`node ${cls}`}
              tabIndex={0}
              role="button"
              aria-label={`${n.name}: ${vol} queries${st ? `, ${st.hits} cache hits, ${st.misses} agent runs` : ""}`}
              onMouseEnter={(e) => {
                const box = stageRef.current!.getBoundingClientRect();
                const tb = (e.currentTarget as SVGGElement).getBoundingClientRect();
                setHover({ id: n.id, x: tb.left + tb.width / 2 - box.left, y: tb.top - box.top });
              }}
              onFocus={(e) => {
                const box = stageRef.current!.getBoundingClientRect();
                const tb = (e.currentTarget as SVGGElement).getBoundingClientRect();
                setHover({ id: n.id, x: tb.left + tb.width / 2 - box.left, y: tb.top - box.top });
              }}
              onMouseLeave={() => setHover(null)}
              onBlur={() => setHover(null)}
              style={{ ["--np" as string]: `${2.2 + (n.x % 7) * 0.25}s` }}
            >
              <circle className="halo" cx={n.x} cy={n.y} r={r * 3.2} />
              <circle className="core" cx={n.x} cy={n.y} r={r} />
              <text className="label" x={n.x + r + 4} y={n.y + 3}>
                {n.id}
              </text>
            </g>
          );
        })}
      </svg>
      <canvas ref={canvasRef} className="map-canvas" aria-hidden="true" />

      {hovered && hover && (
        <div className="map-tooltip" style={{ left: hover.x, top: hover.y }} role="tooltip">
          <h4>{hovered.name}</h4>
          {hs ? (
            <>
              <div className="row">
                <span>Latest scheme / query</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--pearl)", margin: "2px 0 6px" }}>{hs.top_label ?? "—"}</div>
              <div className="row">
                <span>Cache status</span>
                <b style={{ color: hs.hits >= hs.misses ? "var(--jade)" : "var(--ember)" }}>{hs.hits >= hs.misses ? "HIT" : "MISS → AGENT"}</b>
              </div>
              <div className="row">
                <span>Free hits · Agent runs</span>
                <b>
                  {hs.hits} · {hs.misses}
                </b>
              </div>
              <div className="row">
                <span>Last updated</span>
                <b>{relTime(hs.last_updated)}</b>
              </div>
              {hs.hosts.length > 0 && (
                <div className="row">
                  <span>Portals</span>
                  <b style={{ fontSize: 10.5 }}>{hs.hosts.slice(0, 2).join(", ")}</b>
                </div>
              )}
              <Sparkline data={hs.spark} />
              <div className="row" style={{ fontSize: 9.5 }}>
                <span>query volume · last 24h</span>
              </div>
            </>
          ) : (
            <div className="row">
              <span>No traffic discovered yet</span>
              <b>DORMANT</b>
            </div>
          )}
        </div>
      )}

      <div className="depth-gauge" aria-label="Depth scale legend: glow intensity maps to activity">
        <div className="depth-bar" />
        <div className="depth-ticks">
          <span>surge · live agent</span>
          <span>bright · high volume</span>
          <span>glow · cached reef</span>
          <span>dim · dormant</span>
        </div>
      </div>
      <div className="map-legend-inline" aria-hidden="true">
        <span>
          cache hit (free)
          <i style={{ background: "var(--teal)", boxShadow: "0 0 8px var(--teal)" }} />
        </span>
        <span>
          agent discovery (paid)
          <i style={{ background: "var(--ember)", boxShadow: "0 0 8px var(--ember)" }} />
        </span>
        <span>
          swimming agent
          <i style={{ background: "var(--pearl)", boxShadow: "0 0 8px var(--pearl)" }} />
        </span>
      </div>
    </div>
  );
}

function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16),
    g = parseInt(h.slice(2, 4), 16),
    b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}
