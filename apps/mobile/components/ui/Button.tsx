import { Pressable, Text } from "react-native";

export type ButtonVariant = "primary" | "secondary" | "accent";

const STYLES: Record<ButtonVariant, { box: string; label: string }> = {
  primary: { box: "border-ink bg-watermelon", label: "text-ink" },
  secondary: { box: "border-ink bg-transparent", label: "text-ink" },
  accent: { box: "border-transparent bg-strawberry", label: "text-ink" },
};

export function Button({
  title,
  variant = "primary",
  onPress,
}: {
  title: string;
  variant?: ButtonVariant;
  onPress?: () => void;
}) {
  const s = STYLES[variant];
  return (
    <Pressable
      onPress={onPress}
      className={`items-center border p-4 ${s.box}`}
    >
      <Text className={`font-body-bold ${s.label}`}>{title}</Text>
    </Pressable>
  );
}
