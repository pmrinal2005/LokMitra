import "./(deck)/globals.css";
import { BrandLogo } from "@/components/BrandLogo";

export default function NotFound() {
  return (
    <main className="brand-splash" style={{ minHeight: "100vh" }}>
      <BrandLogo size={120} alt="LokMitra" priority />
      <h1 className="brand-word" style={{ fontSize: 20, margin: 0 }}>LokMitra</h1>
      <p className="mono fog">// 404 · this page is not on our map yet</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <a href="/dashboard" className="cta" style={{ padding: "12px 20px" }}>Open the dashboard</a>
        <a href="/" className="btn" style={{ padding: "12px 20px" }}>Back to home</a>
      </div>
    </main>
  );
}
