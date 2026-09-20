import { Suspense } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { StayDialog } from "@/components/trip/StayDialog";
import { buildStay, draftFromStay } from "@/lib/newStay";
import { useTrips } from "@/lib/tripsStore";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { useStays } from "@/lib/staysStore";
import { useDismiss } from "@/hooks/useDismiss";
import { placePhoto } from "@/mocks/events";

/**
 * Edit stay — the same form as Add stay, prefilled and one verb changed.
 * It is also where a stay is deleted from, for the same reason the event
 * form is: the form is already the place you are deciding what this
 * place is, and the sheet behind it has one action and should keep it.
 *
 * The links are carried through rather than asked for again: they are a
 * listing and a set of house rules, which are pasted once when the stay
 * is made.
 */
export default function EditStay() {
  return (
    <Suspense fallback={null}>
      <EditStayScreen />
    </Suspense>
  );
}

function EditStayScreen() {
  const { id, stay: stayId } = useLocalSearchParams<{
    id?: string;
    stay?: string;
  }>();
  const { trips } = useTrips();
  const { for: settingsFor, update } = useTripSettings();
  const { stayById, updateStay, deleteStay } = useStays();
  const dismiss = useDismiss("/trips");
  const router = useRouter();

  const tripId = typeof id === "string" ? id : undefined;
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];
  const { clock } = trip
    ? settingsFor(trip, new Date())
    : { clock: "trip" as const };
  const timeZone = clock === "trip" ? (trip?.preferredTimezone ?? null) : null;
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);
  const stay = trip
    ? stayById(trip, typeof stayId === "string" ? stayId : undefined)
    : undefined;

  // Deleting leaves nothing to go back to, so the trip is where it ends
  // — replacing, not dismissing, because dismissing would land on the
  // sheet we just deleted.
  const tripHref = `/trips/detail?id=${trip?.id ?? ""}`;

  if (!trip || !stay) {
    return (
      <FullscreenDialog title="Edit stay" dismissHref="/trips">
        <Text className="font-body text-base text-ink">
          That stay is not on this trip any more.
        </Text>
      </FullscreenDialog>
    );
  }

  return (
    <StayDialog
      title="Edit stay"
      primaryTitle="Save changes"
      trip={trip}
      dismissHref={`/trips/stay/detail?id=${trip.id}&stay=${stay.id}`}
      initial={draftFromStay(stay, timeZone)}
      onDelete={() => {
        deleteStay(trip.id, stay.id);
        router.replace(tripHref);
      }}
      onSubmit={(input) => {
        // Rebuilt rather than patched: the form sets every field the
        // stay has, and the two it does not ask for come along.
        const next = buildStay(
          input,
          stay.id,
          timeZone,
          stay.address === input.address
            ? stay.image
            : placePhoto(input.name),
          stay.links,
        );
        updateStay(trip.id, stay.id, next);
        dismiss();
      }}
    />
  );
}
