import type { Metadata } from "next";
import { MutualsContent } from "./mutuals-content";

export const metadata: Metadata = { title: "My Mutuals | Journiful" };

export default function MutualsPage() {
  return <MutualsContent />;
}
