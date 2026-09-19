import type { Trip } from "@/components/trip/TripCard";
import { formatDateRange } from "@/lib/dateRange";

export type NewTripInput = {
  title: string;
  location: string;
  startDate: string;
  endDate: string;
};

export type NewTripErrors = Partial<Record<keyof NewTripInput, string>>;

/** Real calendar date, not just the right shape — Feb 30 is rejected. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Field-level errors for the create-trip form. Pure, so the dialog stays
 * a thin shell over it and the rules are unit tested.
 */
export function validateNewTrip(input: NewTripInput): NewTripErrors {
  const errors: NewTripErrors = {};

  if (!input.title.trim()) errors.title = "Give the trip a name.";
  if (!input.location.trim()) errors.location = "Where are you going?";

  if (!isIsoDate(input.startDate)) {
    errors.startDate = "Pick the first day.";
  }
  if (!isIsoDate(input.endDate)) {
    errors.endDate = "Pick the last day.";
  } else if (
    isIsoDate(input.startDate) &&
    input.endDate < input.startDate
  ) {
    errors.endDate = "The trip ends before it starts.";
  }

  return errors;
}

export function buildTrip(input: NewTripInput, id: string): Trip {
  return {
    id,
    title: input.title.trim(),
    location: input.location.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    image: `https://picsum.photos/seed/${encodeURIComponent(id)}/900/600`,
    going: 1,
  };
}

/** One-line summary used to confirm a new trip on the list. */
export function describeTrip(trip: Trip): string {
  return `${trip.title} · ${formatDateRange(trip.startDate, trip.endDate)}`;
}
