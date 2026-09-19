import { Text, View, useWindowDimensions } from "react-native";
import { emailSchema } from "@journiful/shared/schemas";

const goodResult = emailSchema.safeParse("test@example.com").success
  ? "valid"
  : "invalid";

export default function Index() {
  const { width } = useWindowDimensions();
  const viewport = width >= 768 ? "wide" : "phone";

  return (
    <View className="flex-1 items-center justify-center bg-proof-bg">
      <Text>Expo mockup scaffold</Text>
      <View className="flex-row items-center">
        <View className="h-4 w-4 bg-proof-accent" />
        <Text>Token applies</Text>
      </View>
      <Text>Shared import resolves: {goodResult}</Text>
      <Text>Viewport: {viewport}</Text>
    </View>
  );
}
