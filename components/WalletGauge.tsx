"use client";
import type { DeckOverview } from "@/lib/deck-types";
import { Odometer } from "./Odometer";

const H = 250;
const TOP = 18;
const BOT = 236;

function MeterIcon({ kind }: { kind: "steps" | "browser" | "monitor" | "free" }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "steps")
    return (
      <svg viewBox="0 0 16 16" style={{ color: "var(--teal)" }}>
        <path {...p} d="M2 13h3v-3h3V7h3V4h3" />
      </svg>
    );
  if (kind === "browser")
    return (
      <svg viewBox="0 0 16 16" style={{ color: "var(--aqua)" }}>
        <circle {...p} cx="8" cy="8" r="6" />
        <path {...p} d="M8 4v4l2.5 1.5" />
      </svg>
    );
  if (kind === "monitor")
    return (
      <svg viewBox="0 0 16 16" style={{ color: "var(--ember)" }}>
        <path {...p} d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
        <circle {...p} cx="8" cy="8" r="1.8" />
      </svg>
    );
  return (
    <svg viewBox="0 0 16 16" style={{ color: "var(--jade)" }}>
      <path {...p} d="M4.6 5.4C2.8 5.4 1.6 6.6 1.6 8s1.2 2.6 3 2.6C7.4 10.6 8.6 5.4 11.4 5.4c1.8 0 3 1.2 3 2.6s-1.2 2.6-3 2.6C8.6 10.6 7.4 5.4 4.6 5.4z" />
    </svg>
  );
}

function lerpColor(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}

export function WalletGauge({ data }: { data: DeckOverview | null }) {
  const wallet = data?.wallet ?? null;
  const balance = wallet ? Number(wallet.available_balance) : null;
  const spend = data?.spend_estimate_usd ?? null;

  // Level = balance relative to the gauge scale. Purely informational — there is NO budget ceiling.
  const scale = Math.max(10, Math.ceil(balance ?? 0), 0.01);
  const level = balance === null ? 0 : Math.max(0, Math.min(1, balance / scale));
  // Colour shifts only when the wallet is nearly empty (top-up hint) — behaviour is never throttled.
  const danger = balance === null ? 0 : Math.max(0, Math.min(1, (1 - balance) / 1));
  const cTop = lerpColor("#4FD9FF", "#FF5C7A", danger);
  const cBot = lerpColor("#2EF2C3", "#FF8F6B", danger);
  const surfaceY = BOT - (BOT - TOP) * level;

  const meters = wallet?.rates?.meters ?? [];
  const rateOf = (re: RegExp) => meters.find((m) => re.test(m.label));
  const steps = data?.runs.steps ?? 0;
  const browserMin = data?.usage.browser_minutes ?? 0;
  const monitorCount = data?.monitors.active ?? 0;
  const freeCalls = (data?.usage.search ?? 0) + (data?.usage.fetch ?? 0);
  const stepRate = rateOf(/step/i);
  const browserRate = rateOf(/browser/i);
  const monitorRate = rateOf(/monitor/i);

  const fmt = (n: number) => (n >= 100 ? n.toFixed(2) : n.toFixed(2));
  const balStr = balance === null ? "--.--" : fmt(balance);

  const wave = (amp: number) => {
    let d = `M0 ${surfaceY}`;
    for (let x = 0; x <= 288; x += 24) d += ` Q ${x + 12} ${surfaceY - amp} ${x + 24} ${surfaceY} T ${x + 48} ${surfaceY}`;
    return d + ` V ${H} H 0 Z`;
  };

  return (
    <div className="wallet-body">
      <div className="tank" aria-hidden="true">
        <svg viewBox={`0 0 112 ${H}`}>
          <defs>
            <linearGradient id="liq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cTop} stopOpacity="0.95" />
              <stop offset="100%" stopColor={cBot} stopOpacity="0.55" />
            </linearGradient>
            <clipPath id="tankClip">
              <rect x="20" y={TOP} width="72" height={BOT - TOP} rx="30" />
            </clipPath>
            <filter id="liqGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          <rect className="glass" x="20" y={TOP} width="72" height={BOT - TOP} rx="30" />
          <g clipPath="url(#tankClip)">
            <rect x="20" y={surfaceY} width="72" height={BOT - surfaceY} fill={cTop} opacity=".35" filter="url(#liqGlow)" />
            <g className="liquid">
              <path className="wave-b" d={wave(4)} fill="url(#liq)" />
              <path className="wave-a" d={wave(3)} fill="url(#liq)" />
            </g>
            {[30, 52, 70].map((x, i) => (
              <circle key={x} className="bubble" cx={x + 6} cy={BOT - 6} r={1.4 + i * 0.5} style={{ animationDelay: `${i * 1.7}s` }} />
            ))}
          </g>
          {/* ticks */}
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} x1="92" x2={i % 2 ? 97 : 101} y1={TOP + 16 + i * ((BOT - TOP - 32) / 8)} y2={TOP + 16 + i * ((BOT - TOP - 32) / 8)} stroke="rgba(141,160,179,.35)" strokeWidth="1" />
          ))}
          <text className="ceiling-label" x="104" y={TOP - 4} textAnchor="end">
            NO CAP · INFO ONLY
          </text>
          <rect x="26" y={TOP + 8} width="6" height={BOT - TOP - 40} rx="3" fill="rgba(255,255,255,.06)" />
        </svg>
      </div>

      <div className="wallet-readout">
        <div className="balance-big" aria-live="polite" aria-atomic="true">
          <span style={{ fontSize: ".55em", marginRight: 4, color: "var(--fog)" }}>$</span>
          <Odometer value={balStr} label={balance === null ? "Balance unavailable" : `Wallet balance ${balStr} US dollars`} />
        </div>
        <div className="balance-sub">
          {wallet ? (
            <>
              available · {wallet.currency} · as of {new Date(wallet.as_of).toLocaleTimeString()}
              {wallet.pending_top_up ? ` · +$${wallet.pending_top_up.amount} top-up pending` : ""}
            </>
          ) : data?.errors.wallet ? (
            <span className="err-note">wallet: {data.errors.wallet.message}</span>
          ) : (
            "connecting to /v1/wallet…"
          )}
        </div>
        {spend !== null && (
          <div className="balance-sub">
            informational agent usage (last 100 runs, no cap): <span style={{ color: danger > 0.5 ? "var(--coral)" : "var(--ember)" }}>${spend.toFixed(3)}</span>
          </div>
        )}
        <ul className="meter-list" aria-label="Usage breakdown">
          <li>
            <MeterIcon kind="steps" />
            <span>Agent steps</span>
            <span className="val">
              {steps.toLocaleString()}
              {stepRate ? <span className="fog"> · ${stepRate.unit_amount}/{stepRate.per ?? "step"}</span> : null}
            </span>
          </li>
          <li>
            <MeterIcon kind="browser" />
            <span>Browser minutes</span>
            <span className="val">
              {browserMin.toLocaleString()}
              {browserRate ? <span className="fog"> · ${browserRate.unit_amount}/{browserRate.per ?? "unit"}</span> : null}
            </span>
          </li>
          <li>
            <MeterIcon kind="monitor" />
            <span>Monitor runs</span>
            <span className="val">
              {monitorCount} active
              {monitorRate ? <span className="fog"> · ${monitorRate.unit_amount}/{monitorRate.per ?? "run"}</span> : null}
            </span>
          </li>
          <li>
            <MeterIcon kind="free" />
            <span>Search / Fetch</span>
            <span className="val free">LIVE · {freeCalls.toLocaleString()} calls</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
