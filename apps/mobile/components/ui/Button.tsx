import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useMotion } from "@/hooks/useMotion";

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
  /**
   * Fill the container at every size, suspending the rule below.
   *
   * Two callers, and both are the same situation: a control whose width
   * is not its own choice. `DisclosureButton`'s trigger has to match the
   * rows it opens, which are the group's widest child; the trip hero
   * band's buttons fill the column the hero picture sets, because that
   * band is the one block in the app with its own hierarchy and full-width
   * boxes in it line up on one edge. Every other button fills a phone and
   * hugs its edge from md up.
   */
  fullWidth?: boolean;
  /** Which edge it hugs on wide screens. Fills the width on a phone,
   *  where a thumb target beats a tidy box. */
  align?: "start" | "end";
  /** Present but not yet available. Kept in place rather than hidden:
   *  a control that vanishes leaves nothing to aim at. */
  disabled?: boolean;
  /**
   * An affordance at the far edge. `DisclosureButton`'s triangle is the only
   * caller, and it is the one thing a label cannot say on its own: that the
   * button opens. Parked rather than laid out, so the label stays centred —
   * a trailing node that took layout space would push it off-centre and make
   * one button in a stack of them read as a different kind of control. Keep
   * the label short enough not to reach the far edge.
   */
  trailing?: ReactNode;
  /**
   * This button discloses something under it. Left off every button that
   * does not, so the state is announced only where it is true.
   */
  expanded?: boolean;
}) {
  const s = STYLES[variant];
  const motion = useMotion();
  const width = fullWidth
    ? ""
    : align === "end"
      ? "md:self-end"
      : "md:self-start";

  return (
    <Pressable
      role="button"
      aria-disabled={disabled}
      aria-expanded={expanded}
      disabled={disabled}
      onPress={onPress}
      className={`relative items-center border p-4 ${s.box} ${width} ${
        disabled ? "opacity-40" : ""
      } ${motion.press}`}
    >
      {/* Pinned at text-sm rather than inherited: everything interactive
          in this system — buttons, badges, an RSVP — is one size, and
          without this the label took whatever react-native's default
          happened to be and quietly disagreed with the control beside
          it. */}
      <Text className={`font-body-bold text-sm ${s.label}`}>{title}</Text>
      {trailing === undefined ? null : (
        <View className="absolute bottom-0 right-4 top-0 justify-center">
          {trailing}
        </View>
      )}
    </Pressable>
  );
}
