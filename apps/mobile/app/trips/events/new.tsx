import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { EventDialog } from "@/components/trip/EventDialog";
import { buildEvent } from "@/lib/newEvent";
import { toErrorCopy } from "@/lib/queries/errors";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { useEvents } from "@/lib/eventsStore";
import { useDismiss } from "@/hooks/useDismiss";
import { placeholderPhoto } from "@/lib/placeholder";

/**
 * Add event — the organizer's way onto the itinerary. Every question it
 * asks lives in EventDialog; this is the trip it belongs to, and where
 * the answer goes.
 */
export default function NewEvent() {
  return (
    <TripGate label="Loading new event">
      <NewEventScreen />
    </TripGate>
  );
}

function NewEventScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { for: settingsFor, update } = useTripSettings();
  const { addEvent } = useEvents();
  const dismiss = useDismiss("/trips");
  // The last save's failure, fed to the dialog's InlineError. The
  // dialog stays open on failure: dismissing would pretend it saved.
  const [serverError, setServerError] = useState<string | null>(null);

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  // The zone the fields mean: the trip's own clock setting, so what is
  // typed is stamped in the zone it will be read in.
  const { clock } = trip
    ? settingsFor(trip, new Date())
    : { clock: "trip" as const };
  const timeZone = clock === "trip" ? trip?.preferredTimezone ?? null : null;
  // A form sets times on the same clock the screen behind it reads them
  // on, so the zone it is writing in is the zone the chrome names.
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);

  if (!trip) {
    return <NotFound />;
  }

  return (
    <EventDialog
      title="Add event"
      primaryTitle="Add event"
      trip={trip}
      dismissHref={`/trips/detail?id=${trip.id}`}
      serverError={serverError}
      onSubmit={(input) => {
        const event = buildEvent(
          input,
          `custom-${Date.now()}`,
          timeZone,
          placeholderPhoto(input.place),
        );
        // The built event is the optimistic row (its custom id is
        // the stand-in the store swaps the server event in by).
        setServerError(null);
        void addEvent(trip.id, event).then(
          () => dismiss(),
          (error: unknown) =>
            setServerError(
              toErrorCopy(error).message ?? "Couldn't save the event.",
            ),
        );
      }}
    />
  );
}
