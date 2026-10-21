import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "LokMitra | Every Government Benefit, In Your Own Language",
  description:
    "LokMitra finds every scheme you deserve, checks your status on official portals and explains it simply in your own language. Free for every citizen on Telegram, web and at your CSC.",
  icons: { icon: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  applicationName: "LokMitra",
};

export const viewport: Viewport = {
  themeColor: "#06090F",
  width: "device-width",
  initialScale: 1,
};

/** Runs before paint: restores the light/dark theme and Calm Mode (or honours prefers-reduced-motion) without a flash. */
const calmBoot = `try{var t=localStorage.getItem('lm-theme');if(t!=='light'&&t!=='dark'){t='dark'}document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t}catch(e){}try{var c=localStorage.getItem('lm-calm');if(c==='1'||(c===null&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)){document.documentElement.classList.add('calm')}}catch(e){}`;

/**
 * Root shell shared by the landing page ("/") and the command deck ("/dashboard" and
 * every tool route under app/(deck)). Deck-only styles + sidebar live in app/(deck)/layout.tsx
 * so the landing page renders with its own cinematic stylesheet and no app chrome.
 */
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
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
