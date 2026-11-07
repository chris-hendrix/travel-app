import { useState } from "react";
import { Text, View } from "react-native";

import { PlaceCard } from "@/components/trip/PlaceCard";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { Grid } from "@/components/ui/Grid";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { useAuth } from "@/lib/authStore";
import { EVENT_TYPE_LABEL } from "@/lib/itinerary";
import { useSavedPlaces } from "@/lib/queries/savedPlaces";
import type { SavedPlace } from "@/lib/saved-places";
import {
  EMPTY_SAVED_PLACES_FILTERS,
  hasAnyPinned,
  matchesFilters,
  orderedPlaces,
  typeChipsFor,
  type SavedPlacesFilters,
} from "@/lib/savedPlaces";

/**
 * The trip's saved places: the filter rows and the grid of cards.
 *
 * The SettleLedger split: this owns the read (`useSavedPlaces`) and the
 * filter state, so the caller hands over the trip and the card's door
 * (`onSelectPlace`) and nothing else. The viewer comes from the session
 * (`useAuth().user.id`, a **user** id — the same space `PlaceCard`
 * compares `createdBy` against), the way the settle screen reads its
 * viewer off the session rather than a query param.
 *
 * Two filter rows, in that order. The first is the one exclusive
 * choice — the type — so it says `radiogroup` and each chip says
 * `radio` (the TravelDialog precedent): `All` plus one chip per type
 * present, in canonical event-type order. The second row is two
 * independent toggles (`Pinned`, `Yours`) with the default button role.
 * The chips derive from the WHOLE list, never the filtered one
 * (`typeChipsFor(allPlaces)`), so a chip can never vanish under the
 * filter that chose it; the `Pinned` chip renders only when something
 * is pinned (`hasAnyPinned`), `Yours` always does.
 *
 * The three failure states are blocks of their own — the SettleLedger
 * bargain — never a blank sheet. Two empties: a library with nothing
 * in it invites the reader to the Add button, while a filtered list
 * that empties says why it is empty.
 */
export function SavedPlaces({
  tripId,
  onSelectPlace,
}: {
  tripId: string;
  /** The card's door; navigation lands in a later task. */
  onSelectPlace: (place: SavedPlace) => void;
}) {
  const { places, status, retry } = useSavedPlaces(tripId);
  const { user } = useAuth();
  const viewerUserId = user?.id ?? "";
  const [filters, setFilters] = useState<SavedPlacesFilters>(
    EMPTY_SAVED_PLACES_FILTERS,
  );

  if (status === "loading") {
    return <LoadingBlock label="Getting the saved places" />;
  }
  if (status === "offline") {
    return <OfflineBlock onRetry={retry} />;
  }
  if (status === "error") {
    return (
      <InlineError
        message="Couldn't load the saved places"
        onRetry={retry}
      />
    );
  }

  const chips = typeChipsFor(places);
  const selectedType = filters.type ?? "All";
  const visible = orderedPlaces(
    places.filter((place) => matchesFilters(place, filters, viewerUserId)),
  );

  return (
    <View className="gap-6">
      {/* The filters: the exclusive type choice, then the two
          independent toggles. Both rows wrap — ten chips at most — so
          nothing clips at 390. */}
      <View className="gap-2">
        <View
          className="flex-row flex-wrap gap-2"
          role="radiogroup"
          aria-label="Type of place"
        >
          {chips.map((chip) => (
            <ChipToggle
              key={chip}
              role="radio"
              label={chip === "All" ? "All" : EVENT_TYPE_LABEL[chip]}
              selected={selectedType === chip}
              onPress={() =>
                setFilters((previous) => ({
                  ...previous,
                  type: chip === "All" ? undefined : chip,
                }))
              }
            />
          ))}
        </View>
        <View className="flex-row flex-wrap gap-2">
          {hasAnyPinned(places) ? (
            <ChipToggle
              label="Pinned"
              selected={filters.pinnedOnly ?? false}
              onPress={() =>
                setFilters((previous) => ({
                  ...previous,
                  pinnedOnly: !previous.pinnedOnly,
                }))
              }
            />
          ) : null}
          <ChipToggle
            label="Yours"
            selected={filters.yoursOnly ?? false}
            onPress={() =>
              setFilters((previous) => ({
                ...previous,
                yoursOnly: !previous.yoursOnly,
              }))
            }
          />
        </View>
      </View>

      {places.length === 0 ? (
        <NothingSavedYet />
      ) : visible.length === 0 ? (
        <NothingForFilter />
      ) : (
        <Grid>
          {visible.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              viewerUserId={viewerUserId}
              onPress={() => onSelectPlace(place)}
            />
          ))}
        </Grid>
      )}
    </View>
  );
}

/**
 * The empty library: an invitation, not a heading over nothing. Said
 * in the sheet's own voice (`SettleLedger`'s `NothingYet`) and pointed
 * at the Add button, which is where the first place comes from.
 */
function NothingSavedYet() {
  return (
    <Text className="font-body text-base text-ink opacity-60">
      Nothing saved yet. Tap Add to save the first place.
    </Text>
  );
}

/**
 * A filtered list that empties says why it is empty: the places exist,
 * the filter hides them, so clearing the filter brings them back.
 */
function NothingForFilter() {
  return (
    <Text className="font-body text-base text-ink opacity-60">
      Nothing for this filter yet.
    </Text>
  );
}
