import { Pressable, Text, View } from "react-native";
import {
  dayNumber,
  eachDay,
  monthKey,
  monthName,
  weekdayAbbrev,
} from "@/lib/dateRange";

/**
 * The trip's own days, one cell each, in place of a month grid.
 *
 * A calendar answers "which day?" with the whole month, most of which
 * is outside the trip and cannot be chosen: dead cells to look at, no
 * cells to use, and a scroll between months for a trip that is eight
 * days long. A trip is short and bounded — that is the one thing we
 * know for certain — so the honest control is the days themselves. Every
 * cell is a valid answer, there is nothing to scroll, and the shape of
 * the row is the shape of the trip.
 *
 * Cells fit seven across a phone and wrap beyond that, so a fortnight
 * reads as two rows and still hides nothing. A trip that crosses a month
 * boundary says which month each run belongs to, and a trip inside one
 * month needs no heading at all.
 */
export function DayStrip({
  startDate,
  endDate,
  value,
  onChange,
}: {
  startDate: string;
  endDate: string;
  /** The chosen day, yyyy-mm-dd. */
  value: string;
  onChange: (iso: string) => void;
}) {
  const days = eachDay(startDate, endDate);

  // Runs of days sharing a month, in order. One run for most trips.
  const months: Array<{ key: string; days: string[] }> = [];
  for (const day of days) {
    const key = monthKey(day);
    const current = months[months.length - 1];
    if (current?.key === key) current.days.push(day);
    else months.push({ key, days: [day] });
  }

  return (
    <View className="gap-2">
      {months.map((month) => (
        <View key={month.key} className="gap-1">
          {months.length > 1 ? (
            <Text className="font-body text-sm text-ink opacity-60">
              {monthName(`${month.key}-01`)}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-1">
            {month.days.map((day) => {
              const chosen = day === value;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityState={{ selected: chosen }}
                  onPress={() => onChange(day)}
                  className={`w-11 items-center border border-ink py-1 ${
                    chosen ? "bg-ink" : ""
                  }`}
                >
                  {/* The weekday over the number, because "the 19th" is
                      how a day is thought about and "Saturday" is how it
                      is checked. */}
                  <Text
                    className={`font-body text-[10px] ${
                      chosen ? "text-sand" : "text-ink opacity-60"
                    }`}
                  >
                    {weekdayAbbrev(day)}
                  </Text>
                  <Text
                    className={`font-body-bold text-base ${
                      chosen ? "text-sand" : "text-ink"
                    }`}
                  >
                    {dayNumber(day)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
