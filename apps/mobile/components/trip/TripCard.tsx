import { Badge } from "@/components/ui/Badge";
import { PhotoCard } from "@/components/ui/PhotoCard";
import { tripCountdown } from "@/lib/countdown";
import { formatDateRange } from "@/lib/dateRange";

export type Trip = {
  id: string;
  title: string;
  location: string;
  image: string;
  going: number;
  /** Organizer-authored prose, null until someone writes it. */
  description: string | null;
  /** IANA zone the trip runs in: what its times are read in by default. */
  preferredTimezone: string;
  /** ISO yyyy-mm-dd — the card formats its own range. */
  startDate: string;
  endDate: string;
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
      overlay={countdown ? <Badge label={countdown} variant="club" /> : null}
      meta={formatDateRange(trip.startDate, trip.endDate)}
      title={trip.title}
      footnote={trip.location}
      onPress={onPress}
    />
  );
}
