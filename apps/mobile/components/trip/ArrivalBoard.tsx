import { Pressable, Text, View } from "react-native";
import { Badge } from "@/components/ui/Badge";
import { PersonRow } from "@/components/ui/PersonRow";
import { RuledRows } from "@/components/ui/RuledRows";
import { formatDay } from "@/lib/dateRange";
import { modeLabel } from "@/lib/transportMode";
import { wallClock } from "@/lib/timezone";
import type { TravelRow } from "@/lib/travelBoard";
import { joinFacts, NOT_SHARED } from "@/lib/wording";
import { useMotion } from "@/hooks/useMotion";

/**
 * One direction of the travel board, lifted from the travel dialog's
 * `TravelSection`/`TravelRowItem` (`app/trips/travel.tsx`) so the demo
 * can read the same board without the dialog's queries.
 *
 * No new logic: same conditionals, same class strings, same data
 * mapping. The press is a prop rather than part of the component: the
 * source wrapped each row in a `Pressable` that pushed
 * `/trips/travel/detail`, and that press belongs to the screen that
 * knows the trip. `app/trips/travel.tsx` supplies it, exactly as before
 * the lift, so the travel-row tap survives the extraction; a caller
 * with no route to offer passes nothing and gets plain rows.
 */
export function ArrivalBoard({
  heading,
  rows,
  timeZone,
  onPressRow,
}: {
  heading: string;
  rows: TravelRow[];
  timeZone: string | null;
  /**
   * The caller's own press, handed in rather than assumed. The travel
   * dialog opens the travel detail; a caller with no route to offer
   * passes nothing and gets plain rows.
   */
  onPressRow?: ((row: TravelRow) => void) | undefined;
}) {
  if (rows.length === 0) return null;

  return (
    <View className="gap-4">
      <Text className="font-display-bold text-display-sm uppercase text-ink">
        {heading}
      </Text>
      {/* The board's rows are the roster's rows, and the roster's rank:
          a board row is read *across* — the person with the chip that
          says how they are coming beside their name, the where on the
          line under it, and the day and the clock at the far edge — so
          the rows keep the table's soft rule and `RuledRows` owns it.
          The first row keeps none, because the block above the table is
          its opening boundary. */}
      <RuledRows>
        {rows.map((row) => (
          <ArrivalRow
            key={row.id}
            row={row}
            timeZone={timeZone}
            onPressRow={onPressRow}
          />
        ))}
      </RuledRows>
    </View>
  );
}

/**
 * One person's travel, in the table's own row: the name with the mode
 * beside it, the where under it, and the day with the clock at the far
 * edge. The day used to be a narrow column of its own on the left; it
 * moved into the far column with the clock, which is where the detail
 * sheet prints the same pair. The clock keeps the roster's far-column
 * weight rather than the row's: a time is read, not announced, and bold
 * here made every row shout while leaving the name nothing to anchor
 * against.
 */
function ArrivalRow({
  row,
  timeZone,
  onPressRow,
  className,
}: {
  row: TravelRow;
  timeZone: string | null;
  onPressRow?: ((row: TravelRow) => void) | undefined;
  /** The table's mark, handed down by `RuledRows`. */
  className?: string | undefined;
}) {
  const motion = useMotion();
  // The day and the clock are one fact, joined the way the detail sheet
  // joins them. A row nobody has filed says so in the board's own words
  // rather than showing an empty line.
  const when =
    row.date && row.time
      ? joinFacts(formatDay(row.date), wallClock(row.time, timeZone).time)
      : NOT_SHARED;
  const body = (
    <PersonRow
      name={row.memberName}
      chips={
        row.transportMode ? (
          <Badge
            label={modeLabel(row.transportMode)}
            variant="category"
            size="sm"
          />
        ) : null
      }
      detail={row.location}
      far={when}
      className={className}
    />
  );
  if (!onPressRow) return body;
  return (
    <Pressable
      role="button"
      accessibilityRole="button"
      onPress={() => onPressRow(row)}
      className={motion.rowOnGravel}
    >
      {body}
    </Pressable>
  );
}
