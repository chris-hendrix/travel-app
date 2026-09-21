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
import { zoneAbbr } from "@/lib/timezone";
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
 * dialog is a route, not an overlay, so the screen behind it unmounts —
 * there is no ancestor left to inherit a zone from. The last surface to
 * register wins, and leaving clears it, so a stale zone cannot outlive
 * the screen that owned it.
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
  /** Flip to the other clock. Undefined when there is nothing to flip. */
  onFlip?: (() => void) | undefined;
};

type DisplayZoneValue = {
  zone: DisplayZone | null;
  register: (zone: DisplayZone) => void;
  unregister: () => void;
};

const DisplayZoneContext = createContext<DisplayZoneValue | null>(null);

export function DisplayZoneProvider({ children }: { children: ReactNode }) {
  const [zone, setZone] = useState<DisplayZone | null>(null);

  const register = useCallback((next: DisplayZone) => setZone(next), []);
  const unregister = useCallback(() => setZone(null), []);

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

  const abbr = zone?.abbr ?? null;
  const label = zone?.label ?? null;

  useEffect(() => {
    if (!register || !unregister || !abbr || !label) return;
    register({ abbr, label, onFlip: () => flip.current?.() });
    return () => unregister();
  }, [register, unregister, abbr, label]);
}

/**
 * The zone for a trip, off the clock the member chose for it. One line at
 * every call site, and the words match the settings row that owns the
 * setting.
 */
export function zoneFor(
  trip: { id: string; preferredTimezone: string },
  clock: Clock,
  update: (tripId: string, patch: { clock: Clock }) => void,
): DisplayZone {
  return {
    abbr: zoneAbbr(clock === "trip" ? trip.preferredTimezone : null),
    label: clock === "trip" ? "Trip time" : "Your time",
    onFlip: () =>
      update(trip.id, { clock: clock === "trip" ? "device" : "trip" }),
  };
}

/** What the chrome should render, or null when nothing is in context. */
export function useZoneToken(): DisplayZone | null {
  return useContext(DisplayZoneContext)?.zone ?? null;
}
