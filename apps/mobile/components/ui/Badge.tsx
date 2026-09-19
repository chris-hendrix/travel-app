import { Text, View } from "react-native";

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
}: {
  label: string;
  variant: BadgeVariant;
  size?: keyof typeof SIZES;
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
    <View className={`rounded-full ${z.box} ${s.box}`}>
      <Text className={`font-body-bold ${z.label} ${s.label}`}>{label}</Text>
    </View>
  );
}
