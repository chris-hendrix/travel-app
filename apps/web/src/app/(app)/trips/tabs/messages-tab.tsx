"use client";

import { useTripPage } from "../trip-page-context";
import { TripMessages } from "@/components/messaging";
import { ErrorBoundary } from "@/components/error-boundary";

export default function MessagesTab() {
  const { tripId, isOrganizer, isLocked, currentMember } = useTripPage();

  return (
    <ErrorBoundary>
      <TripMessages
        tripId={tripId}
        isOrganizer={isOrganizer}
        disabled={isLocked}
        isMuted={currentMember?.isMuted}
      />
    </ErrorBoundary>
  );
}
