import { Pressable, Text, View } from "react-native";

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
 * A chosen cell takes a tone, named for the role rather than the colour,
 * the way a button's variant is. The default is the accent fill; the
 * RSVP asks for its own three, because green, amber and red say more
 * about an answer than one colour for all of them would.
 *
 * `value` is nullable on purpose — "nothing chosen yet" is a real state,
 * not an error.
 */
export type SegmentedTone = "accent" | "primary" | "highlight" | "danger";

const TONES: Record<SegmentedTone, string> = {
  accent: "bg-watermelon",
  primary: "bg-seafoam",
  highlight: "bg-acid",
  danger: "bg-strawberry",
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string; tone?: SegmentedTone }>;
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row">
      {options.map((option, index) => {
        const chosen = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            aria-pressed={chosen}
            className={`flex-1 items-center border border-ink py-4 ${
              index > 0 ? "border-l-0" : ""
            } ${chosen ? TONES[option.tone ?? "accent"] : ""}`}
          >
            <Text className="font-body-bold text-sm text-ink">
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
