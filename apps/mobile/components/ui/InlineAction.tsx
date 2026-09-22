import { Text } from "react-native";

/**
 * One action as a word inside a sentence: pressed, not followed.
 *
 * Inline by necessity, not by preference. An empty state states what is
 * missing in a sentence, and the way out of it belongs in that sentence;
 * lifted out into a row of controls it becomes the toolbar such a
 * sentence replaced. The same is true of a cross-reference in a document
 * (`Prose`), which is the other caller.
 *
 * Bold and underlined, `QuietAction`'s two marks, because both are words
 * the system asks a thumb to press and neither has a box to say so. No
 * colour: in this palette a colour is a role — primary for the thing that
 * finishes a job, accent for the thing to notice — and a word inside a
 * sentence is doing neither. That rule is why the two callers share this
 * component rather than each drawing its own: the weight had already
 * drifted apart once (the document's links were underlined and not bold)
 * and nothing anywhere had said they should be.
 *
 * The target is the line the word sits in rather than a 44pt box: it is
 * inside a paragraph of 16pt type, where padding would push the line
 * apart and a box would break the sentence. That is a deliberate
 * deviation from the target-size rule, and the reason the labels want to
 * stay short.
 */
export function InlineAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Text
      accessibilityRole="link"
      onPress={onPress}
      className="font-body-bold text-ink underline"
    >
      {label}
    </Text>
  );
}
