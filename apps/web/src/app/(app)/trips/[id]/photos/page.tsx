"use client";

import { useTripPage } from "../trip-page-context";
import { PhotosSection } from "@/components/photos/photos-section";

export default function PhotosTab() {
  const { trip, isOrganizer, isLocked } = useTripPage();

  return (
    <PhotosSection
      tripId={trip.id}
      isOrganizer={isOrganizer}
      disabled={isLocked}
    />
  );
}
