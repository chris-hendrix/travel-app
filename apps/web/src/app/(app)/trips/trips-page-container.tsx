"use client";

import { useSearchParams } from "next/navigation";
import { TripsContent } from "./trips-content";
import { TripDetailShell } from "./trip-detail";

export function TripsPageContainer() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  if (!id) {
    return <TripsContent />;
  }

  return <TripDetailShell />;
}
