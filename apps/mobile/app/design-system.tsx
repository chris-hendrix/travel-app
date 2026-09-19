import { useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { Dropdown } from "@/components/ui/Dropdown";

const COLORS: Array<[name: string, token: string, hex: string, swatch: string]> = [
  ["Background", "sand", "#f5eacc", "bg-sand"],
  ["Surface", "paper", "#ffffff", "bg-paper"],
  ["Ink", "ink", "#000000", "bg-ink"],
  ["Muted", "gravel", "#e2ded5", "bg-gravel"],
  ["Primary", "seafoam", "#42d177", "bg-seafoam"],
  ["Secondary", "watermelon", "#ef8ad4", "bg-watermelon"],
  ["Accent", "strawberry", "#ff6352", "bg-strawberry"],
  ["Info", "ocean", "#4281ff", "bg-ocean"],
  ["Highlight", "acid", "#cbfb6a", "bg-acid"],
  ["Neutral", "concrete", "#b0ad9b", "bg-concrete"],
  ["Faint", "silver", "#b3b3b3", "bg-silver"],
  ["Violet", "amethyst", "#8f8fb3", "bg-amethyst"],
  ["Sky", "babyblue", "#9adee4", "bg-babyblue"],
  ["Blush", "brandpink", "#ffd1ed", "bg-brandpink"],
];

const TYPE: Array<[name: string, token: string, use: string, face: string]> = [
  ["Display", "font-display", "Headlines, logo. Short strings only.", "font-display"],
  ["Body", "font-body", "Default text, dates, labels.", "font-body"],
  ["Strong", "font-body-bold", "Emphasis, buttons, badges.", "font-body-bold"],
  ["Aside", "font-body-italic", "Quotes, secondary info.", "font-body-italic"],
];

const COMPONENTS: Array<[name: string, variants: string, use: string]> = [
  ["AppHeader", "title · back · action", "Top bar for every screen."],
  ["FullscreenDialog", "—", "Route-based dialog scaffold. Dialogs switch screens, never stack."],
  ["ActionBar", "—", "Pinned bottom bar: Back + one primary action."],
  ["Button", "Primary · Secondary · Accent", "The only action control."],
  ["Badge", "club · live · soldOut · venue", "Event type and status tags."],
  ["TextField", "label · error", "Text input with label and inline error."],
  ["Dropdown", "autocomplete", "Single-select with type-to-filter inline list. Never a nested dialog."],
];

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

function TokenRow({
  name,
  token,
  detail,
  right,
}: {
  name: string;
  token: string;
  detail: string;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3 border-b border-gravel py-2">
      {right}
      <View className="flex-1 gap-0">
        <Text className="font-body-bold text-base text-ink">{name}</Text>
        <Text className="font-body text-sm text-ink">{detail}</Text>
      </View>
      <Text className="font-body text-sm text-ink">{token}</Text>
    </View>
  );
}

const VENUES = ["The Hall", "Zone One", "The Rooftop", "The Loft", "Full Venue"];

export default function DesignSystem() {
  const [venue, setVenue] = useState<string | null>(null);

  return (
    <ScrollView className="flex-1 bg-sand">
      <Stack.Screen options={{ title: "Design System" }} />
      <View className="gap-8 p-6">
        <View className="gap-1">
          <Text className="font-display text-4xl leading-tight text-ink">
            Design System
          </Text>
          <Text className="font-body text-base text-ink">
            v0 — named tokens and components. Single source: global.css
            @theme.
          </Text>
        </View>

        <Section title="Color">
          <View>
            {COLORS.map(([name, token, hex, swatch]) => (
              <TokenRow
                key={token}
                name={name}
                token={token}
                detail={hex}
                right={<View className={`h-8 w-8 ${swatch}`} />}
              />
            ))}
          </View>
        </Section>

        <Section title="Type">
          <View>
            {TYPE.map(([name, token, use, face]) => (
              <TokenRow
                key={token}
                name={name}
                token={token}
                detail={use}
                right={
                  <Text className={`${face} w-24 text-2xl text-ink`}>
                    Ag
                  </Text>
                }
              />
            ))}
          </View>
        </Section>

        <Section title="Components">
          <View>
            {COMPONENTS.map(([name, variants, use]) => (
              <TokenRow
                key={name}
                name={name}
                token={variants}
                detail={use}
              />
            ))}
          </View>
        </Section>

        <Section title="Try it">
          <Dropdown
            label="Venue"
            options={VENUES}
            value={venue}
            onChange={setVenue}
            placeholder="Type to filter venues…"
          />
          {venue ? (
            <Text className="font-body text-base text-ink">
              Selected: {venue}
            </Text>
          ) : null}
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
