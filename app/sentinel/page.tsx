import type { Metadata } from "next";
import { Sentinel } from "./Sentinel";

export const metadata: Metadata = { title: "Sentinel — LokMitra" };

export default function Page() {
  return <Sentinel />;
}
