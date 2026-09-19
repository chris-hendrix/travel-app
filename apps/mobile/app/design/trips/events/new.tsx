import { Suspense } from "react";
import { Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { EventDialog } from "@/components/trip/EventDialog";
import { buildEvent } from "@/lib/newEvent";
import { useTrips } from "@/lib/tripsStore";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useEvents } from "@/lib/eventsStore";
import { useDismiss } from "@/hooks/useDismiss";
import { placePhoto } from "@/mocks/events";

/**
 * Add event — the organizer's way onto the itinerary. Every question it
 * asks lives in EventDialog; this is the trip it belongs to, and where
 * the answer goes.
 */
export default function NewEvent() {
  return (
    <Suspense fallback={null}>
      <NewEventScreen />
    </Suspense>
  );
}

function NewEventScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trips } = useTrips();
  const { for: settingsFor } = useTripSettings();
  const { addEvent } = useEvents();
  const dismiss = useDismiss("/design/trips");

  const tripId = typeof id === "string" ? id : undefined;
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];
  // The zone the fields mean: the trip's own clock setting, so what is
  // typed is stamped in the zone it will be read in.
  const { clock } = trip
    ? settingsFor(trip, new Date())
    : { clock: "trip" as const };
  const timeZone = clock === "trip" ? trip?.preferredTimezone ?? null : null;

  if (!trip) {
    return (
      <FullscreenDialog title="Add event" dismissHref="/design/trips">
        <Text className="font-body text-base text-ink">
          No trip to add to. Start one from the trips screen.
        </Text>
      </FullscreenDialog>
    );
  }

  return (
    <EventDialog
      title="Add event"
      primaryTitle="Add event"
      trip={trip}
      timeZone={timeZone}
      dismissHref={`/design/trips/detail?id=${trip.id}`}
      onSubmit={(input) => {
        const event = buildEvent(
          input,
          `custom-${Date.now()}`,
          timeZone,
          placePhoto(input.place),
        );
        addEvent(trip.id, event);
        dismiss();
      }}
    />
  );
}
