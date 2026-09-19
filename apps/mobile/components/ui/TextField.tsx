import type { ReactNode } from "react";
import { Text, TextInput, View } from "react-native";

/**
 * A labelled text input, with room for a control that belongs to it.
 *
 * `suffix` renders inside the field's own box, stretched to its height.
 * That is the point of it: a button that acts on a field — a lookup, a
 * clear — sits in the box rather than beside it, so the two always
 * measure the same. Lining up two separately padded controls means
 * keeping their sums in step by hand, and that holds only until a font
 * metric moves.
 */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  multiline,
  numberOfLines,
  suffix,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  /** Field-level error. Explicitly nullable so strict callers can pass
   *  an optional lookup straight through. */
  error?: string | undefined;
  multiline?: boolean;
  numberOfLines?: number;
  /** A control that acts on this field, drawn inside its box. */
  suffix?: ReactNode;
}) {
  return (
    <View className="gap-1">
      <Text className="font-body-bold text-sm text-ink">{label}</Text>
      <View className="flex-row items-stretch border border-ink bg-paper">
        <TextInput
          className="font-body flex-1 p-4 text-base text-ink"
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#707070"
          multiline={multiline}
          numberOfLines={numberOfLines}
          textAlignVertical={multiline ? "top" : undefined}
        />
        {suffix}
      </View>
      {error ? (
        <Text className="font-body text-sm text-ink">{error}</Text>
      ) : null}
    </View>
  );
}
