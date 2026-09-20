import { PhotoCard } from "@/components/ui/PhotoCard";
import { Badge } from "@/components/ui/Badge";
import { stayArea, staySpan, type Stay } from "@/lib/stays";

/**
 * A roof, as a card: the event card's twin, and nothing more.
 *
 * Deliberately the same tile, because in this layout everything in the run
 * is a tile — same photo, same chip on that photo, same two bold lines
 * around a display title. The chip reads Stay where an event's reads its
 * type, and that is the only thing on the card that says a roof is a
 * different kind of thing. The lines differ by data: an event puts its
 * clock above the title, a stay puts the range it covers, and the line
 * below says where it is. It is not the section's opening tile, and the
 * other roofs are not lines under it; that version made one roof a
 * headline and the rest a footnote, and nothing on the screen said why.
 */
export function StayCard({
  stay,
  timeZone = null,
  onPress,
}: {
  stay: Stay;
  /** Whose clock to read the dates on; the device's when null. */
  timeZone?: string | null;
  onPress?: () => void;
}) {
  const span = staySpan(stay, timeZone);
  const area = stayArea(stay);

  return (
    <PhotoCard
      image={stay.image}
      overlay={<Badge label="Stay" variant="category" />}
      // The card's three lines are the event card's three lines: the span
      // where an event has its clock, the name, then where it is. The
      // nights are the sheet's, not the card's.
      meta={span ?? area ?? ""}
      title={stay.name}
      footnote={span ? (area ?? undefined) : undefined}
      onPress={onPress}
    />
  );
}
