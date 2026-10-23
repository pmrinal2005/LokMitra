"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useRole } from "@/hooks/useRole";
import { useTheme } from "@/hooks/useTheme";
import { useT } from "@/lib/i18n/client";
import { Icon } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import { BrandLogo } from "./BrandLogo";

type Item = { href: string; label: string; icon: React.ReactNode; operatorOnly?: boolean };

const I = {
  deck: <path d="M3 12c3-6 6-6 9 0s6 6 9 0M3 7h4M17 17h4" />,
  chat: <path d="M4 5h16v10H9l-5 4V5zM8 9h8M8 12h5" />,
  map: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />,
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0" />,
  live: <path d="M3 5h18v12H3zM8 21h8M10 9l5 3-5 3V9z" />,
  key: <path d="M14 10a4 4 0 1 0-3.4 3.95L13 16.4V19h2.5v-2H18v-2.6l-4.05-4.05A4 4 0 0 0 14 10zM8.5 9.5h.01" />,
  runs: <path d="M4 6h16M4 12h10M4 18h7M18 14l3 3-3 3" />,
  csc: <path d="M3 10h18M5 10v9h14v-9M3 10l2-5h14l2 5M9 19v-5h6v5" />,
  judge: <path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7zM19 7l-3 7a3 3 0 0 0 6 0l-3-7zM8 21h8" />,
  doc: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 15h7M9 18h4" />,
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
      { href: "/sahayak", label: "Sahayak", icon: svg(I.chat) },
      { href: "/csc", label: "CSC Desk", icon: svg(I.csc) },
      { href: "/portal-map", label: "Portal Explorer", icon: svg(I.map) },
      { href: "/reports", label: "Benefit Reports", icon: svg(I.doc) },
    ],
  },
  {
    title: "Operate",
    items: [
      { href: "/dashboard", label: "Mission Deck", icon: svg(I.deck) },
      { href: "/live", label: "Live Browser", icon: svg(I.live) },
      { href: "/sentinel", label: "Sentinel", icon: svg(I.bell) },
      { href: "/sessions", label: "Sessions", icon: svg(I.key) },
    ],
  },
  {
    title: "Judge",
    items: [
      { href: "/judge", label: "Judge Console", icon: svg(I.judge) },
      { href: "/impact", label: "Impact & Wallet", icon: svg(I.chart) },
      { href: "/runs", label: "Runs Log", icon: svg(I.runs) },
      { href: "/settings", label: "Settings", icon: svg(I.gear), operatorOnly: true },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [wallet, setWallet] = useState<{ bal: string | null; spend: number | null }>({ bal: null, spend: null });
  const { isOperator, ready: roleReady, switchTo, error: roleError } = useRole();
  const { t, lang, setLang, languages } = useT();
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("lm-sb") === "1");
    } catch {}
  }, []);
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    if (!isOperator) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/lokmitra/stats", { cache: "no-store" });
        const j = await r.json();
        if (alive && r.ok) setWallet({ bal: j.wallet?.balance === null || j.wallet?.balance === undefined ? null : Number(j.wallet.balance).toFixed(3), spend: j.spend_usd ?? null });
      } catch {}
    };
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [isOperator]);

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
          <a href="/" title="Back to the LokMitra home page" aria-label="LokMitra home" style={{ display: "contents", color: "inherit" }}>
            <BrandLogo size={40} decorative priority className="brand-logo-sb" />
            <div className="brand-word">
              LokMitra
              <small>citizen web sahayak</small>
            </div>
          </a>
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
              {g.items.filter((it) => !it.operatorOnly || isOperator).map((it) => {
                const active = path === it.href || path.startsWith(it.href + "/");
                return (
                  <Link key={it.href} href={it.href} className="sb-link" aria-current={active ? "page" : undefined} title={it.label}>
                    {it.icon}
                    <span className="sb-label">{it.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sb-foot" aria-live="polite">
          <label className="sb-lang sb-foot-item" title={t("lang_label")}>
            <span className="sb-foot-icon" aria-hidden="true"><Icon name="globe" /></span>
            <select className="sb-lang-select sb-foot-text" value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t("lang_label")}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>{l.native}</option>
              ))}
            </select>
          </label>
          <button type="button" className="sb-theme sb-foot-item" onClick={toggleTheme} aria-pressed={theme === "light"} aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>
            <span className="sb-foot-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                {theme === "light" ? <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
              </svg>
            </span>
            <span className="sb-foot-text">{theme === "light" ? "Dark mode" : "Light mode"}</span>
          </button>
          {isOperator ? (
            <>
              <a href="/settings#usage" title={`Live TinyFish wallet balance${wallet.bal ? ` $${wallet.bal}` : ""} · open Usage & Infrastructure`} aria-label="TinyFish wallet · open Usage & Infrastructure" className="sb-wallet sb-foot-item" style={{ color: "inherit", textDecoration: "none" }}>
                <span className="sb-foot-icon" aria-hidden="true"><Icon name="wallet" /></span>
                <span className="sb-foot-text">wallet <b>{wallet.bal ? `$${wallet.bal}` : "—"}</b></span>
              </a>
              <span className="sb-foot-text sb-foot-line">
                used <b>{wallet.spend === null ? "—" : `$${wallet.spend.toFixed(3)}`}</b> · no cap
              </span>
            </>
          ) : null}
          {roleReady && (
            <button className="sb-role sb-foot-item" onClick={() => void switchTo(isOperator ? "citizen" : "operator")} title={roleError ?? t(isOperator ? "role_switch_citizen" : "role_switch_operator")} aria-label={t(isOperator ? "role_switch_citizen" : "role_switch_operator")}>
              <span className="sb-foot-icon" aria-hidden="true"><Icon name={isOperator ? "user" : "wrench"} /></span>
              <span className="sb-foot-text">{t(isOperator ? "role_switch_citizen" : "role_switch_operator")}</span>
            </button>
          )}
          {roleError && <span className="sb-foot-text sb-foot-line err-note" style={{ whiteSpace: "normal" }}>{roleError}</span>}
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
          <a href="/" className="mobile-brand" aria-label="LokMitra home">
            <BrandLogo size={30} decorative priority className="brand-logo-mobile" />
            <span className="brand-word" style={{ fontSize: 13 }}>
              LokMitra
            </span>
          </a>
          <ThemeToggle className="mobile-theme-toggle" />
        </div>
        {children}
      </div>
    </div>
  );
}
