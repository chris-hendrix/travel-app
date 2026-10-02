import { Text, View } from "react-native";

import { POP_FILL, type PopHue } from "@/lib/eventColors";

export type BadgeVariant =
  | "club"
  | "live"
  | "soldOut"
  | "category"
  | "outline"
  | "venue";

/**
 * Roles, not colours: two roles may share a tone — a thing that is over
 * and a thing that is categorised are both said in ink.
 */
const STYLES: Record<BadgeVariant, { box: string; label: string }> = {
  club: { box: "bg-watermelon", label: "text-ink" },
  live: { box: "bg-strawberry", label: "text-ink" },
  soldOut: { box: "bg-ink", label: "text-sand" },
  category: { box: "bg-ink", label: "text-sand" },
  outline: { box: "border border-ink", label: "text-ink" },
  venue: { box: "bg-transparent", label: "text-ink" },
};

/**
 * Two sizes, because a chip sits at two distances: the ones in the
 * content — an event's type, a countdown — are read, and the ones
 * attached to a name in a list are glanced at. A size rather than a
 * second chip: one pill with a scale beats two components that have to
 * be kept looking like each other.
 */
const SIZES = {
  md: { box: "px-3 py-1", label: "text-sm" },
  sm: { box: "px-2 py-0.5", label: "text-xs" },
} as const;

export function Badge({
  label,
  variant,
  size = "md",
  hue,
}: {
  label: string;
  variant: BadgeVariant;
  size?: keyof typeof SIZES;
  /**
   * A pop fill, for a `category` chip that classifies a *kind* of thing.
   *
   * Absent means ink, which is what every category wore before this existed
   * and what a state badge always wears — `soldOut` closes a thing, and a
   * closed thing should not be wearing the colour of a party. The two are
   * different questions, so `hue` is opt-in per caller rather than implied
   * by the variant.
   *
   * The label stays ink on every hue. A pop fill is a light, saturated
   * ground and ink is the only token in the palette that clears body
   * contrast on all of them; a coloured label on a coloured chip is the
   * combination the palette's rule table exists to prevent.
   */
  hue?: PopHue | undefined;
}) {
  const s = STYLES[variant];
  const z = SIZES[size];

  if (variant === "venue") {
    return (
      <Text className={`font-body self-center ${z.label} text-ink`}>
        {label}
      </Text>
    );
  }

  return (
    <View className={`rounded-full ${z.box} ${hue ? POP_FILL[hue] : s.box}`}>
      <Text className={`font-body-bold ${z.label} ${hue ? "text-ink" : s.label}`}>
        {label}
      </Text>
    </View>
  );
}
