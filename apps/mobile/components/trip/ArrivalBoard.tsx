import { Text, View } from "react-native";
import { dayNumber, weekdayAbbrev } from "@/lib/dateRange";
import { wallClock } from "@/lib/timezone";
import type { TravelRow } from "@/lib/travelBoard";
import { NOT_SHARED } from "@/lib/wording";

/**
 * One direction of the travel board, lifted from the travel dialog's
 * `TravelSection`/`TravelRowItem` (`app/trips/travel.tsx`) so the demo
 * can read the same board without the dialog's queries.
 *
 * No new logic: same conditionals, same class strings, same data
 * mapping. The rows are non-interactive — the source's press pushes
 * `/trips/travel/detail`, an auth-gated route that would dead-end the
 * demo — so the router, the press target and the motion row are gone,
 * and `tripId` goes with them.
 */
export function ArrivalBoard({
  heading,
  rows,
  timeZone,
}: {
  heading: string;
  rows: TravelRow[];
  timeZone: string | null;
}) {
  if (rows.length === 0) return null;

  return (
    <View className="gap-4">
      <Text className="font-display-bold text-display-sm uppercase text-ink">
        {heading}
      </Text>
      {/* No mark on this list. A board row is read DOWN — the day's own
          narrow column, the name, the clock — so the rows group by
          proximity and the padding does the work. One list per
          direction, with the day carried on each row rather than on a
          heading above a run of them. */}
      <View>
        {rows.map((row) => (
          <ArrivalRow key={row.id} row={row} timeZone={timeZone} />
        ))}
      </View>
    </View>
  );
}

/**
 * One person's travel. The day, the name and the clock are the row —
 * when, who, and how late — and nothing else, so the column reads
 * straight down.
 */
function ArrivalRow({
  row,
  timeZone,
}: {
  row: TravelRow;
  timeZone: string | null;
}) {
  return (
    <View className="flex-row items-center gap-4 py-4">
      {/* The day's own column, narrow and fixed so it aligns down the
          list. Every row names its day, so a run that outlives the
          screen still says when it is. The number reads at the same
          weight as the facts beside it: the column's position already
          says it is a date. */}
      <View className="w-10 items-center">
        {row.date ? (
          <>
            <Text className="font-body text-xs text-ink opacity-60">
              {weekdayAbbrev(row.date)}
            </Text>
            <Text className="font-body text-base leading-none text-ink">
              {dayNumber(row.date)}
            </Text>
          </>
        ) : (
          <Text className="font-body text-base text-ink opacity-40">–</Text>
        )}
      </View>

      <Text className="flex-1 font-body-bold text-base text-ink">
        {row.memberName}
      </Text>

      {/* The clock is a fact about the row, like the members dialog's
          status: read, not announced. Bold here made every row shout
          and left the name with nothing to anchor against. */}
      <Text className="font-body text-base text-ink">
        {row.time ? wallClock(row.time, timeZone).time : NOT_SHARED}
      </Text>
    </View>
  );
}
