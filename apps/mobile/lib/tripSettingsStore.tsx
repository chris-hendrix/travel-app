import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { tripIsOver } from "@/lib/itinerary";
import { todayIn } from "@/lib/timezone";
import { readTripState, writeTripState } from "@/lib/tripState";
import type { Trip } from "@/components/trip/TripCard";
import {
  updateCalendarIncluded,
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
};

type TripSettingsValue = {
  for: (trip: Trip, now: Date) => TripSettings;
  update: (tripId: string, patch: Partial<TripSettings>) => void;
  /**
   * Merge a successful server read over the local overrides. Only the
   * defined keys move — a pending or failed read never reaches here,
   * so the fallbacks stand until the server has actually answered.
   */
  hydrate: (tripId: string, server: Partial<TripSettings>) => void;
  /**
   * Whether a server write is in flight for this trip. Screens read it
   * to disable the row that sent the write, so a second tap cannot fire
   * while the first is still flying.
   */
  isBusy: (tripId: string) => boolean;
  /**
   * Server write-through for the three server-backed rows, with the
   * Task 4 flow shape: paint the local override optimistically,
   * roll it back on failure, and rethrow so the screen reads the
   * failure through `toErrorCopy`. Local-only keys (`clock`,
   * `showPast`) never leave `update` and never touch the network.
   */
  setSharePhone: (tripId: string, value: boolean) => Promise<void>;
  /**
   * Whether this trip is in the member's calendar feed. Server-backed:
   * the feed filters on it, so a switch that only painted locally left a
   * trip inside a calendar the person had taken it out of.
   */
  setCalendarIncluded: (tripId: string, value: boolean) => Promise<void>;
  setNotificationPreference: (
    tripId: string,
    patch: Partial<NotificationPreferences>,
  ) => Promise<void>;
};

/**
 * Overlay the defined keys of a server read onto the local overrides.
 * Pure so the merge reads the same in the store and in tests: a server
 * value always wins over the default, and an absent key leaves the
 * current override (or the default) exactly as it was.
 */
export function mergeServerSettings(
  current: Partial<TripSettings> | undefined,
  server: Partial<TripSettings>,
): Partial<TripSettings> {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(server)) {
    if (value !== undefined) next[key] = value;
  }
  return next as Partial<TripSettings>;
}

/**
 * Undo an optimistic paint field by field. An explicit `undefined`
 * deletes the key (the `for()` defaults answer again); every key the
 * failed write did not own is left alone, so a concurrent write to a
 * neighbouring row survives the rollback.
 */
export function applyRollback(
  current: Partial<TripSettings> | undefined,
  patch: {
    [K in keyof TripSettings]?: TripSettings[K] | undefined;
  },
): Partial<TripSettings> {
  // Merged through `unknown` records: an explicit `undefined`
  // deletes the key (one cast, contained here) so `for()` falls
  // back to its defaults for a previously-unset row.
  const next: Record<string, unknown> = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as Partial<TripSettings>;
}

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

  /**
   * The two keys that are this device's rather than the server's, kept
   * across reloads: whose clock a trip's times are read on, and whether
   * its past is showing.
   *
   * The clock is the one that mattered. It lived in memory alone, so the
   * flip the chrome offers — the token in the header, one tap — was
   * forgotten by the next reload, and a setting that does not survive a
   * reload reads as a control that does not work. `showPast` came along
   * because it is the same kind of thing, one line away.
   *
   * Read once, on mount: until it lands, `for()` answers its defaults, so
   * a slow read shows the right screen a moment late rather than an empty
   * one. Written whole on every change — a handful of trips is smaller
   * than the bookkeeping that would update it in place.
   */
  type DeviceState = Record<
    string,
    Partial<Pick<TripSettings, "clock" | "showPast">>
  >;
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readTripState().then((stored) => {
      if (cancelled) return;
      if (stored && typeof stored === "object") {
        setByTrip((current) => ({ ...(stored as DeviceState), ...current }));
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const mine: DeviceState = {};
    for (const [tripId, patch] of Object.entries(byTrip)) {
      const held: Partial<Pick<TripSettings, "clock" | "showPast">> = {};
      if (patch.clock !== undefined) held.clock = patch.clock;
      if (patch.showPast !== undefined) held.showPast = patch.showPast;
      if (Object.keys(held).length > 0) mine[tripId] = held;
    }
    void writeTripState(mine);
  }, [byTrip, hydrated]);

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

  // A synchronous mirror of `byTrip`, updated alongside every paint.
  // State updaters run when React gets to them, so reading `byTrip`
  // at call time hands a second toggle the first toggle's optimistic
  // value as its previous — and a failure then restores a value the
  // server never had. The mirror is written in the same tick as the
  // paint, so `previous` is always the value before this write.
  const latestRef = useRef<Record<string, Partial<TripSettings>>>({});
  latestRef.current = byTrip;

  // Which server writes are in flight, by trip and field. The ref is
  // the guard (a second press while the first flies is dropped); the
  // state beside it repaints the screens that disable the busy row.
  const guardRef = useRef<Set<string>>(new Set());
  const [busyCount, setBusyCount] = useState<Record<string, number>>({});

  const restore = useCallback((tripId: string, patch: RollbackPatch) => {
    latestRef.current = {
      ...latestRef.current,
      [tripId]: applyRollback(latestRef.current[tripId], patch),
    };
    setByTrip((current) => ({
      ...current,
      [tripId]: applyRollback(current[tripId], patch),
    }));
  }, []);

  const hydrate = useCallback((tripId: string, server: Partial<TripSettings>) => {
    latestRef.current = {
      ...latestRef.current,
      [tripId]: mergeServerSettings(latestRef.current[tripId], server),
    };
    setByTrip((current) => ({
      ...current,
      [tripId]: mergeServerSettings(current[tripId], server),
    }));
  }, []);

  const isBusy = useCallback(
    (tripId: string) => (busyCount[tripId] ?? 0) > 0,
    [busyCount],
  );

  /**
   * One guarded server write: drop the call when this trip's field is
   * already flying, else capture the pre-paint values for exactly the
   * fields owned, paint, send, and roll back only those fields.
   */
  const runServerWrite = useCallback(
    async (
      tripId: string,
      field: string,
      paint: Partial<TripSettings>,
      work: () => Promise<unknown>,
    ) => {
      const key = `${tripId}:${field}`;
      if (guardRef.current.has(key)) return;
      guardRef.current.add(key);
      setBusyCount((current) => ({
        ...current,
        [tripId]: (current[tripId] ?? 0) + 1,
      }));
      const previous: RollbackPatch = {};
      for (const owned of Object.keys(paint) as Array<keyof TripSettings>) {
        (previous as Record<string, unknown>)[owned] =
          latestRef.current[tripId]?.[owned];
      }
      latestRef.current = {
        ...latestRef.current,
        [tripId]: { ...latestRef.current[tripId], ...paint },
      };
      setByTrip((current) => ({
        ...current,
        [tripId]: { ...current[tripId], ...paint },
      }));
      try {
        await work();
      } catch (err) {
        restore(tripId, previous);
        throw err;
      } finally {
        guardRef.current.delete(key);
        setBusyCount((current) => ({
          ...current,
          [tripId]: Math.max(0, (current[tripId] ?? 1) - 1),
        }));
      }
    },
    [restore],
  );

  const setSharePhone = useCallback(
    (tripId: string, value: boolean) =>
      runServerWrite(tripId, "sharePhone", { sharePhone: value }, () =>
        updateSharePhone(tripId, value),
      ),
    [runServerWrite],
  );

  const setNotificationPreference = useCallback(
    (tripId: string, patch: Partial<NotificationPreferences>) =>
      runServerWrite(
        tripId,
        "notifications",
        { ...patch },
        () => updateNotificationPreference(tripId, patch),
      ),
    [runServerWrite],
  );

  /**
   * The trip's place in the calendar feed, written through: paint, send,
   * roll back on failure, rethrow so the screen can say what happened.
   * Same shape as `setSharePhone` above.
   */
  const setCalendarIncluded = useCallback(
    (tripId: string, value: boolean) =>
      runServerWrite(
        tripId,
        "calendarIncluded",
        { calendarIncluded: value },
        () => updateCalendarIncluded(tripId, value),
      ),
    [runServerWrite],
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
      }),
      update,
      hydrate,
      isBusy,
      setSharePhone,
      setCalendarIncluded,
      setNotificationPreference,
    }),
    [
      byTrip,
      update,
      hydrate,
      isBusy,
      setSharePhone,
      setCalendarIncluded,
      setNotificationPreference,
    ],
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
