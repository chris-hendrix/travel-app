import { useState, type ReactNode } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";

const COLORS = [
  ["bg-sand", "sand", "#f5eacc", "text-ink"],
  ["bg-ink", "ink", "#000000", "text-sand"],
  ["bg-gravel", "gravel", "#e2ded5", "text-ink"],
  ["bg-seafoam", "seafoam", "#42d177", "text-ink"],
  ["bg-watermelon", "watermelon", "#ef8ad4", "text-ink"],
  ["bg-strawberry", "strawberry", "#ff6352", "text-ink"],
  ["bg-concrete", "concrete", "#b0ad9b", "text-ink"],
  ["bg-ocean", "ocean", "#4281ff", "text-sand"],
  ["bg-amethyst", "amethyst", "#8f8fb3", "text-ink"],
  ["bg-babyblue", "baby blue", "#9adee4", "text-ink"],
  ["bg-brandpink", "brand pink", "#ffd1ed", "text-ink"],
  ["bg-acid", "acid", "#cbfb6a", "text-ink"],
] as const;

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-3">
      <Text className="font-body-bold text-sm uppercase tracking-widest text-ink">
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function DesignSystem() {
  const [headline, setHeadline] = useState("Zack Fox Presents: Uway");

  return (
    <ScrollView className="flex-1 bg-sand">
      <Stack.Screen options={{ title: "Design System" }} />
      <View className="gap-8 p-6">
        <View className="gap-1">
          <Text className="font-display text-4xl leading-tight text-ink">
            Design System
          </Text>
          <Text className="font-body text-base text-ink">
            v0 — tokens and components. Single source: global.css @theme.
          </Text>
        </View>

        <Section title="Headline playground">
          <TextInput
            className="font-body border border-ink bg-paper p-3 text-base text-ink"
            value={headline}
            onChangeText={setHeadline}
            placeholder="Type a headline…"
            placeholderTextColor="#707070"
          />
          <Text className="font-display text-4xl leading-tight text-ink">
            {headline || "Type above…"}
          </Text>
        </Section>

        <Section title="Color">
          <View className="flex-row flex-wrap gap-2">
            {COLORS.map(([bg, name, hex, fg]) => (
              <View key={name} className="w-24 gap-1">
                <View className={`h-16 w-24 items-end justify-end p-1 ${bg}`}>
                  <Text className={`font-body text-xs ${fg}`}>{hex}</Text>
                </View>
                <Text className="font-body text-xs text-ink">{name}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Type">
          <Text className="font-display text-3xl leading-tight text-ink">
            DotGothic16 — headlines only
          </Text>
          <Text className="font-body text-lg leading-snug text-ink">
            Space Mono regular — body copy, dates, labels.
          </Text>
          <Text className="font-body-bold text-lg text-ink">
            Space Mono bold — emphasis, buttons, badges.
          </Text>
          <Text className="font-body-italic text-lg text-ink">
            Space Mono italic — asides and quotes.
          </Text>
        </Section>

        <Section title="Badges">
          <View className="flex-row flex-wrap gap-2">
            <View className="rounded-full bg-watermelon px-3 py-1">
              <Text className="font-body-bold text-sm text-ink">club</Text>
            </View>
            <View className="rounded-full bg-strawberry px-3 py-1">
              <Text className="font-body-bold text-sm text-ink">live</Text>
            </View>
            <View className="rounded-full bg-ink px-3 py-1">
              <Text className="font-body-bold text-sm text-sand">
                sold out
              </Text>
            </View>
            <Text className="font-body self-center text-sm text-ink">
              The Rooftop
            </Text>
          </View>
        </Section>

        <Section title="Buttons">
          <View className="items-center border border-ink bg-watermelon p-4">
            <Text className="font-body-bold text-ink">Buy Tickets</Text>
          </View>
          <View className="items-center border border-transparent bg-strawberry p-4">
            <Text className="font-body-bold text-ink">Buy Tickets</Text>
          </View>
          <View className="items-center border border-ink bg-transparent p-4">
            <Text className="font-body-bold text-ink">Buy Tickets</Text>
          </View>
        </Section>

        <Section title="Parking lot">
          <Text className="font-body text-base text-ink">
            Itinerary day rows · photo cards · travel cards · invite flow —
            not yet designed. They land here first as components, then in
            screens.
          </Text>
        </Section>
      </View>
    </ScrollView>
  );
}
