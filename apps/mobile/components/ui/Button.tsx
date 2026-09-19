import { Pressable, Text } from "react-native";

export type ButtonVariant = "primary" | "secondary" | "accent" | "danger";

const STYLES: Record<ButtonVariant, { box: string; label: string }> = {
  primary: { box: "border-ink bg-seafoam", label: "text-ink" },
  secondary: { box: "border-ink bg-transparent", label: "text-ink" },
  accent: { box: "border-transparent bg-watermelon", label: "text-ink" },
  // The alert colour, shared with the live badge: a thing you cannot
  // take back should not look like the thing next to it that you can.
  danger: { box: "border-transparent bg-strawberry", label: "text-ink" },
};

export function Button({
  title,
  variant = "primary",
  onPress,
  fullWidth = false,
  align = "start",
}: {
  title: string;
  variant?: ButtonVariant;
  onPress?: () => void;
  /** Always fill the width, at every size. */
  fullWidth?: boolean;
  /** Which edge it hugs on wide screens. Fills the width on a phone,
   *  where a thumb target beats a tidy box. */
  align?: "start" | "end";
}) {
  const s = STYLES[variant];
  const width = fullWidth
    ? ""
    : align === "end"
      ? "md:self-end"
      : "md:self-start";

  return (
    <Pressable
      onPress={onPress}
      className={`items-center border p-4 ${s.box} ${width}`}
    >
      {/* Pinned at text-sm rather than inherited: everything interactive
          in this system — buttons, badges, an RSVP — is one size, and
          without this the label took whatever react-native's default
          happened to be and quietly disagreed with the control beside
          it. */}
      <Text className={`font-body-bold text-sm ${s.label}`}>{title}</Text>
    </Pressable>
  );
}
