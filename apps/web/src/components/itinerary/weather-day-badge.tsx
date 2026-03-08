"use client";

import { memo } from "react";
import type { DailyForecast, TemperatureUnit } from "@tripful/shared/types";
import { getWeatherInfo } from "@/lib/weather-codes";

interface WeatherDayBadgeProps {
  forecast: DailyForecast | undefined;
  temperatureUnit: TemperatureUnit;
}

function toDisplayTemp(celsius: number, unit: TemperatureUnit): number {
  if (unit === "fahrenheit") {
    return Math.round(celsius * (9 / 5) + 32);
  }
  return Math.round(celsius);
}

export const WeatherDayBadge = memo(function WeatherDayBadge({
  forecast,
  temperatureUnit,
}: WeatherDayBadgeProps) {
  if (!forecast) return null;

  const { icon: Icon } = getWeatherInfo(forecast.weatherCode);
  const high = toDisplayTemp(forecast.temperatureMax, temperatureUnit);
  const low = toDisplayTemp(forecast.temperatureMin, temperatureUnit);
  const unit = temperatureUnit === "fahrenheit" ? "F" : "C";

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-4 w-4" />
      <span>
        {high}&deg;/{low}&deg;{unit}
      </span>
    </span>
  );
});
