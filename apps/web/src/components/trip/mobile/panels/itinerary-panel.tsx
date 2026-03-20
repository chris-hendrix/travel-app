"use client";

import { ItineraryView } from "@/components/itinerary/itinerary-view";
import type { DailyForecast, TemperatureUnit } from "@journiful/shared/types";

interface ItineraryPanelProps {
  tripId: string;
  onAddTravel?: () => void;
  forecasts?: DailyForecast[];
  temperatureUnit?: TemperatureUnit;
  hideFab?: boolean;
}

export function ItineraryPanel({
  tripId,
  onAddTravel,
  forecasts,
  temperatureUnit,
  hideFab,
}: ItineraryPanelProps) {
  return (
    <ItineraryView
      tripId={tripId}
      {...(onAddTravel ? { onAddTravel } : {})}
      {...(forecasts ? { forecasts } : {})}
      {...(temperatureUnit ? { temperatureUnit } : {})}
      {...(hideFab != null ? { hideFab } : {})}
    />
  );
}
