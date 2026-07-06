import { Suspense } from "react";
import type { Metadata } from "next";
import { TripsPageContainer } from "./trips-page-container";

export const metadata: Metadata = {
  title: "My Trips",
  robots: { index: false, follow: false },
};

export default function TripsPage() {
  return (
    <Suspense>
      <TripsPageContainer />
    </Suspense>
  );
}
