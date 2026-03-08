"use client";

import { memo } from "react";
import { Droplets } from "lucide-react";
import type { TripWeatherResponse, TemperatureUnit } from "@tripful/shared/types";
import { getWeatherInfo } from "@/lib/weather-codes";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface WeatherForecastCardProps {
  weather: TripWeatherResponse | undefined;
  isLoading: boolean;
  temperatureUnit: TemperatureUnit;
}

function toDisplayTemp(celsius: number, unit: TemperatureUnit): number {
  if (unit === "fahrenheit") {
    return Math.round(celsius * (9 / 5) + 32);
  }
  return Math.round(celsius);
}

function formatDayOfWeek(dateStr: string): string {
  // dateStr is "2026-03-15" — parse as local date to avoid timezone shift
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const date = new Date(
    Number(yearStr),
    Number(monthStr) - 1,
    Number(dayStr),
  );
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

export const WeatherForecastCard = memo(function WeatherForecastCard({
  weather,
  isLoading,
  temperatureUnit,
}: WeatherForecastCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-5 w-32" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!weather || !weather.available) {
    if (weather?.message) {
      return (
        <Card className="border-dashed">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{weather.message}</p>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  const unit = temperatureUnit === "fahrenheit" ? "F" : "C";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Weather Forecast</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex overflow-x-auto overflow-y-hidden [&>*]:flex-none gap-4 pb-1">
          {weather.forecasts.map((day) => {
            const { icon: Icon, label } = getWeatherInfo(day.weatherCode);
            const high = toDisplayTemp(day.temperatureMax, temperatureUnit);
            const low = toDisplayTemp(day.temperatureMin, temperatureUnit);

            return (
              <div
                key={day.date}
                className="flex flex-col items-center gap-1 text-xs"
                title={label}
              >
                <span className="font-medium">
                  {formatDayOfWeek(day.date)}
                </span>
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span>
                  {high}&deg;/{low}&deg;{unit}
                </span>
                {day.precipitationProbability > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                    <Droplets className="h-3 w-3" />
                    {day.precipitationProbability}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
});
