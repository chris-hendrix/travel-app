"use client";

import { useTripPage } from "./trip-page-context";
import { ItineraryView } from "@/components/itinerary/itinerary-view";

export default function TripDefaultPage() {
  const { tripId, weather, temperatureUnit, setShowOnboarding } = useTripPage();

  return (
    <ItineraryView
      tripId={tripId}
      onAddTravel={() => setShowOnboarding(true)}
      forecasts={weather?.forecasts}
      temperatureUnit={temperatureUnit}
    />
  );
}
