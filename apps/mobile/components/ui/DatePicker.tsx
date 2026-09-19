import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  addMonths,
  applyDayTap,
  isEndpoint,
  isInRange,
  monthGrid,
  monthLabel,
  monthOf,
  WEEKDAYS,
  type MonthCursor,
  type Selection,
} from "@/lib/calendar";
import { toIso } from "@/lib/dateRange";

/**
 * Date picker, for a range. Inline, never a nested dialog: opening a
 * second dialog over the first is the one thing this system refuses.
 *
 * Two taps make a trip — the range fills seafoam, the endpoints invert
 * to ink. That is the only question this asks. A single day *inside* a
 * trip is a different question with a better answer: the days themselves
 * are short and known, so they go in a `DayStrip` rather than in a month
 * of cells that cannot be chosen. Nothing picks one day from a calendar
 * here any more, and `single` is gone with it so nothing can start.
 */
export function DatePicker({
  selection,
  onChange,
}: {
  selection: Selection;
  onChange: (next: Selection) => void;
}) {
  const today = toIso(new Date());
  const [cursor, setCursor] = useState<MonthCursor>(() =>
    monthOf(selection.start ?? today),
  );

  const weeks = monthGrid(cursor);

  return (
    <View className="border border-ink bg-paper">
      <View className="flex-row items-center justify-between border-b border-ink px-3 py-2">
        <Arrow
          label="Previous month"
          icon="left"
          onPress={() => setCursor((c) => addMonths(c, -1))}
        />
        <Text className="font-display text-xl uppercase leading-none text-ink">
          {monthLabel(cursor)}
        </Text>
        <Arrow
          label="Next month"
          icon="right"
          onPress={() => setCursor((c) => addMonths(c, 1))}
        />
      </View>

      <View className="flex-row px-2 pt-2">
        {WEEKDAYS.map((day) => (
          <Text
            key={day}
            className="flex-1 text-center font-body text-xs text-ink"
          >
            {day}
          </Text>
        ))}
      </View>

      <View className="px-2 pb-3 pt-1">
        {weeks.map((week, index) => (
          <View key={index} className="flex-row">
            {week.map((iso, cell) => (
              <View key={cell} className="flex-1">
                {iso ? (
                  <Day
                    iso={iso}
                    day={Number(iso.slice(8, 10))}
                    isToday={iso === today}
                    selected={isEndpoint(selection, iso)}
                    inRange={isInRange(selection, iso)}
                    onPress={() => onChange(applyDayTap(selection, iso))}
                  />
                ) : (
                  <View className="h-10" />
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function Day({
  iso,
  day,
  isToday,
  selected,
  inRange,
  onPress,
}: {
  iso: string;
  day: number;
  isToday: boolean;
  selected: boolean;
  inRange: boolean;
  onPress: () => void;
}) {
  const surface = selected ? "bg-ink" : inRange ? "bg-seafoam" : "";
  const label = selected ? "text-sand" : "text-ink";

  return (
    <Pressable
      onPress={onPress}
      aria-label={iso}
      aria-selected={selected}
      className={`h-10 items-center justify-center ${surface}`}
    >
      <Text
        className={`font-body text-sm ${label} ${
          isToday && !selected ? "underline" : ""
        }`}
      >
        {day}
      </Text>
    </Pressable>
  );
}

function Arrow({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: "left" | "right";
  onPress: () => void;
}) {
  const Icon = icon === "left" ? ChevronLeft : ChevronRight;
  return (
    <Pressable aria-label={label} onPress={onPress} className="p-1">
      <Icon color="#000000" size={24} />
    </Pressable>
  );
}
