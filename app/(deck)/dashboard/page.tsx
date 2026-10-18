import type { Metadata } from "next";
import { CommandDeck } from "@/components/CommandDeck";

export const metadata: Metadata = { title: "Mission Deck | LokMitra" };

export default function Page() {
  return <CommandDeck />;
}
