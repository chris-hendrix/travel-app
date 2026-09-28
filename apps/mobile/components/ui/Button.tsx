import type { ReactNode } from "react";
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
  disabled = false,
  trailing,
  expanded,
}: {
  title: string;
  variant?: ButtonVariant;
  onPress?: () => void;
  /** Always fill the width, at every size. */
  fullWidth?: boolean;
  /** Which edge it hugs on wide screens. Fills the width on a phone,
   *  where a thumb target beats a tidy box. */
  align?: "start" | "end";
  /** Present but not yet available. Kept in place rather than hidden:
   *  a control that vanishes leaves nothing to aim at. */
  disabled?: boolean;
  /**
   * An affordance at the far edge, which moves the label to the near one.
   * `DisclosureButton`'s triangle is the only caller, and it is the one
   * thing a label cannot say on its own: that the button opens.
   */
  trailing?: ReactNode;
  /**
   * This button discloses something under it. Left off every button that
   * does not, so the state is announced only where it is true.
   */
  expanded?: boolean;
}) {
  const s = STYLES[variant];
  const width = fullWidth
    ? ""
    : align === "end"
      ? "md:self-end"
      : "md:self-start";
  // A row only when there is something at the far edge. A lone label stays
  // centred in its box, which is what every other button in the system is.
  const flow =
    trailing === undefined
      ? "items-center"
      : "flex-row items-center justify-between gap-4";

  return (
    <Pressable
      role="button"
      aria-disabled={disabled}
      aria-expanded={expanded}
      disabled={disabled}
      onPress={onPress}
      className={`${flow} border p-4 ${s.box} ${width} ${
        disabled ? "opacity-40" : ""
      }`}
    >
      {/* Pinned at text-sm rather than inherited: everything interactive
          in this system — buttons, badges, an RSVP — is one size, and
          without this the label took whatever react-native's default
          happened to be and quietly disagreed with the control beside
          it. */}
      <Text className={`font-body-bold text-sm ${s.label}`}>{title}</Text>
      {trailing}
    </Pressable>
  );
}
