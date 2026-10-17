import type { Metadata } from "next";
import { PortalMap } from "./PortalMap";

export const metadata: Metadata = { title: "Portal Map — LokMitra" };

export default function Page() {
  return <PortalMap />;
}
