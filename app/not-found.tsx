import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeContent: "center", textAlign: "center", gap: 12, position: "relative", zIndex: 1 }}>
      <p className="mono fog">// 404 — this reef is uncharted</p>
      <Link href="/" className="cta" style={{ padding: "12px 20px", justifySelf: "center" }}>
        Return to deck
      </Link>
    </main>
  );
}
