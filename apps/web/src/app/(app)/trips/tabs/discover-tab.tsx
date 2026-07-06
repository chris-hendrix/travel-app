"use client";

import { DiscoverView } from "@/components/discover/discover-view";
import { useTripPage } from "../trip-page-context";

export default function DiscoverTab() {
  const { tripId, temperatureUnit } = useTripPage();
  return <DiscoverView tripId={tripId} temperatureUnit={temperatureUnit} />;
}
