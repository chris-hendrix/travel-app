import { View } from "react-native";

import { Badge } from "@/components/ui/Badge";
import { PhotoCard } from "@/components/ui/PhotoCard";
import { PlaceholderImage } from "@/components/ui/PlaceholderImage";
import { EVENT_HUES } from "@/lib/eventColors";
import { EVENT_TYPE_LABEL } from "@/lib/itinerary";
import type { SavedPlace } from "@/lib/saved-places";
import { savedPlaceCard } from "@/lib/savedPlaces";

/**
 * A saved place in a grid. EventCard's exact fill on a PhotoCard: the
 * type badge with the event table's own hue, the saver's byline above
 * the display title, the address under it — and, when the place is
 * pinned, a second ink `Pinned` badge beside the type in the same
 * overlay row. No photo exists for typed places, so a missing image
 * renders the type's stock photo, the same placeholder EventCard wears.
 *
 * The "You" in the byline is the component's word, never the pure
 * layer's: `savedPlaceCard` passes the creator name through untouched,
 * and the comparison here is against the viewer's **user** id — the
 * roster's `Member.id` is a member id, never interchangeable.
 */
export function PlaceCard({
  place,
  viewerUserId,
  onPress,
}: {
  place: SavedPlace;
  /** The viewer's **user** id, for the "You" in the byline. */
  viewerUserId: string;
  onPress?: () => void;
}) {
  const card = savedPlaceCard(place);

  return (
    <PhotoCard
      image={place.image}
      placeholder={<PlaceholderImage kind={card.kind} />}
      photoSourceUri={place.photoSourceUri}
      overlay={
        <View className="flex-row gap-2">
          <Badge
            label={EVENT_TYPE_LABEL[card.badge]}
            variant="category"
            hue={EVENT_HUES[card.badge] ?? undefined}
          />
          {place.isPinned ? <Badge label="Pinned" variant="pinned" /> : null}
        </View>
      }
      meta={`Saved by ${place.createdBy === viewerUserId ? "You" : card.meta}`}
      title={card.title}
      footnote={card.footnote || undefined}
      onPress={onPress}
    />
  );
}
