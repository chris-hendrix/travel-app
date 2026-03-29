"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { User } from "@journiful/shared";
import type { TemperatureUnit } from "@journiful/shared/types";
import type { TripDetailWithMeta } from "@/hooks/trip-queries";
import type { useWeatherForecast } from "@/hooks/use-weather";
import type { useEvents } from "@/hooks/use-events";

type WeatherData = ReturnType<typeof useWeatherForecast>["data"];
type EventsData = ReturnType<typeof useEvents>["data"];

interface TripPageContextValue {
  tripId: string;
  trip: TripDetailWithMeta;
  isOrganizer: boolean;
  isLocked: boolean;
  weather: WeatherData;
  weatherLoading: boolean;
  temperatureUnit: TemperatureUnit;
  currentMember: { id: string; userId: string; isMuted: boolean | undefined } | undefined;
  user: User | null;
  events: EventsData;

  // Dialog openers
  openEdit: () => void;
  openInvite: () => void;
  openSettings: () => void;
  openMembers: () => void;
  setShowOnboarding: (show: boolean) => void;
}

const TripPageContext = createContext<TripPageContextValue | null>(null);

export function useTripPage() {
  const ctx = useContext(TripPageContext);
  if (!ctx) {
    throw new Error("useTripPage must be used within a TripPageProvider");
  }
  return ctx;
}

interface TripPageProviderProps extends TripPageContextValue {
  children: ReactNode;
}

export function TripPageProvider({ children, ...value }: TripPageProviderProps) {
  const contextValue = useMemo(
    () => value,
    [
      value.tripId,
      value.trip,
      value.isOrganizer,
      value.isLocked,
      value.weather,
      value.weatherLoading,
      value.temperatureUnit,
      value.currentMember,
      value.user,
      value.events,
      value.openEdit,
      value.openInvite,
      value.openSettings,
      value.openMembers,
      value.setShowOnboarding,
    ],
  );

  return (
    <TripPageContext.Provider value={contextValue}>
      {children}
    </TripPageContext.Provider>
  );
}
