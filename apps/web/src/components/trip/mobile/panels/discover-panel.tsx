"use client";

import { DiscoverView } from "@/components/discover/discover-view";
import type { TemperatureUnit } from "@journiful/shared/types";

interface DiscoverPanelProps {
  tripId: string;
  temperatureUnit: TemperatureUnit;
}

export function DiscoverPanel({ tripId, temperatureUnit }: DiscoverPanelProps) {
  return (
    <div className="px-4 pt-4">
      <DiscoverView tripId={tripId} temperatureUnit={temperatureUnit} />
    </div>
  );
}
