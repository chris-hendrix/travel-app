"use client";

import { useTripPage } from "../trip-page-context";
import { SettleSection } from "@/components/settle/settle-section";
import { ErrorBoundary } from "@/components/error-boundary";

export default function SettleTab() {
  const { tripId, isOrganizer, isLocked } = useTripPage();

  return (
    <ErrorBoundary>
      <SettleSection
        tripId={tripId}
        isOrganizer={isOrganizer}
        disabled={isLocked}
      />
    </ErrorBoundary>
  );
}
