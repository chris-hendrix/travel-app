import { Text, View, useWindowDimensions } from "react-native";
import { Link } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { emailSchema } from "@journiful/shared/schemas";

const goodResult = emailSchema.safeParse("test@example.com").success
  ? "valid"
  : "invalid";

const SWATCHES = [
  ["bg-seafoam", "seafoam"],
  ["bg-watermelon", "watermelon"],
  ["bg-strawberry", "strawberry"],
  ["bg-ink", "ink"],
  ["bg-ocean", "ocean"],
  ["bg-acid", "acid"],
] as const;

export default function Index() {
  const { width } = useWindowDimensions();
  const viewport = width >= 768 ? "wide" : "phone";

  return (
    <Screen>
      <View className="gap-4 p-6">
        {/* Display face — pixel caps, short headlines only */}
        <Text className="font-display text-5xl leading-tight text-ink">
          Journiful
        </Text>
        <Text className="font-body-bold text-2xl leading-snug text-ink">
          Zack Fox Presents: Uway
        </Text>
        <Text className="font-body text-lg leading-snug text-ink">
          Group trips, coordinated. Body copy sets in Archivo regular.
        </Text>
        <Text className="font-body-bold text-lg text-ink">
          Bold for emphasis, never for headlines.
        </Text>
        <Text className="font-body-italic text-lg text-ink">
          Italic for asides and quotes.
        </Text>

        {/* Badges — pill type, plain venue */}
        <View className="flex-row gap-2">
          <View className="rounded-full bg-watermelon px-3 py-1">
            <Text className="font-body-bold text-sm text-ink">club</Text>
          </View>
          <View className="rounded-full bg-strawberry px-3 py-1">
            <Text className="font-body-bold text-sm text-ink">live</Text>
          </View>
          <Text className="font-body self-center text-sm text-ink">
            The Rooftop
          </Text>
        </View>

        {/* Square button — pill on hover is a web-only flourish */}
        <View className="items-center border border-ink bg-watermelon p-4">
          <Text className="font-body-bold text-ink">Buy Tickets</Text>
        </View>

        {/* Palette strip */}
        <View className="flex-row flex-wrap gap-2">
          {SWATCHES.map(([bg, name]) => (
            <View key={name} className="items-center gap-1">
              <View className={`h-10 w-10 ${bg}`} />
              <Text className="font-body text-xs text-ink">{name}</Text>
            </View>
          ))}
        </View>

        {/* Plumbing proof — kept, restyled */}
        <Text className="font-body text-sm text-ink">
          Shared import resolves: {goodResult}
        </Text>
        <Text className="font-body text-sm text-ink">
          Viewport: {viewport}
        </Text>
        <Link href="/design" className="font-body-bold text-sm text-ink">
          Design system →
        </Link>
      </View>
    </Screen>
  );
}
