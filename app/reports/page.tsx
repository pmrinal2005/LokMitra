import type { Metadata } from "next";
import { Reports } from "./Reports";

export const metadata: Metadata = { title: "Citizen Benefit Reports — LokMitra" };

export default function Page() {
  return <Reports />;
}
