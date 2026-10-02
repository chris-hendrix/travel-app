import { Badge } from "@/components/ui/Badge";
import { PlaceholderImage } from "@/components/ui/PlaceholderImage";
import { ScheduleRow } from "@/components/ui/ScheduleRow";
import { stayArea, staySpan, type Stay } from "@/lib/stays";
import { STAY_HUE } from "@/lib/eventColors";

/**
 * A roof, as a row of the run.
 *
 * The same format as an event row, by construction rather than by
 * imitation: both are ScheduleRow, so the thumbnail, the name's face and
 * size, the chip line and the right-hand column's weight are decided in
 * one place and cannot drift apart again.
 *
 * The two things that make it a stay are data. The chip reads Stay where
 * an event's reads its type, and the right-hand column holds the range
 * it covers where an event's holds a clock. The nights are not here: an
 * event row is a type, a place and a time, and a stay row is a type, a
 * place and a span. That the span is five nights long is the sheet's
 * line, the way an event's description is the sheet's.
 */
export function StayRow({
  stay,
  timeZone = null,
  onPress,
}: {
  stay: Stay;
  /** Whose clock to read the dates on; the device's when null. */
  timeZone?: string | null;
  onPress?: () => void;
}) {
  // The venue chip names the place when the stay is linked to one, the way an
  // event row's does; the town is what is left for a stay whose address was
  // typed rather than picked. It used to be the town either way, which made
  // the two rows disagree about what "where" means: an event said "The
  // Rooftop" and the roof above it said "Dallas".
  const area = stayArea(stay);
  const place = stay.placeName?.trim() || area;

  return (
    <ScheduleRow
      image={stay.image}
      placeholder={<PlaceholderImage kind="lodging" />}
      title={stay.name}
      labels={
        <>
          <Badge label="Stay" variant="category" hue={STAY_HUE} />
          {place ? <Badge label={place} variant="venue" /> : null}
        </>
      }
      fact={staySpan(stay, timeZone) ?? ""}
      onPress={onPress}
    />
  );
}
