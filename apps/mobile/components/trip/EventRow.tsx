import { Badge } from "@/components/ui/Badge";
import { PlaceholderImage } from "@/components/ui/PlaceholderImage";
import { ScheduleRow } from "@/components/ui/ScheduleRow";
import {
  EVENT_TYPE_LABEL,
  eventTimeLabel,
  type ItineraryEvent,
} from "@/lib/itinerary";
import { EVENT_HUES } from "@/lib/eventColors";

/**
 * An event in the list: a row of the schedule rather than a card.
 *
 * Everything about how a row looks lives in ScheduleRow; what is here is
 * what makes it an event — the type chip, the place beside it, and the
 * clock in the right-hand column.
 *
 * The venue chip names the place, the way the stay row's does, and for the
 * same reason (`StayRow`'s comment records that disagreement from the other
 * side): an event at the roof the stay is at read
 * "Casa Verde, Calle del Sol 12, Cabo San Lucas, Mexico" on one row and
 * "Casa Verde" on the row under it. What the picker filed is still the whole
 * reading — the name and the address together — because that is what a place
 * has to be to be found again; a chip is not the place to print it. The
 * snapshot is the name Google gave the place, and the filed text is the
 * fallback, which is all a typed place has.
 */
export function EventRow({
  event,
  timeZone = null,
  onPress,
}: {
  event: ItineraryEvent;
  /** Whose clock to read the times on; the device's when null. */
  timeZone?: string | null;
  onPress?: () => void;
}) {
  const venue = event.placeName?.trim() || event.place;

  return (
    <ScheduleRow
      image={event.image}
      placeholder={<PlaceholderImage kind={event.type} />}
      title={event.name}
      labels={
        <>
          <Badge
            label={EVENT_TYPE_LABEL[event.type]}
            variant="category"
            hue={EVENT_HUES[event.type] ?? undefined}
          />
          <Badge label={venue} variant="venue" />
        </>
      }
      fact={eventTimeLabel(event, timeZone)}
      onPress={onPress}
    />
  );
}
