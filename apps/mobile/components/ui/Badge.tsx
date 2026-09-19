import { Text, View } from "react-native";

export type BadgeVariant = "club" | "live" | "soldOut" | "venue";

const STYLES: Record<BadgeVariant, { box: string; label: string }> = {
  club: { box: "bg-watermelon", label: "text-ink" },
  live: { box: "bg-strawberry", label: "text-ink" },
  soldOut: { box: "bg-ink", label: "text-sand" },
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
