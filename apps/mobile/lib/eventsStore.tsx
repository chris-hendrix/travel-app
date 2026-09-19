import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Trip } from "@/components/trip/TripCard";
import { liveEvents, withEdits, type ItineraryEvent } from "@/lib/itinerary";
import { eventsFor } from "@/mocks/events";

type EventsValue = {
  addEvent: (tripId: string, event: ItineraryEvent) => void;
  updateEvent: (
    tripId: string,
    eventId: string,
    patch: Partial<ItineraryEvent>,
  ) => void;
  /** Soft delete, the API's own: the row stays, dated, for Deleted items. */
  deleteEvent: (tripId: string, eventId: string) => void;
  /** One event, as the itinerary would show it. */
  eventById: (
    trip: Trip,
    eventId: string | undefined,
  ) => ItineraryEvent | undefined;
  /** The mocks plus everything the organizer authored, earliest first. */
  eventsForTrip: (trip: Trip) => ItineraryEvent[];
};

const EventsContext = createContext<EventsValue | null>(null);

/**
 * Authored and edited events, in memory. Stands in for the API so adding
 * and editing are real end to end — the same call sites will hit the
 * server later.
 *
 * Two layers over the mock pool, because the two are different things: a
 * new event is appended, an edit is remembered against an id. Keeping
 * edits out of the list is what lets any row be edited, mock or
 * authored, without the pool knowing about it.
 */
export function EventsProvider({ children }: { children: ReactNode }) {
  const [authored, setAuthored] = useState<Record<string, ItineraryEvent[]>>({});
  const [edits, setEdits] = useState<
    Record<string, Record<string, Partial<ItineraryEvent>>>
  >({});

  const addEvent = useCallback((tripId: string, event: ItineraryEvent) => {
    setAuthored((current) => ({
      ...current,
      [tripId]: [...(current[tripId] ?? []), event],
    }));
  }, []);

  const updateEvent = useCallback(
    (tripId: string, eventId: string, patch: Partial<ItineraryEvent>) => {
      setEdits((current) => ({
        ...current,
        [tripId]: { ...(current[tripId] ?? {}), [eventId]: patch },
      }));
    },
    [],
  );

  const eventsForTrip = useCallback(
    (trip: Trip): ItineraryEvent[] =>
      liveEvents(
        withEdits(
          [...eventsFor(trip), ...(authored[trip.id] ?? [])],
          edits[trip.id] ?? {},
        ),
      ),
    [authored, edits],
  );

  const deleteEvent = useCallback(
    (tripId: string, eventId: string) => {
      // By edit rather than by removal: the mock pool has no memory of
      // what was taken out of it, and Deleted items will want the row.
      setEdits((current) => ({
        ...current,
        [tripId]: {
          ...(current[tripId] ?? {}),
          [eventId]: { deletedAt: new Date().toISOString() },
        },
      }));
    },
    [],
  );

  const eventById = useCallback(
    (trip: Trip, eventId: string | undefined) => {
      if (!eventId) return undefined;
      return eventsForTrip(trip).find((event) => event.id === eventId);
    },
    [eventsForTrip],
  );

  const value = useMemo(
    () => ({ addEvent, updateEvent, deleteEvent, eventById, eventsForTrip }),
    [addEvent, updateEvent, deleteEvent, eventById, eventsForTrip],
  );

  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  );
}

export function useEvents(): EventsValue {
  const value = useContext(EventsContext);
  if (!value) throw new Error("useEvents must be used inside EventsProvider");
  return value;
}
