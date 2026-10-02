import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import type { ButtonVariant } from "@/components/ui/Button";

/**
 * A phone number and the button that acts on it.
 *
 * The one place a `Button` shares a row with something, and the reason
 * it is a primitive: the invite dialog and a member's detail page are the
 * same row written twice, and both wrote the same two things by hand —
 * a field, and a button detached from the box rather than a word inside
 * it. A word in the box reads as the value's last word.
 *
 * `items-stretch` is the load-bearing class: it is what makes the box and
 * the button one height. The button is `md:self-start` by default, which
 * in a row hugs the cross axis and sits high, so the two boxes end at two
 * different lines. That is the bug this file exists to make un-repeatable.
 *
 * The button is the one control in the app that sits beside a field
 * rather than under it, which is also why the app's rule — no two content
 * buttons side by side — does not apply here. There is only ever one.
 */
export function PhoneFieldAction({
  value,
  onChangeText,
  error,
  label,
  ariaLabel,
  submitTitle,
  onSubmit,
  submitVariant = "accent",
  submitDisabled = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  error?: string | undefined;
  /** Omitted when the caller draws the label itself — which both
   *  call sites do, because a label inside this row stretches the
   *  button to the label's height too. */
  label?: string | undefined;
  /** The input's own name, when the label is drawn elsewhere. */
  ariaLabel?: string | undefined;
  submitTitle: string;
  onSubmit: () => void;
  submitVariant?: ButtonVariant;
  /** The submit is disabled for its own reasons — a field that has not
   *  parsed, a request already in flight — not because this row is
   *  read-only, so it is not the same condition as the field's. */
  submitDisabled?: boolean;
}) {
  return (
    <View className="flex-row items-stretch gap-3">
      <View className="flex-1">
        <PhoneField
          label={label}
          ariaLabel={ariaLabel}
          value={value}
          onChangeText={onChangeText}
          error={error}
        />
      </View>
      <Button
        title={submitTitle}
        variant={submitVariant}
        disabled={submitDisabled}
        onPress={onSubmit}
      />
    </View>
  );
}
