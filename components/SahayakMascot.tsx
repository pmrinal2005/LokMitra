"use client";
import { useEffect, useRef } from "react";

/**
 * SahayakMascot — a small glossy 3D sphere with big anime-style eyes.
 * The whole sphere tilts a little and the pupils follow the cursor anywhere on the screen.
 * Pure SVG + CSS. It writes CSS variables from one rAF loop with lerp smoothing, so React never re-renders.
 * It holds still under prefers-reduced-motion or calm mode (html.calm), and it blinks now and then.
 */
export function SahayakMascot({ size = 64, mood = "idle" }: { size?: number; mood?: "idle" | "working" | "waiting" | "done" | "error" }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, alive = true;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 260); // saturate ~260px away
      tx = (dx / d) * k;
      ty = (dy / d) * k;
    };
    const onLeave = () => { tx = 0; ty = 0; };
    const tick = () => {
      if (!alive) return;
      const calm = document.documentElement.classList.contains("calm");
      const ease = calm || reduce ? 1 : 0.14;
      const gx = calm || reduce ? 0 : tx, gy = calm || reduce ? 0 : ty;
      cx += (gx - cx) * ease;
      cy += (gy - cy) * ease;
      el.style.setProperty("--lx", cx.toFixed(3));
      el.style.setProperty("--ly", cy.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(tick);

    // random blink
    let blinkT: ReturnType<typeof setTimeout>;
    const blink = () => {
      if (!reduce) {
        el.classList.add("blink");
        setTimeout(() => el.classList.remove("blink"), 160);
      }
      blinkT = setTimeout(blink, 2600 + Math.random() * 3400);
    };
    blinkT = setTimeout(blink, 1800);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(blinkT);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={`sahayak-mascot mood-${mood}`} style={{ ["--ms" as string]: `${size}px` }} aria-hidden="true">
      <span className="sm-glow" />
      <svg className="sm-sphere" viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <radialGradient id="smBody" cx="38%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#d9fff4" />
            <stop offset="22%" stopColor="#7ff7d9" />
            <stop offset="58%" stopColor="#21c9a5" />
            <stop offset="88%" stopColor="#0b6f6a" />
            <stop offset="100%" stopColor="#063f47" />
          </radialGradient>
          <radialGradient id="smRim" cx="50%" cy="50%" r="50%">
            <stop offset="80%" stopColor="rgba(255,159,67,0)" />
            <stop offset="100%" stopColor="rgba(255,159,67,.55)" />
          </radialGradient>
          <radialGradient id="smCheek" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,120,140,.75)" />
            <stop offset="100%" stopColor="rgba(255,120,140,0)" />
          </radialGradient>
          <radialGradient id="smIris" cx="45%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#5fe8ff" />
            <stop offset="45%" stopColor="#1b6fd8" />
            <stop offset="100%" stopColor="#0a1f4d" />
          </radialGradient>
        </defs>
        {/* contact shadow */}
        <ellipse cx="50" cy="96" rx="26" ry="3.2" fill="rgba(0,0,0,.45)" />
        {/* body */}
        <g className="sm-body">
          <circle cx="50" cy="50" r="44" fill="url(#smBody)" />
          <circle cx="50" cy="50" r="44" fill="url(#smRim)" />
          {/* glossy specular highlights */}
          <ellipse cx="34" cy="24" rx="15" ry="8.5" fill="rgba(255,255,255,.78)" transform="rotate(-28 34 24)" />
          <circle cx="24" cy="38" r="3" fill="rgba(255,255,255,.65)" />
          <path d="M20 70 Q50 92 80 70" stroke="rgba(255,255,255,.18)" strokeWidth="2" fill="none" strokeLinecap="round" />
          {/* face group — moves with the gaze for a 3D "turn" */}
          <g className="sm-face">
            <ellipse cx="27" cy="62" rx="7" ry="4.5" fill="url(#smCheek)" />
            <ellipse cx="73" cy="62" rx="7" ry="4.5" fill="url(#smCheek)" />
            {[36, 64].map((x) => (
              <g key={x} className="sm-eye">
                <ellipse cx={x} cy="48" rx="9.5" ry="12.5" fill="#fff" />
                <g className="sm-pupil">
                  <ellipse cx={x} cy="49" rx="7" ry="9.5" fill="url(#smIris)" />
                  <ellipse cx={x} cy="50" rx="3.6" ry="5" fill="#04102a" />
                  <ellipse cx={x - 2.6} cy="44.5" rx="2.6" ry="3.4" fill="#fff" />
                  <circle cx={x + 2.4} cy="53.5" r="1.3" fill="rgba(255,255,255,.85)" />
                </g>
                <rect className="sm-lid" x={x - 11} y="34" width="22" height="28" rx="10" fill="#1fbf9d" />
              </g>
            ))}
            <path className="sm-mouth" d="M43 66 Q50 72 57 66" stroke="#063f47" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    </div>
  );
}
