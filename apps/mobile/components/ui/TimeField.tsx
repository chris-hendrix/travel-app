import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { formatClock, timeOptions } from "@/lib/time";

/** Row height is fixed so the picker can open on the right slot without
 *  measuring anything as it lays out. */
const ROW_HEIGHT = 40;
const VISIBLE_ROWS = 5;
const OPENING_SLOT = "09:00";
/** Why the "no end" row exists: an event may simply start. */
const NONE = "";

/**
 * Time-of-day picker. Inline and scrollable — a column of slots, the
 * chosen one inverted — so it reads as a clock without a wheel: no
 * second dialog, and every slot reachable by dragging.
 *
 * Rows are the twelve-hour labels the itinerary prints, so the form and
 * the card that results from it say the same thing.
 *
 * `optional` puts a no-choice row at the top — "No end" for a finish,
 * "All day" for a start — which is how an event without that time is
 * expressed: not an empty picker, but a choice.
 */
export function TimeField({
  label,
  value,
  onChange,
  optional = false,
  noneLabel = "No end",
  error,
  accessory,
}: {
  label: string;
  /** 24-hour "20:30", or null when nothing is set yet. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Offers the none row as a real answer. */
  optional?: boolean;
  /** What that row says: "No end" under Starts would be a lie. */
  noneLabel?: string;
  error?: string | undefined;
  /** Sits at the end of the label row: something that qualifies the
   *  value beside it rather than standing on its own. */
  accessory?: ReactNode;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const options = timeOptions();
  // Where to open: what is set, or a plausible hour to start looking.
  const [openedOn] = useState(
    () => options.indexOf(value ?? OPENING_SLOT) + (optional ? 1 : 0),
  );

  useEffect(() => {
    const index = openedOn < 0 ? 0 : openedOn;
    const y = Math.max(0, index * ROW_HEIGHT - ROW_HEIGHT * 1.5);
    // After layout: the scroll view has no content to scroll before it.
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ y }), 0);
    return () => clearTimeout(timer);
  }, [openedOn]);

  const rows: Array<{ value: string; label: string }> = [
    ...(optional ? [{ value: NONE, label: noneLabel }] : []),
    ...options.map((option) => ({
      value: option,
      label: formatClock(option),
    })),
  ];

  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-4">
        <Text className="font-body-bold text-sm text-ink">{label}</Text>
        {accessory}
      </View>
      <View
        className="border border-ink bg-paper"
        style={{ height: ROW_HEIGHT * VISIBLE_ROWS }}
      >
        <ScrollView ref={scrollRef} className="flex-1">
          {rows.map((row) => {
            const chosen = row.value === (value ?? "");
            return (
              <Pressable
                key={row.value === NONE ? "none" : row.value}
                onPress={() => onChange(row.value === NONE ? null : row.value)}
                aria-selected={chosen}
                style={{ height: ROW_HEIGHT }}
                className={`items-center justify-center ${
                  chosen ? "bg-ink" : ""
                }`}
              >
                <Text
                  className={`font-body text-base ${
                    chosen ? "font-body-bold text-sand" : "text-ink"
                  }`}
                >
                  {row.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {error ? (
        <Text className="font-body text-sm text-ink">{error}</Text>
      ) : null}
    </View>
  );
}
