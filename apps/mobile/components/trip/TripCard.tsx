import { Badge } from "@/components/ui/Badge";
import { PhotoCard } from "@/components/ui/PhotoCard";
import { tripCountdown } from "@/lib/countdown";
import { formatDateRange } from "@/lib/dateRange";
import type { PlacePhotoCredit } from "@/lib/place-images";

export type Trip = {
  id: string;
  title: string;
  location: string;
  image: string;
  /**
   * The raw upload, resolved against the API origin — null when the
   * trip has no cover. Distinct from `image`, which is the resolved
   * cover (upload, then place photo, then placeholder): the edit form
   * seeds its preview from this, so a place photo never reads as a
   * cover the user added.
   */
  coverImageUrl: string | null;
  /**
   * The place photo's required Google Maps source link, null for
   * uploads and placeholders. Every rendered photo reaches it: the
   * tile through `PhotoCard`, the hero through its own tap.
   */
  photoSourceUri?: string | null;
  /** The photo's author credit for the detail surface; tiles render nothing. */
  photoCredit?: PlacePhotoCredit | null;
  going: number;
  /** Organizer-authored prose, null until someone writes it. */
  description: string | null;
  /** IANA zone the trip runs in: what its times are read in by default. */
  preferredTimezone: string;
  /** ISO yyyy-mm-dd — the card formats its own range. */
  startDate: string;
  endDate: string;
  /**
   * The trip's own coordinates, when the server geocoded (or kept)
   * them. Absent or null until then — and the autocomplete bias
   * reads these, so either means an unbiased search, never a `0,0`
   * one. Optional so list-sourced and mock trips can omit them.
   */
  destinationLat?: number | null;
  destinationLon?: number | null;
  /**
   * The linked Google place id, null when the destination is prose.
   * The detail screen's Maps link pins to this when present and falls
   * back to a plain search when absent.
   */
  placeId?: string | null;
  /**
   * The picked place's name, stored on the trip row at pick time.
   * The display source — it survives cache expiry and renames.
   */
  placeName?: string | null;
  /**
   * The picked place's formatted address, stored on the trip row at
   * pick time. The display source, like `placeName`.
   */
  placeAddress?: string | null;
  /**
   * The linked place's country code, feeding the pickers' autocomplete
   * floor. Null when the destination has no linked place.
   */
  placeCountry?: string | null;
};

/**
 * A trip in a grid. Upcoming trips carry a countdown on the photo;
 * finished trips carry nothing, so the grid answers "what's next" at a
 * glance.
 *
 * Order follows the calendar convention: date, then title, then place.
 * The tile itself is the shared PhotoCard.
 */
export function TripCard({
  trip,
  onPress,
  today = new Date(),
}: {
  trip: Trip;
  onPress?: () => void;
  /** Injected so the countdown and the list grouping agree on "now". */
  today?: Date;
}) {
  const countdown = tripCountdown(trip.startDate, trip.endDate, today);

  return (
    <PhotoCard
      image={trip.image}
      photoSourceUri={trip.photoSourceUri ?? null}
      overlay={countdown ? <Badge label={countdown} variant="club" /> : null}
      meta={formatDateRange(trip.startDate, trip.endDate)}
      title={trip.title}
      footnote={trip.location}
      onPress={onPress}
    />
  );
}
