import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { FieldError } from "@/components/ui/FieldError";
import { formatClock, isClockTime, minutesOf, timeOptions } from "@/lib/time";
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
 * Where a picker lands when nothing is chosen yet and the caller names no
 * anchor. It used to land on midnight — the list opened on 12:00 AM and the
 * first thing a thumb did was scroll. Nine is the hour a day's plan usually
 * begins, and it is a constant rather than the current time so that the
 * same field opens in the same place twice.
 */
const DEFAULT_ANCHOR = "09:00";

/**
 * The row a clock time sits on, or the next slot after it — or the last
 * slot, for a time past the end of the day, which has no next. A time off
 * the fifteen-minute step (an event the API wrote rather than this picker)
 * lands on the slot that follows it instead of nowhere.
 */
function rowForClock(options: string[], clock: string): number {
  if (!isClockTime(clock)) return rowForClock(options, DEFAULT_ANCHOR);
  const target = minutesOf(clock);
  const at = options.findIndex((option) => minutesOf(option) >= target);
  return at === -1 ? options.length - 1 : at;
}

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
 *
 * `anchor` is where it opens when nothing is chosen yet, and `min` is the
 * floor: slots before it are shown but set aside. Both are the caller's,
 * because only the form knows whether its two times are a pair. An event's
 * are — the schema refuses an end at or before its start — so the end opens
 * on the start and cannot go behind it. A stay's and a leg's are not:
 * checking out at 11 is the morning after checking in at 3, and an arrival
 * earlier than its departure is the red-eye, which `newTravel` reads as the
 * next day on purpose. Bounding either of those would be a bug.
 */
export function TimeField({
  label,
  value,
  onChange,
  optional = false,
  noneLabel = "No end",
  anchor = null,
  min = null,
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
  /**
   * The slot the list lands on when nothing is chosen yet. An end time
   * opens on the start it follows, so a pair reads as a pair rather than
   * one of them opening on midnight.
   */
  anchor?: string | null;
  /**
   * Nothing before this can be chosen. Only ever a value the schema already
   * refuses — an event's end, never a stay's check-out or a leg's arrival.
   */
  min?: string | null;
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

  // Opening lands on the chosen slot, so the list is where you are every
  // time it is opened. With nothing chosen it lands on the caller's anchor
  // when there is one, else on the none row when the field offers one, else
  // on the default hour.
  useEffect(() => {
    if (!open) return;
    const options = timeOptions();
    const landing = value ?? anchor;
    let index: number;
    if (landing) {
      index = rowForClock(options, landing) + (optional ? 1 : 0);
    } else if (optional) {
      index = 0;
    } else {
      index = rowForClock(options, DEFAULT_ANCHOR);
    }
    const y = Math.max(0, index * ROW_HEIGHT - ROW_HEIGHT * 1.5);
    // After layout: the scroll view has no content to scroll before it.
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ y }), 0);
    return () => clearTimeout(timer);
  }, [open, value, anchor, optional]);

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
        <Icon color={INK} size={20} aria-hidden />
      </Pressable>

      {open ? (
        <View
          className="border border-ink bg-paper"
          style={{ height: ROW_HEIGHT * VISIBLE_ROWS }}
        >
          <ScrollView ref={scrollRef} className="flex-1">
            {rows.map((row) => {
              const chosen = row.value === (value ?? "");
              // The none row is never measured against the floor: "" is not
              // a clock time, so an event that simply starts stays available
              // under an anchored end.
              //
              // The floor is `<=` and not `<`, because the schema refuses an
              // end *at or before* its start (`newEvent`: "It ends before it
              // starts."). A picker that left the slot equal to the start
              // open would be offering a choice the form has already refused.
              const before =
                min !== null && isClockTime(row.value)
                  ? minutesOf(row.value) <= minutesOf(min)
                  : false;
              // A row can be the answer and out of bounds at once, when the
              // start moves past an end already picked. It is dimmed then and
              // deliberately not inverted: the inversion says "this is your
              // answer", and the two marks together say nothing a reader can
              // act on.
              const marked = chosen && !before;
              return (
                <Pressable
                  key={row.value === NONE ? "none" : row.value}
                  onPress={() => {
                    if (before) return;
                    onChange(row.value === NONE ? null : row.value);
                    setOpen(false);
                  }}
                  disabled={before}
                  aria-disabled={before}
                  aria-selected={chosen}
                  role="radio"
                  style={{ height: ROW_HEIGHT }}
                  className={`items-center justify-center ${
                    marked ? "bg-ink" : ""
                  } ${before ? "opacity-40" : ""}`}
                >
                  <Text
                    className={`font-body text-base ${
                      marked ? "font-body-bold text-sand" : "text-ink"
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
