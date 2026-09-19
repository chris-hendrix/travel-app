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

export function Badge({
  label,
  variant,
}: {
  label: string;
  variant: BadgeVariant;
}) {
  const s = STYLES[variant];
  if (variant === "venue") {
    return (
      <Text className={`font-body self-center text-sm ${s.label}`}>
        {label}
      </Text>
    );
  }
  return (
    <View className={`rounded-full px-3 py-1 ${s.box}`}>
      <Text className={`font-body-bold text-sm ${s.label}`}>{label}</Text>
    </View>
  );
}
