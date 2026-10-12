import { Pressable, Text, View } from "react-native";
import { useMotion } from "@/hooks/useMotion";
import { toIso } from "@/lib/dateRange";
import { travelDayRows, type TravelDay } from "@/lib/travelDays";

/**
 * A trip's own days, as a picker.
 *
 * This exists because a leg's day is bounded by the trip, and the month
 * grid that used to answer here offered 31 days to choose one of nine —
 * with the legal ninth day, the morning after the trip ends, drawn as an
 * unmarked grey cell in the last row. The strip is the trip's days and
 * that one morning, so every cell is a day you can actually pick, and
 * the whole thing is two rows instead of five.
 *
 * No label above it. The cells carry their own weekday and number, and
 * the panel header above reads the chosen day back in full — a third
 * statement of the same fact is what the board has been getting rid of.
 *
 * `role="radio"` inside a `role="radiogroup"`, the same pair `Segmented`
 * carries and the same one this app requires of a choice among visible
 * options. The ink fill means the same thing it means on the calendar:
 * the day is a value, not an action.
 */
export function DayStrip({
  days,
  value,
  onChange,
  today,
}: {
  days: TravelDay[];
  value: string | null;
  onChange: (iso: string) => void;
  /** The day to underline. Defaults to the reader's own today. */
  today?: string;
}) {
  const motion = useMotion();
  const rows = travelDayRows(days);
  if (rows.length === 0) return null;

  const todayIso = today ?? toIso(new Date());

  return (
    <View role="radiogroup">
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row">
          {row.map((day, cell) => {
            // The pad that keeps a short last row the same width as a
            // full one. It is not a day, so it is not a control.
            if (!day) {
              return <View key={`pad-${cell}`} className="flex-1" />;
            }

            const chosen = day.iso === value;
            const label = chosen ? "text-sand" : "text-ink";
            return (
              <Pressable
                key={day.iso}
                onPress={() => onChange(day.iso)}
                role="radio"
                aria-selected={chosen}
                aria-label={`${day.weekday} ${day.day}`}
                className={[
                  // 44pt: the same target the calendar's own cell is.
                  "h-11 flex-1 items-center justify-center border border-ink",
                  // Hairline grid without doubled seams: each cell owns
                  // its top and left edge, and a cell that has a
                  // neighbour above or beside it gives that edge up. The
                  // first row and the first column keep theirs, so the
                  // outer edge is drawn exactly once too.
                  rowIndex > 0 ? "border-t-0" : "",
                  cell > 0 ? "border-l-0" : "",
                  chosen ? "bg-ink" : "",
                  motion.pressDim,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <Text className={`font-body text-xs ${label}`}>
                  {day.weekday}
                </Text>
                <Text
                  className={`font-body-bold text-base ${label} ${
                    day.iso === todayIso && !chosen ? "underline" : ""
                  }`}
                >
                  {day.day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
