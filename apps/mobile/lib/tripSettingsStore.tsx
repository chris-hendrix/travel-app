import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { tripIsOver } from "@/lib/itinerary";
import { todayIn } from "@/lib/timezone";
import type { Trip } from "@/components/trip/TripCard";

/** Whose clock the times are read on. */
export type Clock = "trip" | "device";

/** How the days are laid out. */
export type Layout = "cards" | "list";

/**
 * What one person has decided about one trip. Not the trip's own
 * settings — those are the organizer's, and that surface is called Edit
 * trip. These are yours, which is why every member has them.
 *
 * The notification pair is the server's own `notification_preferences`,
 * which is per user per trip and both true until turned off. It is why
 * this dialog is called Itinerary settings: the daily digest and the
 * message alerts are both about the itinerary.
 */
export type TripSettings = {
  showPast: boolean;
  clock: Clock;
  layout: Layout;
  dailyItinerary: boolean;
  tripMessages: boolean;
  /** `members.sharePhone`: whether the others can see your number. */
  sharePhone: boolean;
  /** `members.calendarExcluded`, said the other way round — the server
   *  stores the exclusion, people think in inclusion. */
  calendarIncluded: boolean;
  /** A device permission rather than a server field: off until asked. */
  pushEnabled: boolean;
};

type TripSettingsValue = {
  for: (trip: Trip, now: Date) => TripSettings;
  update: (tripId: string, patch: Partial<TripSettings>) => void;
};

const TripSettingsContext = createContext<TripSettingsValue | null>(null);

/**
 * Your settings per trip, in memory, standing in for the API — the same
 * shape as the per-trip notification preferences the server already
 * keeps.
 *
 * Defaults are a decision, not a blank: a trip you are still on opens on
 * today with its past out of the way, and a trip that is over opens with
 * everything showing, because a finished itinerary with the past hidden
 * is a blank page.
 */
export function TripSettingsProvider({ children }: { children: ReactNode }) {
  const [byTrip, setByTrip] = useState<Record<string, Partial<TripSettings>>>(
    {},
  );

  const update = useCallback((tripId: string, patch: Partial<TripSettings>) => {
    setByTrip((current) => ({
      ...current,
      [tripId]: { ...current[tripId], ...patch },
    }));
  }, []);

  const value = useMemo<TripSettingsValue>(
    () => ({
      for: (trip, now) => ({
        showPast: byTrip[trip.id]?.showPast ?? tripIsOver(
          trip.endDate,
          todayIn(trip.preferredTimezone, now),
        ),
        clock: byTrip[trip.id]?.clock ?? "trip",
        layout: byTrip[trip.id]?.layout ?? "cards",
        dailyItinerary: byTrip[trip.id]?.dailyItinerary ?? true,
        tripMessages: byTrip[trip.id]?.tripMessages ?? true,
        sharePhone: byTrip[trip.id]?.sharePhone ?? false,
        calendarIncluded: byTrip[trip.id]?.calendarIncluded ?? true,
        pushEnabled: byTrip[trip.id]?.pushEnabled ?? false,
      }),
      update,
    }),
    [byTrip, update],
  );

  return (
    <TripSettingsContext.Provider value={value}>
      {children}
    </TripSettingsContext.Provider>
  );
}

export function useTripSettings(): TripSettingsValue {
  const value = useContext(TripSettingsContext);
  if (!value) {
    throw new Error("useTripSettings must be used inside TripSettingsProvider");
  }
  return value;
}
