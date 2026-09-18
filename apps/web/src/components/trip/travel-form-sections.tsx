"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { parse } from "date-fns";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { FlightLookupInput } from "@/components/itinerary/flight-lookup-input";
import {
  useCreateMemberTravel,
  useUpdateMemberTravel,
} from "@/hooks/use-member-travel";
import { localPartsToUTC } from "@/lib/utils/timezone";
import { applyFlightLookup } from "@journiful/shared/utils";
import type {
  FlightLookupResult,
  MemberTravel,
} from "@journiful/shared/types";
import type { TripDetailWithMeta } from "@/hooks/trip-queries";

export interface TravelSaveSummary {
  arrivalTime?: string | undefined;
  arrivalLocation?: string | undefined;
  departureTime?: string | undefined;
  departureLocation?: string | undefined;
}

export interface TravelFormSectionsHandle {
  /** Saves sections that have a pertinent time; resolves null when skipped/empty. */
  save: () => Promise<TravelSaveSummary | null>;
}

interface TravelFormSectionsProps {
  tripId: string;
  trip: TripDetailWithMeta;
  timezone: string;
  existingArrival?: MemberTravel | null;
  existingDeparture?: MemberTravel | null;
}

interface SectionState {
  flightNumber: string;
  dateValue: string;
  locationValue: string;
  hiddenDepartureTime?: string | undefined;
  hiddenDepartureLocation?: string | undefined;
  hiddenArrivalTime?: string | undefined;
  hiddenArrivalLocation?: string | undefined;
}

function toISO(value: Date | string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString();
}

export const TravelFormSections = forwardRef<
  TravelFormSectionsHandle,
  TravelFormSectionsProps
>(function TravelFormSections(
  { tripId, trip, timezone, existingArrival, existingDeparture },
  ref,
) {
  const createTravel = useCreateMemberTravel();
  const updateTravel = useUpdateMemberTravel();

  const initialArrivalDate = trip.startDate
    ? localPartsToUTC(trip.startDate, "12:00", timezone)
    : "";
  const initialDepartureDate = trip.endDate
    ? localPartsToUTC(trip.endDate, "12:00", timezone)
    : "";

  const [arrival, setArrival] = useState<SectionState>({
    flightNumber: "",
    dateValue: existingArrival
      ? toISO(existingArrival.arrivalTime)
      : initialArrivalDate,
    locationValue: existingArrival?.arrivalLocation || "",
  });
  const [departure, setDeparture] = useState<SectionState>({
    flightNumber: "",
    dateValue: existingDeparture
      ? toISO(existingDeparture.departureTime)
      : initialDepartureDate,
    locationValue: existingDeparture?.departureLocation || "",
  });
  const [departureTouched, setDepartureTouched] = useState(
    !!existingDeparture?.departureLocation,
  );

  // Pre-fill departure location from arrival location until touched
  useEffect(() => {
    if (!departureTouched && arrival.locationValue) {
      setDeparture((prev) => ({ ...prev, locationValue: arrival.locationValue }));
    }
  }, [arrival.locationValue, departureTouched]);

  const arrivalLookupDate = trip.startDate || undefined;
  const departureLookupDate = trip.endDate || undefined;

  function handleArrivalFlightResult(
    result: FlightLookupResult,
    flightNumber: string,
  ) {
    const filled = applyFlightLookup("arrival", result, flightNumber);
    setArrival((prev) => ({
      ...prev,
      flightNumber,
      dateValue: filled.arrivalTime || prev.dateValue,
      locationValue: filled.arrivalLocation || prev.locationValue,
      hiddenDepartureTime: filled.departureTime,
      hiddenDepartureLocation: filled.departureLocation,
    }));
  }

  function handleDepartureFlightResult(
    result: FlightLookupResult,
    flightNumber: string,
  ) {
    const filled = applyFlightLookup("departure", result, flightNumber);
    setDeparture((prev) => ({
      ...prev,
      flightNumber,
      dateValue: filled.departureTime || prev.dateValue,
      locationValue: filled.departureLocation || prev.locationValue,
      hiddenArrivalTime: filled.arrivalTime,
      hiddenArrivalLocation: filled.arrivalLocation,
    }));
    setDepartureTouched(true);
  }

  const isPending = createTravel.isPending || updateTravel.isPending;

  async function persistSection(
    kind: "arrival" | "departure",
    section: SectionState,
    existing: MemberTravel | null | undefined,
  ): Promise<void> {
    if (!section.dateValue) return;
    const isArrival = kind === "arrival";
    const data = {
      travelType: kind,
      ...(isArrival
        ? {
            arrivalTime: section.dateValue,
            arrivalLocation: section.locationValue || undefined,
            ...(section.hiddenDepartureTime
              ? { departureTime: section.hiddenDepartureTime }
              : {}),
            ...(section.hiddenDepartureLocation
              ? { departureLocation: section.hiddenDepartureLocation }
              : {}),
          }
        : {
            departureTime: section.dateValue,
            departureLocation: section.locationValue || undefined,
            ...(section.hiddenArrivalTime
              ? { arrivalTime: section.hiddenArrivalTime }
              : {}),
            ...(section.hiddenArrivalLocation
              ? { arrivalLocation: section.hiddenArrivalLocation }
              : {}),
          }),
      ...(section.flightNumber ? { flightNumber: section.flightNumber } : {}),
    };
    if (existing) {
      await updateTravel.mutateAsync({
        memberTravelId: existing.id,
        data,
      });
    } else {
      await createTravel.mutateAsync({ tripId, data });
    }
  }

  useImperativeHandle(ref, () => ({
    async save() {
      // A section saves only if it has its pertinent time
      const summary: TravelSaveSummary = {};
      if (arrival.dateValue) {
        await persistSection("arrival", arrival, existingArrival);
        summary.arrivalTime = arrival.dateValue;
        summary.arrivalLocation = arrival.locationValue || undefined;
      }
      if (departure.dateValue) {
        await persistSection("departure", departure, existingDeparture);
        summary.departureTime = departure.dateValue;
        summary.departureLocation = departure.locationValue || undefined;
      }
      return summary;
    },
  }));

  const tripRange = useMemo(() => {
    if (!trip.startDate && !trip.endDate) return undefined;
    return { start: trip.startDate, end: trip.endDate };
  }, [trip.startDate, trip.endDate]);

  const tripStartMonth = useMemo(() => {
    if (!trip.startDate) return undefined;
    const parsed = parse(trip.startDate, "yyyy-MM-dd", new Date());
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }, [trip.startDate]);

  const tripEndMonth = useMemo(() => {
    if (!trip.endDate) return undefined;
    const parsed = parse(trip.endDate, "yyyy-MM-dd", new Date());
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }, [trip.endDate]);

  return (
    <div className="space-y-8">
      {/* Arriving section */}
      <section aria-label="Arriving">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
          Arriving
        </h3>
        <div className="space-y-4">
          <FlightLookupInput
            defaultDate={arrivalLookupDate}
            onResult={handleArrivalFlightResult}
            disabled={isPending}
          />
          <div className="space-y-2">
            <label className="text-sm font-medium">Date &amp; Time</label>
            <DateTimePicker
              value={arrival.dateValue}
              onChange={(v) => setArrival((prev) => ({ ...prev, dateValue: v }))}
              timezone={timezone}
              placeholder="Pick arrival date & time"
              aria-label="Arrival date and time"
              defaultMonth={tripStartMonth}
              tripRange={tripRange}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="arrival-location" className="text-sm font-medium">
              Location
            </label>
            <Input
              id="arrival-location"
              value={arrival.locationValue}
              onChange={(e) =>
                setArrival((prev) => ({
                  ...prev,
                  locationValue: e.target.value,
                }))
              }
              placeholder="e.g., JFK Airport"
              className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
            />
          </div>
        </div>
      </section>

      {/* Leaving section */}
      <section aria-label="Leaving">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
          Leaving
        </h3>
        <div className="space-y-4">
          <FlightLookupInput
            defaultDate={departureLookupDate}
            onResult={handleDepartureFlightResult}
            disabled={isPending}
          />
          <div className="space-y-2">
            <label className="text-sm font-medium">Date &amp; Time</label>
            <DateTimePicker
              value={departure.dateValue}
              onChange={(v) =>
                setDeparture((prev) => ({ ...prev, dateValue: v }))
              }
              timezone={timezone}
              placeholder="Pick departure date & time"
              aria-label="Departure date and time"
              defaultMonth={tripEndMonth}
              tripRange={tripRange}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="departure-location" className="text-sm font-medium">
              Location
            </label>
            <Input
              id="departure-location"
              value={departure.locationValue}
              onChange={(e) => {
                setDeparture((prev) => ({
                  ...prev,
                  locationValue: e.target.value,
                }));
                setDepartureTouched(true);
              }}
              placeholder="e.g., JFK Airport"
              className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md"
            />
          </div>
        </div>
      </section>
    </div>
  );
});
