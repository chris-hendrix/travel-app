"use client";

import { memo } from "react";
import { Droplets } from "lucide-react";
import type {
  TripWeatherResponse,
  TemperatureUnit,
} from "@tripful/shared/types";
import {
  getWeatherInfo,
  toDisplayTemp,
  type WeatherTone,
} from "@/lib/weather-codes";
import { Skeleton } from "@/components/ui/skeleton";

interface WeatherForecastCardProps {
  weather: TripWeatherResponse | undefined;
  isLoading: boolean;
  temperatureUnit: TemperatureUnit;
  isDark?: boolean;
}

function formatDayOfWeek(dateStr: string): string {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function formatRelativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TONE_STYLES: Record<
  WeatherTone,
  { light: string; dark: string; icon: string; iconDark: string }
> = {
  sunny: {
    light: "bg-amber-100",
    dark: "bg-amber-950",
    icon: "text-amber-500",
    iconDark: "text-amber-400",
  },
  cloudy: {
    light: "bg-white",
    dark: "bg-gray-900",
    icon: "text-gray-400",
    iconDark: "text-gray-400",
  },
  fog: {
    light: "bg-white",
    dark: "bg-gray-900",
    icon: "text-gray-400",
    iconDark: "text-gray-400",
  },
  rain: {
    light: "bg-blue-100",
    dark: "bg-blue-950",
    icon: "text-blue-500",
    iconDark: "text-blue-400",
  },
  snow: {
    light: "bg-blue-50",
    dark: "bg-blue-950",
    icon: "text-sky-400",
    iconDark: "text-sky-300",
  },
  storm: {
    light: "bg-blue-200",
    dark: "bg-blue-950",
    icon: "text-blue-600",
    iconDark: "text-blue-300",
  },
};

export const WeatherForecastCard = memo(function WeatherForecastCard({
  weather,
  isLoading,
  temperatureUnit,
  isDark = false,
}: WeatherForecastCardProps) {
  if (isLoading) {
    return (
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-1 min-w-[6rem] flex-col items-center gap-1.5 rounded-md bg-muted/40 p-2"
          >
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </div>
    );
  }

  if (!weather || !weather.available) {
    if (weather?.message) {
      return <p className="text-sm text-muted-foreground">{weather.message}</p>;
    }
    return null;
  }

  const unit = temperatureUnit === "fahrenheit" ? "F" : "C";
  // Use local date (not UTC) so "today" matches the user's wall clock
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const upcomingForecasts = weather.forecasts.filter((f) => f.date >= todayStr);

  if (upcomingForecasts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div
        className="flex gap-1.5 overflow-x-auto pb-0.5"
        role="region"
        aria-label="Weather forecast"
        tabIndex={0}
      >
        {upcomingForecasts.map((day) => {
          const { icon: Icon, label, tone } = getWeatherInfo(day.weatherCode);
          const high = toDisplayTemp(day.temperatureMax, temperatureUnit);
          const low = toDisplayTemp(day.temperatureMin, temperatureUnit);
          const styles = TONE_STYLES[tone];
          const tileBg = isDark ? styles.dark : styles.light;
          const iconColor = isDark ? styles.iconDark : styles.icon;

          return (
            <div
              key={day.date}
              className={`flex min-w-[6rem] flex-1 flex-col items-center rounded-md px-1.5 py-2 ${tileBg}`}
              title={label}
              aria-label={`${formatDayOfWeek(day.date)}: ${label}, high ${high}, low ${low}${day.precipitationProbability > 5 ? `, ${day.precipitationProbability}% rain` : ""}`}
            >
              {/* Day + date */}
              <span
                className={`text-[0.625rem] font-semibold uppercase tracking-wide ${isDark ? "text-foreground" : "text-foreground/70"}`}
              >
                {formatDayOfWeek(day.date)}
              </span>
              <span
                className={`text-[0.5625rem] leading-tight ${isDark ? "text-foreground/70" : "text-muted-foreground"}`}
              >
                {formatDate(day.date)}
              </span>

              {/* Icon */}
              <Icon
                className={`my-1 h-5 w-5 ${iconColor}`}
                aria-hidden="true"
              />

              {/* Temperatures */}
              <div className="flex items-baseline gap-0.5">
                <span className="text-sm font-semibold tabular-nums leading-none text-foreground">
                  {high}&deg;
                </span>
                <span
                  className={`text-[0.625rem] tabular-nums ${isDark ? "text-foreground/70" : "text-muted-foreground"}`}
                >
                  {low}&deg;{unit}
                </span>
              </div>

              {/* Precipitation */}
              {day.precipitationProbability > 5 && (
                <span
                  className={`mt-0.5 inline-flex items-center gap-0.5 text-[0.5625rem] ${isDark ? "text-blue-300" : "text-blue-500/80"}`}
                >
                  <Droplets className="h-2.5 w-2.5" />
                  {day.precipitationProbability}%
                </span>
              )}
            </div>
          );
        })}
      </div>
      {(weather.location || weather.fetchedAt) && (
        <div
          className={`text-[0.6875rem] ${isDark ? "text-foreground/50" : "text-muted-foreground/70"}`}
        >
          {weather.location && <p className="truncate">{weather.location}</p>}
          {weather.fetchedAt && (
            <p>Updated {formatRelativeTime(weather.fetchedAt)}</p>
          )}
        </div>
      )}
    </div>
  );
});
