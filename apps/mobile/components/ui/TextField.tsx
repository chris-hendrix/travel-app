import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
import { FieldError } from "@/components/ui/FieldError";
import { INK, PLACEHOLDER } from "@/lib/theme";

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
  // The caret the platform will not place: see the pair of comments on the
  // input below. Focus is tracked here rather than taken from the caller,
  // because the drawn caret is the field's own — the caller's `onFocus` still
  // runs.
  const [focused, setFocused] = useState(false);
  const drawnCaret = centered && !value && Platform.OS === "android";
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!drawnCaret || !focused) return;
    // Visible first, dark second: the caret is there the moment the field is
    // focused rather than half a second later, and a loop that never starts
    // leaves a steady caret rather than no caret at all. 500/500 is Android's
    // own blink, so a drawn one and a native one keep the same time.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(blink, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(500),
        Animated.timing(blink, {
          toValue: 1,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      blink.setValue(1);
    };
  }, [blink, drawnCaret, focused]);

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
          placeholderTextColor={PLACEHOLDER}
          multiline={multiline}
          numberOfLines={numberOfLines}
          keyboardType={keyboardType}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => setFocused(false)}
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
          // Android cannot place the caret in an empty centred field: with
          // `textAlign: "center"` and no value it draws at the right edge of
          // the box while the hint stays centred, and it returns to the
          // middle the moment there is a digit to sit beside
          // (facebook/react-native#28794, #38528 — both still open). No JS
          // prop moves it, because the position comes out of the native
          // layout, so the empty field hides it rather than showing it in the
          // wrong place: a caret parked against the right edge of a centred
          // field reads as the field being full. iOS centres its own
          // correctly and takes no part in this.
          //
          // `caretHidden` and not a transparent `cursorColor`, which is what
          // this did first. A colour prop that goes back to `undefined` does
          // not reach the native side as "unset", so the colourFilter the
          // first keystroke was meant to lift stayed on the cursor drawable
          // and the caret never came back. caretHidden is a boolean, so
          // `false` is a value like any other and the caret returns with the
          // first digit.
          caretHidden={Boolean(drawnCaret)}
        />
        {/* The caret Android puts at the wrong edge, drawn where it belongs.
            It sits on the text's own centre — `inset-0` and a centred row,
            which is the same point the centred text is laid out around, keep
            the input's padding symmetric — and its 36x2dp is the native
            caret's own size for this type: measured 56px tall and 5px wide at
            2.25 px/dp in the 16dp phone field, 1.56em of its font. The
            overlay takes no touches, so the field still focuses through it.
            The bar's own size and colour are style props rather than classes
            because the node is `Animated`, and a class is not guaranteed to
            reach one: a caret that lands with no size is the bug this is here
            to fix. */}
        {drawnCaret && focused ? (
          <View
            pointerEvents="none"
            className="absolute inset-0 items-center justify-center"
          >
            <Animated.View
              style={{
                opacity: blink,
                width: 2,
                height: 36,
                backgroundColor: INK,
              }}
            />
          </View>
        ) : null}
        {suffix}
      </View>
      <FieldError message={error} />
    </View>
  );
}
