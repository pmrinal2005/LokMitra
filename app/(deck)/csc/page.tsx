import type { Metadata } from "next";
import { Sahayak } from "../sahayak/Sahayak";

export const metadata: Metadata = { title: "CSC Desk — LokMitra" };

/** Shared-tablet Common Service Centre mode: same pipeline, channel = "csc", printable slips, "next citizen" reset. */
export default function Page() {
  return <Sahayak mode="csc" />;
}
