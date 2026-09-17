"use client";

import { DiscoverView } from "@/components/discover/discover-view";
import type { TemperatureUnit } from "@journiful/shared/types";

interface DiscoverPanelProps {
  tripId: string;
  temperatureUnit: TemperatureUnit;
  /** Gate the /discover fetch (mobile: active/adjacent slide). Defaults to true. */
  enabled?: boolean;
}

export function DiscoverPanel({ tripId, temperatureUnit, enabled = true }: DiscoverPanelProps) {
  return (
    <div className="px-4 pt-4">
      <DiscoverView tripId={tripId} temperatureUnit={temperatureUnit} enabled={enabled} />
    </div>
  );
}
