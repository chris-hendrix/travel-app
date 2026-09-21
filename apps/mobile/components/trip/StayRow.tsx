import { Badge } from "@/components/ui/Badge";
import { ScheduleRow } from "@/components/ui/ScheduleRow";
import { stayArea, staySpan, type Stay } from "@/lib/stays";

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
  const area = stayArea(stay);

  return (
    <ScheduleRow
      image={stay.image}
      title={stay.name}
      labels={
        <>
          <Badge label="Stay" variant="category" />
          {area ? <Badge label={area} variant="venue" /> : null}
        </>
      }
      fact={staySpan(stay, timeZone) ?? ""}
      onPress={onPress}
    />
  );
}
