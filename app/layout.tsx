import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "LokMitra — Universal Multilingual Citizen Web Sahayak (× TinyFish)",
  description:
    "A living command deck that watches TinyFish web agents swim through India's government web infrastructure in real time — wallet telemetry, cache intelligence, live agent reasoning and a porthole into the agent's browser.",
  icons: { icon: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  applicationName: "LokMitra",
};

export const viewport: Viewport = {
  themeColor: "#06090F",
  width: "device-width",
  initialScale: 1,
};

/** Runs before paint: restores Calm Mode (or honours prefers-reduced-motion) without a flash. */
const calmBoot = `try{var c=localStorage.getItem('lm-calm');if(c==='1'||(c===null&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)){document.documentElement.classList.add('calm')}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: calmBoot }} />
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Display: Clash Display · Body: Satoshi (Fontshare, free) */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=satoshi@400,500,700&display=swap"
        />
        {/* Data: JetBrains Mono · Regional: Noto Sans Devanagari */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+Devanagari:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <div className="abyss-layer" aria-hidden="true" />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
