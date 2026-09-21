import { Pressable, Text } from "react-native";

/**
 * A filter you can press: a box, inked when on and outlined when off.
 *
 * It was a pill, to sit in the same family as the badges already on the
 * cards. That is now the bug rather than the feature: a badge says what
 * a thing *is* (Food, Stay, sold out, a countdown), a chip says what you
 * have *chosen* to see, and the run's own head puts the two in one view
 * — a filled chip reads exactly like a filled badge, so a reader has to
 * press a pill to find out whether it does anything. The shape is the
 * distinction this system already uses everywhere else, so the chip
 * borrows the right thing this time: boxes are controls (a button, a
 * segmented cell, this), pills are labels.
 *
 * Square corners and the label at the button size, because that is what
 * makes it read as a control rather than as a tag. It stays compact —
 * the run's head carries two of these groups above its first heading —
 * so it is smaller than a button rather than a button.
 *
 * A single pressable chip, not a group: several of these in a row can
 * be independent (a filter) or exclusive (a choice), and the caller
 * knows which. Independent filters are the common case; a choice among
 * visible options is `Segmented`, which draws the chosen cell in ink and
 * says `role="radio"` while it does it.
 */
export function ChipToggle({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`cursor-pointer border border-ink px-3 py-2 ${
        selected ? "bg-ink" : ""
      }`}
    >
      <Text
        className={`font-body-bold text-sm ${selected ? "text-sand" : "text-ink"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
