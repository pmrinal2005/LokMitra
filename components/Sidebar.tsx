"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Item = { href: string; label: string; icon: React.ReactNode; badge?: { text: string; paid?: boolean } };

const I = {
  deck: <path d="M3 12c3-6 6-6 9 0s6 6 9 0M3 7h4M17 17h4" />,
  chat: <path d="M4 5h16v10H9l-5 4V5zM8 9h8M8 12h5" />,
  map: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />,
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0" />,
  live: <path d="M3 5h18v12H3zM8 21h8M10 9l5 3-5 3V9z" />,
  key: <path d="M14 10a4 4 0 1 0-3.4 3.95L13 16.4V19h2.5v-2H18v-2.6l-4.05-4.05A4 4 0 0 0 14 10zM8.5 9.5h.01" />,
  runs: <path d="M4 6h16M4 12h10M4 18h7M18 14l3 3-3 3" />,
  csc: <path d="M3 10h18M5 10v9h14v-9M3 10l2-5h14l2 5M9 19v-5h6v5" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  gear: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />,
};
const svg = (p: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {p}
  </svg>
);

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Citizen",
    items: [
      { href: "/sahayak", label: "Sahayak", icon: svg(I.chat), badge: { text: "22 langs" } },
      { href: "/csc", label: "CSC Desk", icon: svg(I.csc), badge: { text: "slip+QR" } },
      { href: "/portal-map", label: "Portal Map", icon: svg(I.map), badge: { text: "cache" } },
    ],
  },
  {
    title: "Operate",
    items: [
      { href: "/", label: "Mission Deck", icon: svg(I.deck) },
      { href: "/live", label: "Live Browser", icon: svg(I.live), badge: { text: "$", paid: true } },
      { href: "/sentinel", label: "Sentinel", icon: svg(I.bell), badge: { text: "monitor" } },
      { href: "/sessions", label: "Sessions", icon: svg(I.key) },
    ],
  },
  {
    title: "Judge",
    items: [
      { href: "/impact", label: "Impact & Wallet", icon: svg(I.chart) },
      { href: "/runs", label: "Runs Log", icon: svg(I.runs) },
      { href: "/settings", label: "Settings", icon: svg(I.gear) },
    ],
  },
];

function Logomark() {
  return (
    <svg className="logomark" viewBox="0 0 38 26" aria-hidden="true">
      <path className="track" d="M19 13 C 27 3, 35 3, 35 13 C 35 23, 27 23, 19 13 C 11 3, 3 3, 3 13 C 3 23, 11 23, 19 13 Z" fill="none" strokeWidth="0.8" />
      <g className="fish">
        <path d="M-6 0 C -3 -3.4, 3 -3.4, 5 0 C 3 3.4, -3 3.4, -6 0 Z M-6 0 L -9 -2.6 L -9 2.6 Z" fill="none" stroke="#2EF2C3" strokeWidth="1.1" strokeLinejoin="round" />
        <circle cx="2.2" cy="-0.6" r="0.7" fill="#FFB44F" />
      </g>
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [wallet, setWallet] = useState<{ bal: string | null; spend: number | null; budget: number | null }>({ bal: null, spend: null, budget: null });

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("lm-sb") === "1");
    } catch {}
  }, []);
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/lokmitra/stats", { cache: "no-store" });
        const j = await r.json();
        if (alive && r.ok) setWallet({ bal: j.wallet?.balance === null || j.wallet?.balance === undefined ? null : Number(j.wallet.balance).toFixed(3), spend: j.spend_usd ?? null, budget: j.budget_usd ?? null });
      } catch {}
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("lm-sb", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""} ${drawer ? "drawer-open" : ""}`}>
      <aside className="sidebar" aria-label="LokMitra navigation">
        <div className="sb-brand">
          <Logomark />
          <div className="brand-word">
            LokMitra
            <small>citizen web sahayak</small>
          </div>
          <button className="icon-btn sb-toggle desktop-only" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expand" : "Collapse"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
            </svg>
          </button>
        </div>
        <nav className="sb-nav">
          {GROUPS.map((g) => (
            <div key={g.title} className="stack" style={{ gap: 3 }}>
              <div className="sb-section">{g.title}</div>
              {g.items.map((it) => {
                const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
                return (
                  <Link key={it.href} href={it.href} className="sb-link" aria-current={active ? "page" : undefined} title={it.label}>
                    {it.icon}
                    <span className="sb-label">{it.label}</span>
                    {it.badge ? <span className={`sb-badge ${it.badge.paid ? "paid" : ""}`}>{it.badge.text}</span> : <span />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sb-foot" aria-live="polite">
          <span title="Live TinyFish wallet balance">
            ◈ <span className="sb-foot-text">wallet </span>
            <b>{wallet.bal ? `$${wallet.bal}` : "—"}</b>
          </span>
          <span className="sb-foot-text">
            spent <b>{wallet.spend === null ? "—" : `$${wallet.spend.toFixed(3)}`}</b> / ${wallet.budget ?? 5}
          </span>
        </div>
      </aside>
      <div className="sb-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />
      <div className="shell-main">
        <div className="mobile-bar">
          <button className="icon-btn" onClick={() => setDrawer(true)} aria-label="Open menu">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <Logomark />
          <span className="brand-word" style={{ fontSize: 13 }}>
            LokMitra
          </span>
          <span className="chip" style={{ marginLeft: "auto" }}>
            {wallet.bal ? `$${wallet.bal}` : "—"}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
