import type { Metadata } from "next";
import { HomePageClient } from "./home-page-client";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Journiful - Group Trip Planner | Plan Travel Together",
  description:
    "Plan group trips together. Coordinate itineraries, accommodations, and events with your travel companions in one place.",
  alternates: { canonical: "/" },
};

export default function Home() {
  // No pre-hydration redirect: the Capacitor native context it used to
  // detect is gone (the Android app is built from apps/mobile).
  return <HomePageClient />;
}
