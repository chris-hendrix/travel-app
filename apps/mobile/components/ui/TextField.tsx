import type { ReactNode } from "react";
import {
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";

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
  ariaLabel,
  value,
  onChangeText,
  placeholder,
  error,
  multiline,
  numberOfLines,
  suffix,
  keyboardType,
  onFocus,
}: {
  /**
   * Drawn above the box. Omitted when the caller draws it instead —
   * a field in a row with its own action puts the label above the row,
   * because otherwise the action stretches to the label's height too.
   */
  label?: string;
  /** The input's own name, when the label is drawn elsewhere. */
  ariaLabel?: string;
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
  /**
   * The keypad the content asks for. A phone number wants the one with
   * digits and a plus on it, which is a different keyboard from the one
   * a name wants, and the platform is the only thing that can supply it.
   */
  keyboardType?: KeyboardTypeOptions;
  /**
   * The field has been entered. A field that opens a list of suggestions
   * needs to know that before anything has been typed into it.
   */
  onFocus?: () => void;
}) {
  return (
    <View className="gap-1">
      {label ? (
        <Text className="font-body-bold text-sm text-ink">{label}</Text>
      ) : null}
      <View className="flex-row items-stretch border border-ink bg-paper">
        <TextInput
          className="font-body flex-1 p-4 text-base text-ink"
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#707070"
          multiline={multiline}
          numberOfLines={numberOfLines}
          keyboardType={keyboardType}
          onFocus={onFocus}
          // The label is drawn above the box rather than bound to it, so
          // the box carries it too: without this the input's name is the
          // placeholder, and a screen reader reading two fields on one
          // screen hears the same thing twice.
          accessibilityLabel={label ?? ariaLabel}
          aria-label={label ?? ariaLabel}
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
