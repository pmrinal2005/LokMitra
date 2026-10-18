import "./globals.css";
import { AppShell } from "@/components/Sidebar";

/** Command deck chrome: design system + sidebar shell for /dashboard and every tool route. */
export default function DeckLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="abyss-layer" aria-hidden="true" />
      <AppShell>{children}</AppShell>
    </>
  );
}
