import { Pressable } from "react-native";
import { Badge } from "@/components/ui/Badge";

/**
 * A filter you can press.
 *
 * The reference's device, borrowed: pills in a row, filled ink when on
 * and outlined when off, with one plain word in front saying what the
 * row is choosing between. It replaces the bordered cells that were
 * here for two reasons — a row of chips reads as one control family
 * with the badges already on the cards, and a pill says "press me"
 * without needing a box around the whole thing.
 *
 * A single pressable chip, not a group: several of these in a row can
 * be independent (a filter) or exclusive (a choice), and the caller
 * knows which.
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
      className="cursor-pointer"
    >
      <Badge label={label} variant={selected ? "category" : "outline"} />
    </Pressable>
  );
}
