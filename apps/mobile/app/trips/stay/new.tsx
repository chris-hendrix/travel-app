import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { StayDialog } from "@/components/trip/StayDialog";
import { buildStay } from "@/lib/newStay";
import { toErrorCopy } from "@/lib/queries/errors";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { useStays } from "@/lib/staysStore";
import { useDismiss } from "@/hooks/useDismiss";
import { placeholderPhoto } from "@/lib/placeholder";

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
    <TripGate label="Loading new stay">
      <NewStayScreen />
    </TripGate>
  );
}

function NewStayScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { for: settingsFor, update } = useTripSettings();
  const { addStay } = useStays();
  const dismiss = useDismiss("/trips");
  // The last save's failure, fed to the dialog's InlineError. The
  // dialog stays open on failure: dismissing would pretend it saved.
  const [serverError, setServerError] = useState<string | null>(null);
  // A write in flight. The dialog's buttons stop on it, so a second
  // press cannot make a second stay.
  const [saving, setSaving] = useState(false);

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);

  // The zone the fields mean: the trip's own clock setting, so what is
  // typed is stamped in the zone it will be read in — the same reason a
  // date is not a date until you know where.
  const { clock } = trip
    ? settingsFor(trip, new Date())
    : { clock: "trip" as const };
  const timeZone = clock === "trip" ? (trip?.preferredTimezone ?? null) : null;
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);

  if (!trip) {
    return <NotFound />;
  }

  return (
    <StayDialog
      title="Add stay"
      primaryTitle={saving ? "Adding stay" : "Add stay"}
      trip={trip}
      dismissHref={`/trips/detail?id=${trip.id}`}
      serverError={serverError}
      pending={saving}
      onSubmit={(input) => {
        const stay = buildStay(
          input,
          `custom-${Date.now()}`,
          timeZone,
          placeholderPhoto(input.name),
        );
        // The built stay is the optimistic row (its custom id is
        // the stand-in the store swaps the server stay in by).
        setServerError(null);
        setSaving(true);
        void addStay(trip.id, stay)
          .then(
            () => dismiss(),
            (error: unknown) =>
              setServerError(
                toErrorCopy(error).message ?? "Couldn't save the stay.",
              ),
          )
          .finally(() => setSaving(false));
      }}
    />
  );
}
