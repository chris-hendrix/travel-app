import { Pressable, Text, View } from "react-native";

export type SegmentedTone =
  | "ink"
  | "accent"
  | "primary"
  | "highlight"
  | "danger";

/**
 * The fill a chosen cell takes, and what its label becomes on it.
 *
 * `ink` is the default, and it is the system's word for a value rather
 * than an action: the calendar inverts its chosen day, a time column
 * inverts its chosen slot, and a toggle does the same. Choosing one of
 * two directions is not a call to action, and a screen carrying two
 * toggles was spending two saturated fills to say so — which left the one
 * button worth pressing looking like one of them.
 *
 * The colours are still here for answers that carry a meaning of their
 * own, which is why the RSVP takes one: green, amber and red say more
 * about going, maybe and not going than any single colour could.
 */
const TONES: Record<SegmentedTone, { box: string; label: string }> = {
  ink: { box: "bg-ink", label: "text-sand" },
  accent: { box: "bg-watermelon", label: "text-ink" },
  primary: { box: "bg-seafoam", label: "text-ink" },
  highlight: { box: "bg-acid", label: "text-ink" },
  danger: { box: "bg-strawberry", label: "text-ink" },
};

/**
 * One choice out of a few, all of them visible at once.
 *
 * Bordered cells in a row rather than a bare chip: the thing this was
 * built for starts with nothing chosen, and a control that can be empty
 * has to read as a control before it reads as a choice.
 *
 * Button-sized on purpose — the same p-4, the same text-sm label — so a
 * row of these sits in a stack of buttons without a step. Its height is
 * its own proof: whatever the button above it measures, this measures.
 *
 * `mark` is a short mark drawn after the label — a tick against a choice
 * that is done, say. It is a string inside the label rather than a node
 * beside it so it takes the label's colour: a cell that fills with ink
 * would otherwise show a black mark on black, and recolouring someone
 * else's node from in here would mean this primitive knowing what it was
 * given.
 *
 * `value` is nullable on purpose — "nothing chosen yet" is a real state,
 * not an error.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  disabled = false,
}: {
  options: Array<{
    value: T;
    label: string;
    tone?: SegmentedTone;
    mark?: string;
  }>;
  value: T | null;
  onChange: (value: T) => void;
  /**
   * Which row it sits in, and the two come together: `md` is button-sized
   * — the same p-4 as a button, filling the width of its block — for a
   * control that is a tier of that block, which the RSVP is. `sm` is a
   * chrome row's height and a chrome row's width: the cells take only the
   * room their labels need, and the same px-3 py-2 box ChipToggle draws,
   * so a switch and a chip on one line are the same size rather than a
   * step — and so a label sits as far inside one as inside the other.
   * The label is text-sm at either size, because the label size is the
   * system's and not the row's.
   */
  size?: "md" | "sm";
  /**
   * The answer is on its way, so there is nothing to choose yet. A real
   * disable rather than a pointer guard: assistive technology announces
   * it on both platforms, and the pressable itself refuses the second
   * tap instead of a wrapper swallowing it.
   */
  disabled?: boolean;
}) {
  const box = size === "sm" ? "px-3 py-2" : "flex-1 py-4";

  return (
    <View className="flex-row" role="radiogroup">
      {options.map((option, index) => {
        const chosen = option.value === value;
        const fill = TONES[option.tone ?? "ink"];
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            role="radio"
            aria-selected={chosen}
            aria-disabled={disabled}
            disabled={disabled}
            className={`items-center border border-ink ${box} ${
              index > 0 ? "border-l-0" : ""
            } ${chosen ? fill.box : ""}`}
          >
            <Text
              className={`font-body-bold text-sm ${
                chosen ? fill.label : "text-ink"
              }`}
            >
              {option.mark ? `${option.label} ${option.mark}` : option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
