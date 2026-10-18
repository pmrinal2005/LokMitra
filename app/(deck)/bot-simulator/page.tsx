import type { Metadata } from "next";
import { BotSimulator } from "./BotSimulator";

export const metadata: Metadata = { title: "Bot Simulator — LokMitra" };

export default function Page() {
  return <BotSimulator />;
}
