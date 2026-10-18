import type { Metadata } from "next";
import { Judge } from "./Judge";

export const metadata: Metadata = { title: "Judge Console — LokMitra" };

export default function Page() {
  return <Judge />;
}
