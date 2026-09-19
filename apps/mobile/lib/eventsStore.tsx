import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Trip } from "@/components/trip/TripCard";
import type { ItineraryEvent } from "@/lib/itinerary";
import { eventsFor } from "@/mocks/events";

type EventsValue = {
  addEvent: (tripId: string, event: ItineraryEvent) => void;
  /** The mocks plus everything the organizer authored, earliest first. */
  eventsForTrip: (trip: Trip) => ItineraryEvent[];
};

const EventsContext = createContext<EventsValue | null>(null);

/**
 * Authored events, in memory. Stands in for the API so adding an event
 * is real end to end — the same call sites will hit the server later.
 * The mock pool stays untouched underneath; the merge is by trip id.
 */
export function EventsProvider({ children }: { children: ReactNode }) {
  const [custom, setCustom] = useState<Record<string, ItineraryEvent[]>>({});

  const addEvent = useCallback((tripId: string, event: ItineraryEvent) => {
    setCustom((current) => ({
      ...current,
      [tripId]: [...(current[tripId] ?? []), event],
    }));
  }, []);

  const eventsForTrip = useCallback(
    (trip: Trip): ItineraryEvent[] => {
      return [...eventsFor(trip), ...(custom[trip.id] ?? [])].sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      );
    },
    [custom],
  );

  const value = useMemo(() => ({ addEvent, eventsForTrip }), [addEvent, eventsForTrip]);

  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  );
}

export function useEvents(): EventsValue {
  const value = useContext(EventsContext);
  if (!value) throw new Error("useEvents must be used inside EventsProvider");
  return value;
}
