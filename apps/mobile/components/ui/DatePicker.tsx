import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  addMonths,
  applyDayTap,
  applySingleTap,
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
 * Date picker. Inline, never a nested dialog: opening a second dialog
 * over the first is the one thing this system refuses.
 *
 * Range by default — two taps make a trip, the range fills seafoam, the
 * endpoints invert to ink. With `single`, one tap picks one day, which
 * is what an event needs.
 *
 * `min` and `max` are the days that make sense for what is being
 * picked — a trip's own dates for an event inside it. Days outside them
 * are inert rather than miscoloured: grey text is the calendar's word
 * for "not a day you can pick here".
 */
export function DatePicker({
  selection,
  onChange,
  single = false,
  min,
  max,
}: {
  selection: Selection;
  onChange: (next: Selection) => void;
  /** One day instead of a range. */
  single?: boolean;
  /** Inclusive bounds, ISO. */
  min?: string;
  max?: string;
}) {
  const today = toIso(new Date());
  const [cursor, setCursor] = useState<MonthCursor>(() =>
    monthOf(selection.start ?? min ?? today),
  );

  const weeks = monthGrid(cursor);

  /** Outside the bounds, so not a day this picker can hand back. */
  const isOutOfBounds = (iso: string) =>
    (min !== undefined && iso < min) || (max !== undefined && iso > max);

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
                    inRange={!single && isInRange(selection, iso)}
                    disabled={isOutOfBounds(iso)}
                    onPress={() =>
                      onChange(
                        single
                          ? applySingleTap(iso)
                          : applyDayTap(selection, iso),
                      )
                    }
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
  disabled,
  onPress,
}: {
  iso: string;
  day: number;
  isToday: boolean;
  selected: boolean;
  inRange: boolean;
  /** Outside the picker's bounds — inert, and visibly not this trip's. */
  disabled?: boolean;
  onPress: () => void;
}) {
  const surface = disabled
    ? "bg-transparent"
    : selected
      ? "bg-ink"
      : inRange
        ? "bg-seafoam"
        : "bg-transparent";
  const label = disabled ? "text-gravel" : selected ? "text-sand" : "text-ink";

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      aria-label={iso}
      aria-selected={selected}
      className={`h-10 items-center justify-center ${surface}`}
    >
      <Text
        className={`font-body text-sm ${label} ${
          isToday && !selected && !disabled ? "underline" : ""
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
