"use client";

import { TripsContent } from "./trips-content";
import { TripDetailShell } from "./trip-detail";

interface TripsPageContainerProps {
  id: string | null;
}

export function TripsPageContainer({ id }: TripsPageContainerProps) {
  if (!id) {
    return <TripsContent />;
  }

  return <TripDetailShell />;
}
