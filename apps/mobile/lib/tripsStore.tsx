import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Trip } from "@/components/trip/TripCard";
import { TRIPS } from "@/mocks/trips";

type TripsValue = {
  trips: Trip[];
  addTrip: (trip: Trip) => void;
  updateTrip: (id: string, patch: Partial<Trip>) => void;
};

const TripsContext = createContext<TripsValue | null>(null);

/**
 * In-memory trips. Stands in for the API so the create flow is real
 * end to end — same call sites will hit the server later.
 */
export function TripsProvider({
  children,
  initial = TRIPS,
}: {
  children: ReactNode;
  initial?: Trip[];
}) {
  const [trips, setTrips] = useState<Trip[]>(initial);

  const addTrip = useCallback((trip: Trip) => {
    setTrips((current) => [trip, ...current]);
  }, []);

  const updateTrip = useCallback((id: string, patch: Partial<Trip>) => {
    setTrips((current) =>
      current.map((trip) => (trip.id === id ? { ...trip, ...patch } : trip)),
    );
  }, []);

  const value = useMemo(
    () => ({ trips, addTrip, updateTrip }),
    [trips, addTrip, updateTrip],
  );

  return (
    <TripsContext.Provider value={value}>{children}</TripsContext.Provider>
  );
}

export function useTrips(): TripsValue {
  const value = useContext(TripsContext);
  if (!value) throw new Error("useTrips must be used inside TripsProvider");
  return value;
}
