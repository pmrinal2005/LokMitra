"use client";

export function PrintButton() {
  return (
    <button className="btn sm primary" onClick={() => window.print()}>
      🖨 Print slip
    </button>
  );
}
