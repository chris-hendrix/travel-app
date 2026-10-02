import { Pressable, Text } from "react-native";

import { useMotion } from "@/hooks/useMotion";

/**
 * A secondary action: an underlined word, no box.
 *
 * The system carries one loud button per screen and everything else
 * steps back, so the quieter things — the roll-call doors, Read more, the
 * calendar's Unsubscribe and Reset — are words rather than controls.
 * Underlined, because a word with no affordance is a word.
 *
 * `py-3` over a 20pt line is the 44pt floor, reached the way every other
 * target here reaches it: the box grows and the word inside it does not
 * move. It used to be a bare line of text, which made every quiet action in
 * the app a ~20pt target — the one place the target rule was not kept.
 * `justify-center` is what makes the word sit on the box's centre line
 * whatever the box is: without it the word is placed by its own padding, and
 * a row that did not centre its children would top-align a 44pt word against
 * 20pt siblings. Nothing about this component should depend on the parent.
 * `InlineAction` is the other word-shaped control and it documents a real
 * deviation, but for a different reason: it sits inside a paragraph of 16pt
 * type, where a box would break the sentence. These sit in rows of their
 * own, so that reason does not carry over.
 *
 * **The rule the underline answers to:** an underline means *this navigates
 * or presses and has no box*. There is no other affordance for a word in
 * this system — no colour marks one, on purpose, because a colour is a
 * role and a word in a row is doing neither — so the underline is carrying
 * the whole of it and a word without one reads as a label. `InlineAction`
 * is the same rule in a sentence; `PhotoCredit` is the one place it is not
 * applied, and the exception is deliberate and narrow: the photographer's
 * name is a debt the photo carries, not a destination the reader was sent
 * to, so it goes in the quiet tier unadorned while `View on Google Maps`
 * beside it — explicit navigation with its own label and its own press —
 * keeps the mark.
 */
export function QuietAction({
  label,
  onPress,
  align = "start",
}: {
  label: string;
  onPress: () => void;
  /**
   * Where the word sits when it shares a row with a button. `center`
   * puts it on the button's centre line, which is what a word beside a
   * box wants; the default hugs the start, which is what a word in a
   * column wants.
   *
   * The centring is scoped to `md` because the row only exists from md
   * up. Below that the two stack, and centring a word in a column would
   * centre it horizontally.
   */
  align?: "start" | "center";
}) {
  const motion = useMotion();

  return (
    <Pressable
      onPress={onPress}
      role="button"
      className={`justify-center py-3 ${
        align === "center" ? "self-start md:self-center" : "self-start"
      } ${motion.press}`}
    >
      <Text className="font-body-bold text-sm text-ink underline">
        {label}
      </Text>
    </Pressable>
  );
}
