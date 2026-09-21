import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { EventDialog } from "@/components/trip/EventDialog";
import {
  buildEvent,
  draftFromEvent,
  validateNewEvent,
} from "@/lib/newEvent";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { useEvents } from "@/lib/eventsStore";
import { useDismiss } from "@/hooks/useDismiss";
import { placePhoto } from "@/mocks/events";

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
    <TripGate label="Edit event">
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
    return (
      <FullscreenDialog title="Edit event" dismissHref="/trips">
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
      title="Edit event"
      primaryTitle="Save changes"
      trip={trip}
      dismissHref={`/trips/events/detail?id=${trip.id}&event=${event.id}`}
      initial={initial}
      onDelete={() => {
        deleteEvent(trip.id, event.id);
        router.replace(tripHref);
      }}
      onSubmit={(input) => {
        if (Object.keys(validateNewEvent(input)).length > 0) return;

        // Rebuilt rather than patched: the form sets every field the
        // event has, so what it returns is the event.
        const next = buildEvent(
          input,
          event.id,
          timeZone,
          event.place === input.place
            ? event.image
            : placePhoto(input.place),
        );
        updateEvent(trip.id, event.id, next);
        dismiss();
      }}
    />
  );
}
