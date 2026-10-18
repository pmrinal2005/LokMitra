import type { Metadata } from "next";
import { Settings } from "./Settings";

export const metadata: Metadata = { title: "Settings — LokMitra" };

export default function Page() {
  return <Settings />;
}
