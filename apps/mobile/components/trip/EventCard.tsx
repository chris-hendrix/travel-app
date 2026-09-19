import { Badge } from "@/components/ui/Badge";
import { PhotoCard } from "@/components/ui/PhotoCard";
import {
  EVENT_TYPE_LABEL,
  eventTimeLabel,
  type ItineraryEvent,
} from "@/lib/itinerary";

/**
 * An event in a day. Deliberately the trip card's twin: same photo, same
 * two bold lines, except the line above the title is the time. The date
 * is not repeated on the card because the day it sits under is the date.
 */
export function EventCard({
  event,
  timeZone = null,
  onPress,
}: {
  event: ItineraryEvent;
  /** Whose clock to read the times on; the device's when null. */
  timeZone?: string | null;
  onPress?: () => void;
}) {
  return (
    <PhotoCard
      image={event.image}
      overlay={<Badge label={EVENT_TYPE_LABEL[event.type]} variant="category" />}
      meta={eventTimeLabel(event, timeZone)}
      title={event.name}
      footnote={event.place}
      onPress={onPress}
    />
  );
}
