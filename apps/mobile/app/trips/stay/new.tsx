import { Suspense } from "react";
import { Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { StayDialog } from "@/components/trip/StayDialog";
import { buildStay } from "@/lib/newStay";
import { useTrips } from "@/lib/tripsStore";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { useStays } from "@/lib/staysStore";
import { useDismiss } from "@/hooks/useDismiss";
import { placePhoto } from "@/mocks/events";

/**
 * Add stay — the organizer's way onto the run's opening row. Every
 * question it asks lives in StayDialog; this is the trip it belongs to,
 * and where the answer goes.
 *
 * Organizer-only, held to that by where it is reached from: the
 * itinerary only offers the way in on its organizer variant. The API is
 * the real gate; this is the screen not pretending otherwise.
 */
export default function NewStay() {
  return (
    <Suspense fallback={null}>
      <NewStayScreen />
    </Suspense>
  );
}

function NewStayScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trips } = useTrips();
  const { for: settingsFor, update } = useTripSettings();
  const { addStay } = useStays();
  const dismiss = useDismiss("/trips");

  const tripId = typeof id === "string" ? id : undefined;
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];

  // The zone the fields mean: the trip's own clock setting, so what is
  // typed is stamped in the zone it will be read in — the same reason a
  // date is not a date until you know where.
  const { clock } = trip
    ? settingsFor(trip, new Date())
    : { clock: "trip" as const };
  const timeZone = clock === "trip" ? (trip?.preferredTimezone ?? null) : null;
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);

  if (!trip) {
    return (
      <FullscreenDialog title="Add stay" dismissHref="/trips">
        <Text className="font-body text-base text-ink">
          No trip to add to. Start one from the trips screen.
        </Text>
      </FullscreenDialog>
    );
  }

  return (
    <StayDialog
      title="Add stay"
      primaryTitle="Add stay"
      trip={trip}
      dismissHref={`/trips/detail?id=${trip.id}`}
      onSubmit={(input) => {
        const stay = buildStay(
          input,
          `stay-${Date.now()}`,
          timeZone,
          placePhoto(input.name),
        );
        addStay(trip.id, stay);
        dismiss();
      }}
    />
  );
}
