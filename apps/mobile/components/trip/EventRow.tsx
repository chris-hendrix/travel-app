import { Badge } from "@/components/ui/Badge";
import { ScheduleRow } from "@/components/ui/ScheduleRow";
import {
  EVENT_TYPE_LABEL,
  eventTimeLabel,
  type ItineraryEvent,
} from "@/lib/itinerary";

/**
 * An event in the list: a row of the schedule rather than a card.
 *
 * Everything about how a row looks lives in ScheduleRow; what is here is
 * what makes it an event — the type chip, the place beside it, and the
 * clock in the right-hand column.
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
  return (
    <ScheduleRow
      image={event.image}
      title={event.name}
      labels={
        <>
          <Badge label={EVENT_TYPE_LABEL[event.type]} variant="category" />
          <Badge label={event.place} variant="venue" />
        </>
      }
      fact={eventTimeLabel(event, timeZone)}
      onPress={onPress}
    />
  );
}
