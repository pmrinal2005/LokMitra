import "./(deck)/globals.css";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeContent: "center", textAlign: "center", gap: 12, position: "relative", zIndex: 1 }}>
      <p className="mono fog">// 404 · this page is not on our map yet</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <a href="/dashboard" className="cta" style={{ padding: "12px 20px" }}>Open the dashboard</a>
        <a href="/" className="btn" style={{ padding: "12px 20px" }}>Back to home</a>
      </div>
    </main>
  );
}
