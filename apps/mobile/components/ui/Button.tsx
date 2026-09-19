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
      <Text className={`font-body-bold ${s.label}`}>{title}</Text>
    </Pressable>
  );
}
