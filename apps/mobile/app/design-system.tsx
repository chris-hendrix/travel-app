import { useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { Link } from "expo-router";
import { AppHeader } from "@/components/ui/AppHeader";
import { ActionBar } from "@/components/ui/ActionBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { Accordion, AccordionItem } from "@/components/ui/Accordion";

const COLORS: Array<[name: string, token: string, hex: string, swatch: string]> = [
  ["Chrome", "ink", "#000000", "bg-ink"],
  ["Background", "sand", "#f5eacc", "bg-sand"],
  ["Muted", "gravel", "#e2ded5", "bg-gravel"],
  ["Surface", "paper", "#ffffff", "bg-paper"],
  ["Primary", "seafoam", "#42d177", "bg-seafoam"],
  ["Secondary", "watermelon", "#ef8ad4", "bg-watermelon"],
  ["Accent", "strawberry", "#ff6352", "bg-strawberry"],
  ["Info", "ocean", "#4281ff", "bg-ocean"],
  ["Highlight", "acid", "#cbfb6a", "bg-acid"],
];

const TYPE: Array<[name: string, token: string, use: string, face: string]> = [
  ["Display", "font-display", "Headlines. Short strings only.", "font-display"],
  ["Wordmark", "font-wordmark", "Journiful. Nowhere else.", "font-wordmark"],
  ["Body", "font-body", "Default text, dates, labels.", "font-body"],
  ["Strong", "font-body-bold", "Emphasis, buttons, badges.", "font-body-bold"],
  ["Aside", "font-body-italic", "Quotes, secondary info.", "font-body-italic"],
];

const VENUES = ["The Hall", "Zone One", "The Rooftop", "The Loft", "Full Venue"];

function Section({ title, children }: { title: string; children: ReactNode }) {
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

/** Exhibit frame: the live component, its contract, and its variants. */
function Specimen({
  name,
  contract,
  note,
  children,
}: {
  name: string;
  contract: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <View className="border border-ink bg-paper">
      <View className="gap-0 border-b border-ink p-4">
        <Text className="font-body-bold text-base text-ink">{name}</Text>
        <Text className="font-body text-sm text-ink">{contract}</Text>
        <Text className="font-body text-sm text-ink">{note}</Text>
      </View>
      <View className="gap-3 p-4">{children}</View>
    </View>
  );
}

export default function DesignSystem() {
  const [formName, setFormName] = useState("");
  const [venue, setVenue] = useState<string | null>(null);
  const [log, setLog] = useState("No interaction yet.");

  return (
    <ScrollView className="flex-1">
      <View className="gap-8 p-6">
        <View className="gap-1">
          <Text className="font-display text-4xl leading-tight text-ink">
            Design System
          </Text>
          <Text className="font-body text-base text-ink">
            v1 — tokens and components. Every component below is the real
            one, rendered live.
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
                  <Text className={`${face} w-24 text-2xl text-ink`}>Ag</Text>
                }
              />
            ))}
          </View>
        </Section>

        <Section title="Components">
          <View className="gap-4">
            <Specimen
              name="AppHeader"
              contract="title? · onClose? · action?"
              note="Title mode, shown here. Wordmark mode is the same component with no title, rendered globally above this page."
            >
              <AppHeader
                title="Notification settings"
                onClose={() => setLog("AppHeader onClose fired")}
              />
            </Specimen>

            <Specimen
              name="FullscreenDialog"
              contract="title · primaryTitle · onPrimary · children"
              note="Composes AppHeader and ActionBar into a route. It fills the screen by definition, so it cannot be previewed in a frame — open one."
            >
              <Link
                href="/notifications"
                className="font-body-bold text-base text-ink underline"
              >
                Open the notifications dialog
              </Link>
            </Specimen>

            <Specimen
              name="ActionBar"
              contract="primaryTitle · onPrimary · onBack · backTitle?"
              note="Pinned to the bottom of every dialog. One primary action, always."
            >
              <ActionBar
                primaryTitle="Save changes"
                onPrimary={() => setLog("ActionBar onPrimary fired")}
                onBack={() => setLog("ActionBar onBack fired")}
              />
            </Specimen>

            <Specimen
              name="Button"
              contract="title · variant? · onPress?"
              note="Primary confirms and commits. Secondary defers. Accent tags and labels."
            >
              <Button
                title="Create trip"
                variant="primary"
                onPress={() => setLog("Button primary fired")}
              />
              <Button
                title="Skip for now"
                variant="secondary"
                onPress={() => setLog("Button secondary fired")}
              />
              <Button
                title="Add to club night"
                variant="accent"
                onPress={() => setLog("Button accent fired")}
              />
            </Specimen>

            <Specimen
              name="Badge"
              contract="label · variant"
              note="Event type and status. Venue renders as plain text beside the pills."
            >
              <View className="flex-row flex-wrap items-center gap-2">
                <Badge label="club" variant="club" />
                <Badge label="live" variant="live" />
                <Badge label="sold out" variant="soldOut" />
                <Badge label="The Rooftop" variant="venue" />
              </View>
            </Specimen>

            <Specimen
              name="TextField"
              contract="label · value · onChangeText · placeholder? · error?"
              note="Every dialog that collects input uses this. Errors sit under the field, never in a toast."
            >
              <TextField
                label="Display name"
                value={formName}
                onChangeText={setFormName}
                placeholder="Ada Lovelace"
              />
              <TextField
                label="Phone"
                value="+1 555"
                onChangeText={() => setLog("TextField onChangeText fired")}
                error="Enter the full 10-digit number."
              />
            </Specimen>

            <Specimen
              name="Dropdown"
              contract="label · options · value · onChange · placeholder?"
              note="Single-select with autocomplete. The list expands inline — never a nested dialog."
            >
              <Dropdown
                label="Venue"
                options={VENUES}
                value={venue}
                onChange={(v) => {
                  setVenue(v);
                  setLog(`Dropdown committed "${v}"`);
                }}
                placeholder="Type to filter venues…"
              />
            </Specimen>

            <Specimen
              name="Accordion"
              contract="title · defaultOpen? · children"
              note="Disclosure for detail that would otherwise be a nested screen. Rules only — no card, no fill."
            >
              <Accordion>
                <AccordionItem title="Event description" defaultOpen>
                  <Text className="font-body text-base text-ink">
                    21+. Doors at 8, last entry 11.
                  </Text>
                </AccordionItem>
                <AccordionItem title="Who's coming">
                  <Text className="font-body text-base text-ink">
                    Dana, Rahul, and 2 unconfirmed.
                  </Text>
                </AccordionItem>
                <AccordionItem title="Getting there">
                  <Text className="font-body text-base text-ink">
                    12 min walk from the apartment.
                  </Text>
                </AccordionItem>
              </Accordion>
            </Specimen>

            <View className="border border-ink bg-paper p-4">
              <Text className="font-body-bold text-base text-ink">Events</Text>
              <Text className="font-body text-sm text-ink">{log}</Text>
            </View>
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
