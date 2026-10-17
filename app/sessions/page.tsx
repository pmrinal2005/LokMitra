import type { Metadata } from "next";
import { Sessions } from "./Sessions";

export const metadata: Metadata = { title: "Sessions — LokMitra" };

export default function Page() {
  return <Sessions />;
}
