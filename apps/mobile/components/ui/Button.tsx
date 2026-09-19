import { Pressable, Text } from "react-native";

export type ButtonVariant = "primary" | "secondary" | "accent";

const STYLES: Record<ButtonVariant, { box: string; label: string }> = {
  primary: { box: "border-ink bg-seafoam", label: "text-ink" },
  secondary: { box: "border-ink bg-transparent", label: "text-ink" },
  accent: { box: "border-transparent bg-watermelon", label: "text-ink" },
};

export function Button({
  title,
  variant = "primary",
  onPress,
  fullWidth = false,
}: {
  title: string;
  variant?: ButtonVariant;
  onPress?: () => void;
  /** Hugs its content on wide screens; fills the width on a phone,
   *  where a thumb target beats a tidy box. Pass true to always fill. */
  fullWidth?: boolean;
}) {
  const s = STYLES[variant];
  return (
    <Pressable
      onPress={onPress}
      className={`items-center border p-4 ${s.box} ${
        fullWidth ? "" : "md:self-start"
      }`}
    >
      <Text className={`font-body-bold ${s.label}`}>{title}</Text>
    </Pressable>
  );
}
