import type { ReactNode } from "react";
import {
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
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
  autoFocus,
  maxLength,
  autoComplete,
  textContentType,
  centered,
}: {
  /**
   * Drawn above the box. Omitted when the caller draws it instead —
   * a field in a row with its own action puts the label above the row,
   * because otherwise the action stretches to the label's height too.
   */
  label?: string | undefined;
  /** The input's own name, when the label is drawn elsewhere. */
  ariaLabel?: string | undefined;
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
  /** Rafed on mount. One field per screen has this: the one the reader
   *  came here to fill in. */
  autoFocus?: boolean;
  maxLength?: number;
  /** The platform's own fill, when it has one: a phone number, or the
   *  code that just arrived by text. Both are worth more than any
   *  styling on the field, because typing six digits correctly is the
   *  one thing a thumb is bad at. */
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  /**
   * One short value, read as a unit: six digits of a code, centred and
   * tracked. Not a size, a shape. And not a narrower box either: every
   * field in this system runs the full column at every width, so a field
   * that capped itself would be the one thing on the screen that did not
   * line up with the rest.
   */
  centered?: boolean;
}) {
  return (
    <View className="gap-1">
      {label ? (
        <Text className="font-body-bold text-sm text-ink">{label}</Text>
      ) : null}
      <View className="flex-row items-stretch border border-ink bg-paper">
        <TextInput
          // `min-w-0` because a flex item refuses to shrink below its
          // intrinsic width, and an input's intrinsic width comes from its
          // default 20-character size. At this type size that is about
          // 330px, which overflows any narrower box: the digits then centre
          // on the input instead of on the box, and on the web the focus
          // ring traces the overflow.
          className={`font-body min-w-0 flex-1 p-4 text-ink ${
            centered ? "text-center text-2xl tracking-widest" : "text-base"
          }`}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#707070"
          multiline={multiline}
          numberOfLines={numberOfLines}
          keyboardType={keyboardType}
          onFocus={onFocus}
          autoFocus={autoFocus}
          maxLength={maxLength}
          autoComplete={autoComplete}
          textContentType={textContentType}
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
