import type { Metadata } from "next";
import { Runs } from "./Runs";

export const metadata: Metadata = { title: "Runs — LokMitra" };

export default function Page() {
  return <Runs />;
}
