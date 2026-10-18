import type { Metadata } from "next";
import { PortalMap } from "./PortalMap";

export const metadata: Metadata = { title: "Live Portal Explorer — LokMitra" };

export default function Page() {
  return <PortalMap />;
}
