import type { Metadata } from "next";
import { Live } from "./Live";

export const metadata: Metadata = { title: "Live — LokMitra" };

export default function Page() {
  return <Live />;
}
