"use client";

import { memo, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Droplets,
  Sun,
  Sunrise,
  Sunset,
  Wind,
  XIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { VisuallyHidden } from "radix-ui";
import type {
  DailyForecastExtended,
  HourlyForecast,
  TemperatureUnit,
} from "@journiful/shared/types";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getWeatherInfo,
  toDisplayTemp,
  toDisplayWindSpeed,
  windSpeedUnit,
  TONE_STYLES,
} from "@/lib/weather-codes";
import {
  getHourlyForDay,
  getAnchorHourIndex,
  windDegreesToCompass,
  uvIndexLevel,
} from "@/lib/weather-utils";

interface WeatherDetailSheetProps {
  forecasts: DailyForecastExtended[];
  hourly: HourlyForecast[];
  selectedIndex: number;
  onIndexChange: (i: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  temperatureUnit: TemperatureUnit;
  isDark: boolean;
}

function formatSheetDate(dateStr: string): string {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isToday(dateStr: string): boolean {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return dateStr === todayStr;
}

function formatHour(timeStr: string): string {
  const [, timePart] = timeStr.split("T") as [string, string];
  const hour = Number(timePart.split(":")[0]);
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function getCurrentHourTemp(
  hourly: HourlyForecast[],
  date: string,
): number | null {
  const now = new Date();
  const currentHour = now.getHours();
  // Find the hourly entry closest to the current hour for today
  let closest: HourlyForecast | null = null;
  let closestDiff = Infinity;
  for (const entry of hourly) {
    const [datePart, timePart] = entry.time.split("T") as [string, string];
    if (datePart !== date) continue;
    const hour = Number(timePart.split(":")[0]);
    const diff = Math.abs(hour - currentHour);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = entry;
    }
  }
  return closest?.temperature ?? null;
}

function formatSunTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":") as [string, string];
  let hour = Number(hourStr);
  const suffix = hour >= 12 ? "PM" : "AM";
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  return `${hour}:${minuteStr} ${suffix}`;
}

function getMaxHourlyValue(
  hourly: HourlyForecast[],
  date: string,
  field: "humidity" | "dewPoint",
): number {
  let max = 0;
  for (const entry of hourly) {
    const [datePart] = entry.time.split("T");
    if (datePart === date && entry[field] > max) {
      max = entry[field];
    }
  }
  return max;
}

function DetailCard({
  icon: Icon,
  label,
  value,
  secondary,
  isDark,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  secondary?: string;
  isDark: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-md p-3 ${isDark ? "bg-gray-900" : "bg-muted/50"}`}
    >
      <div
        className={`flex items-center gap-1.5 text-xs ${isDark ? "text-foreground/60" : "text-muted-foreground"}`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      {secondary && (
        <span
          className={`text-xs ${isDark ? "text-foreground/50" : "text-muted-foreground"}`}
        >
          {secondary}
        </span>
      )}
    </div>
  );
}

export const WeatherDetailSheet = memo(function WeatherDetailSheet({
  forecasts,
  hourly,
  selectedIndex,
  onIndexChange,
  open,
  onOpenChange,
  temperatureUnit,
  isDark,
}: WeatherDetailSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const forecast = forecasts[selectedIndex];

  const today = forecast ? isToday(forecast.date) : false;
  const nextForecast = forecast ? forecasts[selectedIndex + 1] : undefined;
  const dayHours = forecast
    ? getHourlyForDay(hourly, forecast.date, nextForecast?.date)
    : [];
  const anchorIdx = today ? getAnchorHourIndex(dayHours, new Date()) : 0;

  useEffect(() => {
    const el = scrollRef.current?.children[anchorIdx] as
      | HTMLElement
      | undefined;
    el?.scrollIntoView({ inline: "start", behavior: "instant" });
  }, [anchorIdx, selectedIndex]);

  if (!forecast) return null;

  const { icon: WeatherIcon, label, tone } = getWeatherInfo(
    forecast.weatherCode,
  );
  const styles = TONE_STYLES[tone];
  const iconColor = isDark ? styles.iconDark : styles.icon;
  const unit = temperatureUnit === "fahrenheit" ? "F" : "C";
  const high = toDisplayTemp(forecast.temperatureMax, temperatureUnit);
  const low = toDisplayTemp(forecast.temperatureMin, temperatureUnit);

  const currentTemp = today
    ? getCurrentHourTemp(hourly, forecast.date)
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        showCloseButton={false}
        className={isDark ? "bg-gray-950 text-white" : "bg-white"}
      >
        <VisuallyHidden.Root>
          <SheetTitle>Weather details</SheetTitle>
          <SheetDescription>Detailed weather forecast for the selected day</SheetDescription>
        </VisuallyHidden.Root>

        {/* Header actions */}
        <div className="flex items-center justify-end gap-1 px-4 pt-4">
          <SheetClose className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
            <XIcon className="w-4 h-4" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>

        <SheetBody className="space-y-5">
          {/* Day navigation header */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => onIndexChange(selectedIndex - 1)}
              disabled={selectedIndex === 0}
              className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold">
              {formatSheetDate(forecast.date)}
            </span>
            <button
              onClick={() => onIndexChange(selectedIndex + 1)}
              disabled={selectedIndex === forecasts.length - 1}
              className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
              aria-label="Next day"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Day summary */}
          <div className="flex flex-col items-center gap-1 text-center">
            {today && currentTemp !== null ? (
              <>
                <div className="text-5xl font-light tabular-nums">
                  {toDisplayTemp(currentTemp, temperatureUnit)}&deg;
                  <span className="text-lg">{unit}</span>
                </div>
                <p
                  className={`text-sm ${isDark ? "text-foreground/60" : "text-muted-foreground"}`}
                >
                  Feels like{" "}
                  {toDisplayTemp(
                    forecast.apparentTemperatureMax,
                    temperatureUnit,
                  )}
                  &deg;
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <WeatherIcon className={`h-5 w-5 ${iconColor}`} />
                  <span className="text-sm">{label}</span>
                </div>
              </>
            ) : (
              <>
                <WeatherIcon className={`h-10 w-10 ${iconColor}`} />
                <span className="text-sm font-medium">{label}</span>
              </>
            )}
            <p
              className={`text-sm ${isDark ? "text-foreground/60" : "text-muted-foreground"}`}
            >
              High {high}&deg; &middot; Low {low}&deg;
            </p>
          </div>

          {/* Hourly forecast scroll */}
          {dayHours.length > 0 && (
            <div
              ref={scrollRef}
              className="flex gap-1.5 overflow-x-auto scrollbar-none"
            >
              {dayHours.map((hour) => {
                const hourInfo = getWeatherInfo(hour.weatherCode);
                const hourStyles = TONE_STYLES[hourInfo.tone];
                const hourBg = isDark ? hourStyles.dark : hourStyles.light;
                const hourIconColor = isDark
                  ? hourStyles.iconDark
                  : hourStyles.icon;
                const HourIcon = hourInfo.icon;

                return (
                  <div
                    key={hour.time}
                    className={`flex min-w-[4.5rem] flex-col items-center gap-1 rounded-md px-2 py-2.5 ${hourBg}`}
                  >
                    <span
                      className={`text-xs font-medium ${isDark ? "text-foreground/70" : "text-muted-foreground"}`}
                    >
                      {formatHour(hour.time)}
                    </span>
                    <HourIcon
                      className={`h-5 w-5 ${hourIconColor}`}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold tabular-nums">
                      {toDisplayTemp(hour.temperature, temperatureUnit)}&deg;
                    </span>
                    <span
                      className={`text-[0.625rem] ${isDark ? "text-foreground/60" : "text-muted-foreground"}`}
                    >
                      {toDisplayWindSpeed(hour.windSpeed, temperatureUnit)} {windSpeedUnit(temperatureUnit)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Detail grid */}
          <div className="grid grid-cols-2 gap-2">
            <DetailCard
              icon={Wind}
              label="Wind"
              value={`${toDisplayWindSpeed(forecast.windSpeedMax, temperatureUnit)} ${windSpeedUnit(temperatureUnit)}`}
              secondary={windDegreesToCompass(forecast.windDirectionDominant)}
              isDark={isDark}
            />
            <DetailCard
              icon={Sun}
              label="UV Index"
              value={String(Math.round(forecast.uvIndexMax))}
              secondary={uvIndexLevel(forecast.uvIndexMax)}
              isDark={isDark}
            />
            <DetailCard
              icon={Droplets}
              label="Humidity"
              value={`${getMaxHourlyValue(hourly, forecast.date, "humidity")}%`}
              secondary={`Dew point ${toDisplayTemp(getMaxHourlyValue(hourly, forecast.date, "dewPoint"), temperatureUnit)}\u00B0`}
              isDark={isDark}
            />
            <DetailCard
              icon={CloudRain}
              label="Precipitation"
              value={`${forecast.precipitationProbability}%`}
              isDark={isDark}
            />
            <DetailCard
              icon={Sunrise}
              label="Sunrise"
              value={formatSunTime(forecast.sunrise)}
              isDark={isDark}
            />
            <DetailCard
              icon={Sunset}
              label="Sunset"
              value={formatSunTime(forecast.sunset)}
              isDark={isDark}
            />
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
});
