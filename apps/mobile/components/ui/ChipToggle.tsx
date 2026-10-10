import { Pressable, Text } from "react-native";

import { useMotion } from "@/hooks/useMotion";

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
 * knows which — which is why the announcement is the caller's too
 * (`role`). Independent filters are the common case; a choice among
 * visible options is `Segmented`, which draws the chosen cell in ink and
 * says `role="radio"` while it does it. An exclusive group of these
 * takes the same `role="radio"` when its labels will not fit one row of
 * cells: the report panel's four reasons wrap where `Segmented`'s cells
 * cannot, and the choice is the same kind of thing either way.
 */
export function ChipToggle({
  label,
  selected = false,
  onPress,
  disabled = false,
  role = "button",
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /**
   * While the row's write is in flight. A disabled chip keeps its fill
   * — the value has not changed, only the control is quiet — at half
   * strength so the quiet reads as busy rather than as off.
   */
  disabled?: boolean;
  /**
   * What the chip is to a reader. `button` — the default, and every call
   * site before this prop existed — is a filter: press it to show these
   * ones. `radio` is the exclusive case, where the caller wraps the set in
   * a `radiogroup` and the fill says which one is the answer. A state on
   * an element that is not anything is a flag a reader is not obliged to
   * read out, which is why this is a `role` rather than a flag.
   */
  role?: "button" | "radio";
}) {
  const motion = useMotion();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      role={role}
      aria-selected={selected}
      aria-disabled={disabled}
      className={`cursor-pointer border border-ink px-3 py-2 ${
        selected ? "bg-ink" : ""
      } ${disabled ? "opacity-50" : ""} ${motion.pressFill}`}
    >
      <Text
        className={`font-body-bold text-sm ${selected ? "text-sand" : "text-ink"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
