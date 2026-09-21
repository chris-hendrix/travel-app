import { useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StayDialog } from "@/components/trip/StayDialog";
import { useStays as useStaysSection } from "@/lib/queries/stays";
import { toErrorCopy } from "@/lib/queries/errors";
import { buildStay, draftFromStay } from "@/lib/newStay";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
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
    <TripGate label="Edit stay">
      <EditStayScreen />
    </TripGate>
  );
}

function EditStayScreen() {
  const { id, stay: stayId } = useLocalSearchParams<{
    id?: string;
    stay?: string;
  }>();
  const { for: settingsFor, update } = useTripSettings();
  const { stayById, updateStay, deleteStay } = useStays();
  const dismiss = useDismiss("/trips");
  const router = useRouter();
  // The last save's or delete's failure, fed to the dialog's
  // InlineError. The dialog stays open on failure.
  const [serverError, setServerError] = useState<string | null>(null);

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  // Warms the section query the store reads from, so a cold load
  // (deep link straight here) still finds the stay once it lands.
  const { status: sectionStatus } = useStaysSection(trip?.id);
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

  if (!trip) {
    return <NotFound />;
  }

  if (!stay) {
    // While the section loads the stay may simply not have arrived
    // yet: only the landed read gets to say it is gone.
    if (sectionStatus === "loading") {
      return (
        <FullscreenDialog title="Edit stay" dismissHref="/trips">
          <LoadingBlock label="Stay" />
        </FullscreenDialog>
      );
    }
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
      serverError={serverError}
      onDelete={() => {
        // Deleting is soft with no confirmation; a failed delete
        // stays on the form with the failure instead of leaving.
        setServerError(null);
        void deleteStay(trip.id, stay.id).then(
          () => router.replace(tripHref),
          (error: unknown) =>
            setServerError(
              toErrorCopy(error).message ?? "Couldn't delete the stay.",
            ),
        );
      }}
      onSubmit={(input) => {
        // Rebuilt rather than patched: the form sets every field the
        // stay has, and the two it does not ask for come along. The
        // rebuilt row is the optimistic paint the store swaps the
        // server stay in by.
        const next = buildStay(
          input,
          stay.id,
          timeZone,
          stay.address === input.address
            ? stay.image
            : placePhoto(input.name),
          stay.links,
        );
        setServerError(null);
        void updateStay(trip.id, stay.id, next).then(
          () => dismiss(),
          (error: unknown) =>
            setServerError(
              toErrorCopy(error).message ?? "Couldn't save the stay.",
            ),
        );
      }}
    />
  );
}
