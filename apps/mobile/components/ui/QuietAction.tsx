import { Pressable, Text } from "react-native";

/**
 * A secondary action: an underlined word, no box.
 *
 * The system carries one loud button per screen and everything else
 * steps back, so the quieter things — the roll-call doors, Read more, the
 * calendar's Unsubscribe and Reset — are words rather than controls.
 * Underlined, because a word with no affordance is a word.
 *
 * The target is the word's own line rather than a 44pt box, which is a
 * deliberate deviation from the target-size rule and the same one
 * `InlineAction` documents. The reason is the row it lives in: padding here
 * would push the words apart on a line read as one thing (the trip page's
 * `1 going · Travel`), and the labels stay short for the same reason. A
 * word that needs a thumb's full box wants to be a `Button`.
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
  return (
    <Pressable
      onPress={onPress}
      role="button"
      className={
        align === "center" ? "self-start md:self-center" : "self-start"
      }
    >
      <Text className="font-body-bold text-sm text-ink underline">
        {label}
      </Text>
    </Pressable>
  );
}
