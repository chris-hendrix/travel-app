import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";

/**
 * A box, a sentence, and the decision between them.
 *
 * The whole row is the target rather than the box: a twenty-pixel square
 * is not something a thumb can be asked to hit, and the sentence beside
 * it is what the reader is actually agreeing to. The tick is drawn
 * instead of the fill implying it, because an inked square on its own
 * reads as a badge.
 *
 * This is consent, and consent is not a filter. `ChipToggle` says "show
 * me these ones"; this says "I have read this". They are the same shape
 * family and nothing else.
 */
export function Checkbox({
  checked,
  onToggle,
  disabled = false,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** The sentence being agreed to. Links inside it work: a target
   *  inside the row still receives the press. */
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      // Both, because they are read by different layers: the state prop
      // is what native answers, and react-native-web emits aria-checked
      // only from the aria prop. Without the second one the box looks
      // ticked and announces nothing.
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      disabled={disabled}
      onPress={onToggle}
      className={`flex-row items-start gap-3 ${disabled ? "opacity-40" : ""}`}
    >
      <View
        className={`mt-0.5 h-5 w-5 items-center justify-center border border-ink ${
          checked ? "bg-ink" : "bg-paper"
        }`}
      >
        {checked ? <Check color="#f5eacc" size={14} strokeWidth={3} /> : null}
      </View>
      <View className="flex-1">{children}</View>
    </Pressable>
  );
}

/** The label a consent row is usually built from, so the two rows that
 *  need one cannot drift on their size. */
export function CheckboxLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="font-body text-sm leading-snug text-ink">{children}</Text>
  );
}
