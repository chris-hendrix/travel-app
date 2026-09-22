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
import { zoneAbbr, zoneOffsetMinutes } from "@/lib/timezone";
import type { Clock } from "@/lib/tripSettingsStore";

/**
 * The zone the times on screen are in, and how to change it.
 *
 * Times used to say their own zone — every row, every field — which is
 * the same fact repeated until nobody reads it. It is one fact about the
 * screen, so it is stated once, by the chrome above the times: the
 * wordmark bar on a screen, the title bar in a dialog.
 *
 * Whatever shows times registers here. That is not a convenience: a
 * dialog is a route, not an overlay, so the screen behind it is covered —
 * and a covered screen stays mounted, which is the part the first version
 * of this got wrong. It kept one slot, the last writer filled it and any
 * leaver emptied it, and a screen underneath never re-runs its effect: the
 * token vanished the moment a dialog was dismissed. Push any screen from
 * the trip page and come back and the chrome read wordmark, bell, avatar.
 *
 * So registrations stack. Each surface holds a key for as long as it is
 * mounted, the top of the stack is what renders, and what it uncovers
 * when it leaves is the zone that never went anywhere.
 *
 * Nothing registered means nothing renders. The trips screen has no trip
 * and no times, and a zone there would be a claim about nothing.
 */
export type DisplayZone = {
  /** What the times are read on: "CEST", "EDT". */
  abbr: string;
  /** The setting that chose it, for screen readers and for the flip:
   *  "Trip time" or "Your time". */
  label: string;
  /**
   * Whether the other clock would read differently here.
   *
   * False means the flip is not offered at all, which is the honest
   * answer when both clocks show the same wall: the tap would change the
   * setting and nothing on screen, and a control that looks like it did
   * nothing is worse than no control. It is not a nicety — a member in
   * the trip's own zone is the normal case, and the token spent that whole
   * case looking broken.
   */
  canFlip: boolean;
  /** Flip to the other clock. Undefined when there is nothing to flip. */
  onFlip?: (() => void) | undefined;
};

type Entry = { key: number; zone: DisplayZone };

type DisplayZoneValue = {
  zone: DisplayZone | null;
  register: (key: number, zone: DisplayZone) => void;
  unregister: (key: number) => void;
};

const DisplayZoneContext = createContext<DisplayZoneValue | null>(null);

/** Keys are handed out once per `useDisplayZone` caller. */
let nextKey = 0;

export function DisplayZoneProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);

  /**
   * Replace this surface's own entry, or take a new one on top.
   *
   * In place rather than on top when it already has one: a surface's
   * clock can change while it is covered (the zone is derived from the
   * trip and the moment), and a lower screen's clock changing must not
   * take the token from the surface above it.
   */
  const register = useCallback((key: number, zone: DisplayZone) => {
    setEntries((current) => {
      const at = current.findIndex((entry) => entry.key === key);
      if (at === -1) return [...current, { key, zone }];
      const next = current.slice();
      next[at] = { key, zone };
      return next;
    });
  }, []);

  const unregister = useCallback((key: number) => {
    setEntries((current) => current.filter((entry) => entry.key !== key));
  }, []);

  const zone = entries.at(-1)?.zone ?? null;

  const value = useMemo(
    () => ({ zone, register, unregister }),
    [zone, register, unregister],
  );

  return (
    <DisplayZoneContext.Provider value={value}>
      {children}
    </DisplayZoneContext.Provider>
  );
}

/**
 * Publish the zone this surface is reading times in, for as long as it is
 * mounted. Called by every screen and dialog that shows a time.
 *
 * Registered on the zone's name alone: the flip callback is read through
 * a ref, so a caller that builds its zone inline — as every one of them
 * does — cannot restart this effect on every render and set the provider
 * from inside its own update.
 */
export function useDisplayZone(zone: DisplayZone | null) {
  const context = useContext(DisplayZoneContext);
  const register = context?.register;
  const unregister = context?.unregister;

  const flip = useRef(zone?.onFlip);
  flip.current = zone?.onFlip;

  // One key per caller, made once. It is this surface's identity in the
  // stack, not a fresh registration every time the zone is rebuilt —
  // which is every render, because every caller builds its zone inline.
  const key = useRef(0);
  if (key.current === 0) key.current = ++nextKey;

  const abbr = zone?.abbr ?? null;
  const label = zone?.label ?? null;
  const canFlip = zone?.canFlip ?? false;

  useEffect(() => {
    if (!register || !unregister || !abbr || !label) return;
    const mine = key.current;
    register(mine, {
      abbr,
      label,
      canFlip,
      onFlip: () => flip.current?.(),
    });
    return () => unregister(mine);
  }, [register, unregister, abbr, label, canFlip]);
}

/**
 * The zone for a trip, off the clock the member chose for it. One line at
 * every call site, and the words match the settings row that owns the
 * setting.
 *
 * Whether there is anything to flip is answered here rather than in the
 * chrome, because this is the only place that knows both clocks: the
 * trip's, and the device's standing in for the other one.
 */
export function zoneFor(
  trip: { id: string; preferredTimezone: string },
  clock: Clock,
  update: (tripId: string, patch: { clock: Clock }) => void,
): DisplayZone {
  const tripAbbr = zoneAbbr(trip.preferredTimezone);
  const deviceAbbr = zoneAbbr(null);
  // An abbreviation is not enough to say the two clocks agree: zones share
  // them (CST is three of the world's clocks) and differ by an hour. The
  // offset at this moment is the rest of the question.
  const moment = new Date().toISOString();
  const canFlip =
    tripAbbr !== deviceAbbr ||
    zoneOffsetMinutes(trip.preferredTimezone, moment) !==
      zoneOffsetMinutes(null, moment);

  return {
    abbr: clock === "trip" ? tripAbbr : deviceAbbr,
    label: clock === "trip" ? "Trip time" : "Your time",
    canFlip,
    onFlip: () =>
      update(trip.id, { clock: clock === "trip" ? "device" : "trip" }),
  };
}

/** What the chrome should render, or null when nothing is in context. */
export function useZoneToken(): DisplayZone | null {
  return useContext(DisplayZoneContext)?.zone ?? null;
}
