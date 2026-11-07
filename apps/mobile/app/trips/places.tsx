import { useLocalSearchParams, useRouter } from "expo-router";

import NotFound from "@/app/+not-found";
import { SavedPlaces } from "@/components/trip/SavedPlaces";
import { TripGate } from "@/components/trip/TripGate";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { useTrip } from "@/lib/tripsStore";

/**
 * Places — the trip's saved places, behind the hero's door.
 *
 * A dialog rather than a screen, because the library is a utility and
 * not a browse surface: it answers one question about the trip you are
 * already looking at, the way the ledger and the travel board do. The
 * body is `SavedPlaces`; this file is the trip it belongs to, the
 * sheet's title, and the one verb.
 *
 * A row press is a route change rather than a panel, so the dialog
 * holds one shape of each place instead of two: the record behind it
 * is a dialog of its own at `/trips/places/detail`, and authoring
 * happens in the form the bar's Add place reaches.
 */
export default function TripPlaces() {
  return (
    <TripGate label="Getting the places">
      <TripPlacesDialog />
    </TripGate>
  );
}

function TripPlacesDialog() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);

  if (!trip) {
    return <NotFound />;
  }

  return (
    <FullscreenDialog
      title="Places"
      primaryTitle="Add place"
      onPrimary={() => router.push(`/trips/places/form?id=${trip.id}`)}
      dismissHref={`/trips/detail?id=${trip.id}`}
    >
      <SavedPlaces
        tripId={trip.id}
        onSelectPlace={(place) =>
          router.push(`/trips/places/detail?id=${trip.id}&place=${place.id}`)
        }
      />
    </FullscreenDialog>
  );
}
