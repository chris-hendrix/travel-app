import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Trip } from "@/components/trip/TripCard";
import { travelFor, type MockTravel } from "@/mocks/travel";

type TravelValue = {
  addTravel: (tripId: string, record: MockTravel) => void;
  updateTravel: (
    tripId: string,
    travelId: string,
    patch: Partial<MockTravel>,
  ) => void;
  /** Soft delete, the API's own: the row stays, dated, for Deleted items. */
  deleteTravel: (tripId: string, travelId: string) => void;
  /** One record, as the board would show it. */
  travelById: (
    trip: Trip,
    travelId: string | undefined,
  ) => MockTravel | undefined;
  /** The mocks plus everything authored, unsorted — the board sorts. */
  travelForTrip: (trip: Trip) => MockTravel[];
};

const TravelContext = createContext<TravelValue | null>(null);

/** An edit merges into the slot so a soft delete survives it. */
export function mergeTravelEdit(
  existing: Partial<MockTravel> | undefined,
  patch: Partial<MockTravel>,
): Partial<MockTravel> {
  return { ...existing, ...patch };
}

/** A soft delete merges into the slot so an earlier edit survives it. */
export function mergeTravelDelete(
  existing: Partial<MockTravel> | undefined,
  deletedAt: string,
): Partial<MockTravel> {
  return { ...existing, deletedAt };
}

/**
 * Authored and edited travel, in memory. Stands in for the API so
 * adding and editing are real end to end — the same call sites will hit
 * the server later.
 *
 * Two layers over the mock pool, the way events does it: a new record
 * is appended, an edit is remembered against an id. Keeping edits out
 * of the list is what lets any row be edited, mock or authored,
 * without the pool knowing about it.
 */
export function TravelProvider({ children }: { children: ReactNode }) {
  const [authored, setAuthored] = useState<Record<string, MockTravel[]>>({});
  const [edits, setEdits] = useState<
    Record<string, Record<string, Partial<MockTravel>>>
  >({});

  const addTravel = useCallback((tripId: string, record: MockTravel) => {
    setAuthored((current) => ({
      ...current,
      [tripId]: [...(current[tripId] ?? []), record],
    }));
  }, []);

  const updateTravel = useCallback(
    (tripId: string, travelId: string, patch: Partial<MockTravel>) => {
      setEdits((current) => ({
        ...current,
        [tripId]: {
          ...(current[tripId] ?? {}),
          [travelId]: mergeTravelEdit(current[tripId]?.[travelId], patch),
        },
      }));
    },
    [],
  );

  const travelForTrip = useCallback(
    (trip: Trip): MockTravel[] => {
      const pool = [...travelFor(trip), ...(authored[trip.id] ?? [])];
      const tripEdits = edits[trip.id] ?? {};
      return pool
        .map((record) =>
          tripEdits[record.id]
            ? { ...record, ...tripEdits[record.id] }
            : record,
        )
        .filter((record) => !record.deletedAt);
    },
    [authored, edits],
  );

  const deleteTravel = useCallback(
    (tripId: string, travelId: string) => {
      // By edit rather than by removal, so Deleted items can bring it
      // back — the same soft delete events already use.
      setEdits((current) => ({
        ...current,
        [tripId]: {
          ...(current[tripId] ?? {}),
          [travelId]: mergeTravelDelete(
            current[tripId]?.[travelId],
            new Date().toISOString(),
          ),
        },
      }));
    },
    [],
  );

  const travelById = useCallback(
    (trip: Trip, travelId: string | undefined) => {
      if (!travelId) return undefined;
      return travelForTrip(trip).find((record) => record.id === travelId);
    },
    [travelForTrip],
  );

  const value = useMemo(
    () => ({ addTravel, updateTravel, deleteTravel, travelById, travelForTrip }),
    [addTravel, updateTravel, deleteTravel, travelById, travelForTrip],
  );

  return (
    <TravelContext.Provider value={value}>{children}</TravelContext.Provider>
  );
}

export function useTravel(): TravelValue {
  const value = useContext(TravelContext);
  if (!value) throw new Error("useTravel must be used inside TravelProvider");
  return value;
}
