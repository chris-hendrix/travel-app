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
import {
  updateNotificationPreference,
  updateSharePhone,
  type NotificationPreferences,
} from "@/lib/queries/trip-settings";

/** Whose clock the times are read on. */
export type Clock = "trip" | "device";

/**
 * What one person has decided about one trip. Not the trip's own
 * settings — those are the organizer's, and that surface is called Trip
 * details. These are yours, which is why every member has them.
 *
 * The notification pair is the server's own `notification_preferences`,
 * which is per user per trip and both true until turned off. They stay
 * in Trip settings, with phone sharing and the calendar; the run's own
 * switch — past events — lives on the run itself, because it changes
 * what is in front of you as you flip it.
 */
export type TripSettings = {
  showPast: boolean;
  clock: Clock;
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
  /**
   * Server write-through for the three server-backed rows, with the
   * Task 4 flow shape: paint the local override optimistically,
   * roll it back on failure, and rethrow so the screen reads the
   * failure through `toErrorCopy`. Local-only keys (`clock`,
   * `showPast`, `pushEnabled`, `calendarIncluded`) never
   * leave `update` and never touch the network.
   */
  setSharePhone: (tripId: string, value: boolean) => Promise<void>;
  setNotificationPreference: (
    tripId: string,
    patch: Partial<NotificationPreferences>,
  ) => Promise<void>;
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
 * is a blank page. It opens as a list of rows, and it stays one: a run
 * is a schedule you read rather than a gallery you browse, a card is
 * most of a phone screen per thing where a row keeps the photo at 56
 * points and shows the clock, and the toggle that offered the other one
 * was a second way to draw the same screen — with a state to persist, a
 * control to hide whenever the run was empty, and no answer for a run
 * holding only a stay.
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

  /**
   * Restore one row to its pre-paint override after a failed write.
   * An absent override deletes the key (the `for()` defaults answer
   * again). The value type admits an explicit `undefined` so a
   * previously-unset row can be expressed; `Partial<TripSettings>`
   * cannot under `exactOptionalPropertyTypes`.
   */
  type RollbackPatch = {
    [K in keyof TripSettings]?: TripSettings[K] | undefined;
  };
  const restore = useCallback((tripId: string, patch: RollbackPatch) => {
    setByTrip((current) => {
      // Merged through `unknown` records: an explicit `undefined`
      // deletes the key (one cast, contained here) so `for()` falls
      // back to its defaults for a previously-unset row.
      const merged: Record<string, unknown> = { ...current[tripId] };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete merged[key];
        else merged[key] = value;
      }
      return {
        ...current,
        [tripId]: merged as Partial<TripSettings>,
      };
    });
  }, []);

  const setSharePhone = useCallback(
    async (tripId: string, value: boolean) => {
      const previous = byTrip[tripId]?.sharePhone;
      setByTrip((current) => ({
        ...current,
        [tripId]: { ...current[tripId], sharePhone: value },
      }));
      try {
        await updateSharePhone(tripId, value);
      } catch (err) {
        restore(tripId, { sharePhone: previous });
        throw err;
      }
    },
    [byTrip, restore],
  );

  const setNotificationPreference = useCallback(
    async (tripId: string, patch: Partial<NotificationPreferences>) => {
      const previous = {
        dailyItinerary: byTrip[tripId]?.dailyItinerary,
        tripMessages: byTrip[tripId]?.tripMessages,
      };
      setByTrip((current) => ({
        ...current,
        [tripId]: { ...current[tripId], ...patch },
      }));
      try {
        await updateNotificationPreference(tripId, patch);
      } catch (err) {
        restore(tripId, previous);
        throw err;
      }
    },
    [byTrip, restore],
  );

  const value = useMemo<TripSettingsValue>(
    () => ({
      for: (trip, now) => ({
        showPast: byTrip[trip.id]?.showPast ?? tripIsOver(
          trip.endDate,
          todayIn(trip.preferredTimezone, now),
        ),
        clock: byTrip[trip.id]?.clock ?? "trip",
        dailyItinerary: byTrip[trip.id]?.dailyItinerary ?? true,
        tripMessages: byTrip[trip.id]?.tripMessages ?? true,
        sharePhone: byTrip[trip.id]?.sharePhone ?? false,
        calendarIncluded: byTrip[trip.id]?.calendarIncluded ?? true,
        pushEnabled: byTrip[trip.id]?.pushEnabled ?? false,
      }),
      update,
      setSharePhone,
      setNotificationPreference,
    }),
    [byTrip, update, setSharePhone, setNotificationPreference],
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
