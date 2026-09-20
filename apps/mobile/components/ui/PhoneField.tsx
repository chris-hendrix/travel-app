import { TextField } from "@/components/ui/TextField";
import { toE164 } from "@/lib/phone";

/**
 * A phone number, parsed.
 *
 * One field for the whole app: sign-in, and the invite dialog's row of
 * numbers. Both take the same shapes, which they did not before, and
 * both hand the API the same E.164.
 *
 * The label is drawn here unless the caller draws it. The invite dialog
 * draws its own, because a button shares the field's row and a label
 * inside that row would stretch the button to the label's height too.
 */
export function PhoneField({
  value,
  onChangeText,
  error,
  autoFocus = false,
  label,
  ariaLabel,
}: {
  value: string;
  onChangeText: (value: string) => void;
  error?: string | undefined;
  autoFocus?: boolean;
  /** Omitted when the caller draws the label itself. */
  label?: string | undefined;
  /** The input's own name, when the label is drawn elsewhere. */
  ariaLabel?: string | undefined;
}) {
  const unnamed = label === undefined && ariaLabel === undefined;

  return (
    <TextField
      label={unnamed ? "Phone number" : label}
      ariaLabel={ariaLabel}
      value={value}
      onChangeText={onChangeText}
      placeholder="(555) 123-4567"
      error={error}
      keyboardType="phone-pad"
      autoComplete="tel"
      textContentType="telephoneNumber"
      maxLength={20}
      autoFocus={autoFocus}
    />
  );
}

/** Re-exported so a caller that only needs the number reads one import. */
export { toE164 };
