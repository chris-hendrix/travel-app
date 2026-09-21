import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Trip } from "@/components/trip/TripCard";
import { staysInOrder, type Stay } from "@/lib/stays";
import { staysFor } from "@/mocks/stays";

type StaysValue = {
  addStay: (tripId: string, stay: Stay) => void;
  updateStay: (
    tripId: string,
    stayId: string,
    patch: Partial<Stay>,
  ) => void;
  /** Soft delete, the API's own: the row stays, dated, for Deleted items. */
  deleteStay: (tripId: string, stayId: string) => void;
  /** One stay, as the run would show it. */
  stayById: (trip: Trip, stayId: string | undefined) => Stay | undefined;
  /** The mocks plus everything the organizer authored, earliest first. */
  staysForTrip: (trip: Trip) => Stay[];
};

const StaysContext = createContext<StaysValue | null>(null);

/** An edit merges into the slot so a soft delete survives it. */
export function mergeStayEdit(
  existing: Partial<Stay> | undefined,
  patch: Partial<Stay>,
): Partial<Stay> {
  return { ...existing, ...patch };
}

/** A soft delete merges into the slot so an earlier edit survives it. */
export function mergeStayDelete(
  existing: Partial<Stay> | undefined,
  deletedAt: string,
): Partial<Stay> {
  return { ...existing, deletedAt };
}

/**
 * Authored and edited stays, in memory — the same two layers the events
 * keep, for the same reason: a new stay is appended, an edit is
 * remembered against an id, and that is what lets a mock stay be edited
 * without the pool knowing about it.
 *
 * A trip can hold more than one, which is the case the run has to be
 * built for: hut to hut is five roofs, and a fortnight in two towns is
 * two.
 */
export function StaysProvider({ children }: { children: ReactNode }) {
  const [authored, setAuthored] = useState<Record<string, Stay[]>>({});
  const [edits, setEdits] = useState<
    Record<string, Record<string, Partial<Stay>>>
  >({});

  const addStay = useCallback((tripId: string, stay: Stay) => {
    setAuthored((current) => ({
      ...current,
      [tripId]: [...(current[tripId] ?? []), stay],
    }));
  }, []);

  const updateStay = useCallback(
    (tripId: string, stayId: string, patch: Partial<Stay>) => {
      setEdits((current) => ({
        ...current,
        [tripId]: {
          ...(current[tripId] ?? {}),
          [stayId]: mergeStayEdit(current[tripId]?.[stayId], patch),
        },
      }));
    },
    [],
  );

  const staysForTrip = useCallback(
    (trip: Trip): Stay[] =>
      staysInOrder(
        [...staysFor(trip), ...(authored[trip.id] ?? [])]
          .map((stay) =>
            edits[trip.id]?.[stay.id]
              ? { ...stay, ...edits[trip.id]![stay.id] }
              : stay,
          )
          .filter((stay) => !stay.deletedAt),
      ),
    [authored, edits],
  );

  const deleteStay = useCallback((tripId: string, stayId: string) => {
    // By edit rather than by removal: the mock pool has no memory of
    // what was taken out of it, and Deleted items will want the row.
    setEdits((current) => ({
      ...current,
      [tripId]: {
        ...(current[tripId] ?? {}),
        [stayId]: mergeStayDelete(
          current[tripId]?.[stayId],
          new Date().toISOString(),
        ),
      },
    }));
  }, []);

  const stayById = useCallback(
    (trip: Trip, stayId: string | undefined) => {
      if (!stayId) return undefined;
      return staysForTrip(trip).find((stay) => stay.id === stayId);
    },
    [staysForTrip],
  );

  const value = useMemo(
    () => ({ addStay, updateStay, deleteStay, stayById, staysForTrip }),
    [addStay, updateStay, deleteStay, stayById, staysForTrip],
  );

  return (
    <StaysContext.Provider value={value}>{children}</StaysContext.Provider>
  );
}

export function useStays(): StaysValue {
  const value = useContext(StaysContext);
  if (!value) throw new Error("useStays must be used inside StaysProvider");
  return value;
}
