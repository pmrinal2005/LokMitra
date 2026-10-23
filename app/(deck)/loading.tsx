import { BrandLogo } from "@/components/BrandLogo";

/** Route-transition loading screen for every command-deck page (Next.js Suspense boundary). */
export default function Loading() {
  return (
    <main className="brand-splash" role="status" aria-live="polite" aria-label="Loading LokMitra">
      <BrandLogo size={120} alt="LokMitra" priority />
      <div className="brand-word" style={{ fontSize: 16 }}>
        LokMitra
        <small>loading your sahayak deck…</small>
      </div>
    </main>
  );
}
