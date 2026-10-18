import type { Metadata } from "next";
import { Sahayak } from "./Sahayak";

export const metadata: Metadata = { title: "Sahayak — LokMitra citizen assistant" };

export default function Page() {
  return <Sahayak />;
}
