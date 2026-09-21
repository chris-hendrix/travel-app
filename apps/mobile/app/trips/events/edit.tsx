import { useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { EventDialog } from "@/components/trip/EventDialog";
import {
  buildEvent,
  draftFromEvent,
  validateNewEvent,
} from "@/lib/newEvent";
import { useTrip } from "@/lib/tripsStore";
import { useEvents as useEventsSection } from "@/lib/queries/events";
import { toErrorCopy } from "@/lib/queries/errors";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { useEvents } from "@/lib/eventsStore";
import { useDismiss } from "@/hooks/useDismiss";
import { placeholderPhoto } from "@/lib/placeholder";

/**
 * Edit event — the same form as Add event, prefilled and one verb
 * changed, because an edit is an add you have already made. It is also
 * where an event is deleted from: the form is already the place you are
 * deciding what this event is, and the detail behind it has one action
 * and should keep it.
 *
 * Organizer-only, and held to that by where it is reached from: the
 * event detail only offers the way in on its organizer variant. The API
 * is the real gate; this is the screen not pretending otherwise.
 */
export default function EditEvent() {
  return (
    <TripGate label="Loading event to edit">
      <EditEventScreen />
    </TripGate>
  );
}

function EditEventScreen() {
  const { id, event: eventId } = useLocalSearchParams<{
    id?: string;
    event?: string;
  }>();
  const { for: settingsFor, update } = useTripSettings();
  const { eventById, updateEvent, deleteEvent } = useEvents();
  const dismiss = useDismiss("/trips");
  const router = useRouter();
  // The last save's or delete's failure, fed to the dialog's
  // InlineError. The dialog stays open on failure.
  const [serverError, setServerError] = useState<string | null>(null);

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  // Warms the section query the store reads from, so a cold load
  // (deep link straight here) still finds the event once it lands.
  const { status: sectionStatus } = useEventsSection(trip?.id);
  // The zone the fields mean: the trip's own clock setting, so what is
  // typed is stamped in the zone it will be read in.
  const { clock } = trip
    ? settingsFor(trip, new Date())
    : { clock: "trip" as const };
  const timeZone = clock === "trip" ? trip?.preferredTimezone ?? null : null;
  // A form sets times on the same clock the screen behind it reads them
  // on, so the zone it is writing in is the zone the chrome names.
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);
  const event = trip
    ? eventById(trip, typeof eventId === "string" ? eventId : undefined)
    : undefined;

  // Deleting leaves nothing to go back to, so the trip is where it ends
  // — replacing, not dismissing, because dismissing would land on the
  // event detail we just deleted.
  const tripHref = `/trips/detail?id=${trip?.id ?? ""}`;

  if (!trip) {
    return <NotFound />;
  }

  if (!event) {
    // While the section loads the event may simply not have arrived
    // yet: only the landed read gets to say it is gone.
    if (sectionStatus === "loading") {
      return (
        <FullscreenDialog title="Loading event to edit" dismissHref="/trips">
          <LoadingBlock label="Loading event details" />
        </FullscreenDialog>
      );
    }
    return (
      <FullscreenDialog title="Loading event to edit" dismissHref="/trips">
        <Text className="font-body text-base text-ink">
          That event is not on this trip any more.
        </Text>
      </FullscreenDialog>
    );
  }

  // What the form opens with: the event as it stands, in wall-clock
  // terms, because that is what the fields ask for.
  const initial = draftFromEvent(event, trip.preferredTimezone);

  return (
    <EventDialog
      title="Loading event to edit"
      primaryTitle="Save changes"
      trip={trip}
      dismissHref={`/trips/events/detail?id=${trip.id}&event=${event.id}`}
      initial={initial}
      serverError={serverError}
      onDelete={() => {
        // Deleting is soft with no confirmation; a failed delete
        // stays on the form with the failure instead of leaving.
        setServerError(null);
        void deleteEvent(trip.id, event.id).then(
          () => router.replace(tripHref),
          (error: unknown) =>
            setServerError(
              toErrorCopy(error).message ?? "Couldn't delete the event.",
            ),
        );
      }}
      onSubmit={(input) => {
        if (Object.keys(validateNewEvent(input)).length > 0) return;

        // Rebuilt rather than patched: the form sets every field the
        // event has, so what it returns is the event. The rebuilt
        // row is the optimistic paint the store swaps the server
        // event in by.
        const next = buildEvent(
          input,
          event.id,
          timeZone,
          event.place === input.place
            ? event.image
            : placeholderPhoto(input.place),
        );
        setServerError(null);
        void updateEvent(trip.id, event.id, next).then(
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
