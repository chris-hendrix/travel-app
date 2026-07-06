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
  return (
    <>
      {/* Redirect Capacitor native context to login immediately, before React loads */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()){location.replace('/login.html')}}catch(e){}})()`,
        }}
      />
      <HomePageClient />
    </>
  );
}
