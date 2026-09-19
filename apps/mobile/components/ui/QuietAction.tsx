import { Pressable, Text } from "react-native";

/**
 * A secondary action: an underlined word, no box.
 *
 * The system carries one loud button per screen and everything else
 * steps back, so the quieter things — Edit trip, Itinerary settings —
 * are words rather than controls. Underlined, because a word with no
 * affordance is a word.
 */
export function QuietAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="self-start">
      <Text className="font-body-bold text-sm text-ink underline">
        {label}
      </Text>
    </Pressable>
  );
}
