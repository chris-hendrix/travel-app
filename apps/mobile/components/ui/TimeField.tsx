import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { FieldError } from "@/components/ui/FieldError";
import { formatClock, timeOptions } from "@/lib/time";
import { INK } from "@/lib/theme";

/** Row height is fixed so the picker can open on the right slot without
 *  measuring anything as it lays out. 44pt is the thumb floor: a slot row
 *  cannot borrow a neighbour's hit area the way a lone button can, so it
 *  is the row itself that grows, and the open column is taller for it. */
export const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;
/** Why the "no end" row exists: an event may simply start. */
const NONE = "";

/**
 * Time-of-day picker. Closed, it is one row — the time, and a
 * disclosure — so a form with two of them is two rows rather than two
 * columns of ninety-six slots, most of which are never looked at.
 *
 * Open, it is the column it always was: every slot, the chosen one
 * inverted, opened already scrolled to where you are. Choosing closes it
 * again, because picking a time is the end of the interaction.
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
  disabled = false,
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
  /**
   * Set aside without being cleared: the field keeps what was typed and
   * shows it dimmed, and returns to it on re-enable. How an all-day
   * event parks its times rather than wiping them — hiding them would
   * say they are gone, and toggling back would say otherwise.
   */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const Icon = open ? ArrowUp : ArrowDown;

  // Being set aside closes the list: a disabled field parks its value
  // rather than its menu, so there is nothing open to choose from.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const rows: Array<{ value: string; label: string }> = [
    ...(optional ? [{ value: NONE, label: noneLabel }] : []),
    ...timeOptions().map((option) => ({
      value: option,
      label: formatClock(option),
    })),
  ];

  // Opening lands on the chosen slot rather than at midnight, so the
  // list is where you are every time it is opened.
  useEffect(() => {
    if (!open) return;
    const options = timeOptions();
    const index = value
      ? options.indexOf(value) + (optional ? 1 : 0)
      : optional
        ? 0
        : -1;
    const y = Math.max(0, (index < 0 ? 0 : index) * ROW_HEIGHT - ROW_HEIGHT * 1.5);
    // After layout: the scroll view has no content to scroll before it.
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ y }), 0);
    return () => clearTimeout(timer);
  }, [open, value, optional]);

  // What the row says shut: the time, or the absence of one — which
  // under an optional field is an answer rather than a blank.
  const shown = value
    ? formatClock(value)
    : optional
      ? noneLabel
      : "Pick a time";

  return (
    <View className="gap-1">
      <Text className="font-body-bold text-sm text-ink">{label}</Text>
      <Pressable
        accessibilityRole="button"
        role="button"
        aria-expanded={open}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() => setOpen((current) => !current)}
        className={`flex-row items-center justify-between border border-ink bg-paper p-4 ${
          disabled ? "opacity-40" : ""
        }`}
      >
        <Text
          className={`font-body text-base text-ink ${
            value || optional ? "" : "opacity-60"
          }`}
        >
          {shown}
        </Text>
        <Icon color={INK} size={20} />
      </Pressable>

      {open ? (
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
                  onPress={() => {
                    onChange(row.value === NONE ? null : row.value);
                    setOpen(false);
                  }}
                  aria-selected={chosen}
                  role="radio"
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
      ) : null}

      <FieldError message={error} />
    </View>
  );
}
