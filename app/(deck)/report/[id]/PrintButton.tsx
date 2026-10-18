"use client";
import { Icon } from "@/components/Icon";

export function PrintButton() {
  return (
    <button className="btn sm primary" onClick={() => window.print()}>
      <Icon name="printer" /> Print slip
    </button>
  );
}
