import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Section } from "@/components/ui/Section";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { useDismiss } from "@/hooks/useDismiss";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import {
  useTripSettings,
  type Clock,
  type Layout,
} from "@/lib/tripSettingsStore";

const CLOCKS: Array<{ value: Clock; label: string }> = [
  { value: "trip", label: "Trip time" },
  { value: "device", label: "Your time" },
];

const LAYOUTS: Array<{ value: Layout; label: string }> = [
  { value: "cards", label: "Cards" },
  { value: "list", label: "List" },
];

/**
 * Your settings for one trip — Trip settings, and every member has
 * them. The organizer has a separate surface for the trip itself, called
 * Edit trip; this one is not that.
 *
 * Named for the itinerary because everything here answers something
 * about it: how far down it you read, whose clock its times are on, how
 * it is laid out, and whether the daily digest or the message alerts
 * reach you at all.
 *
 * Two sections, and each row is a label with its control at the far
 * edge, which is what a settings list is. The controls used to sit at
 * the head of the itinerary itself, where on a phone they cost three
 * rows before any content.
 */
export default function TripSettingsDialog() {
  return (
    <TripGate label="Trip settings">
      <TripSettingsScreen />
    </TripGate>
  );
}

function TripSettingsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tripId = typeof id === "string" ? id : undefined;
  // The trip read moves to the detail query; the settings
  // write-through is Task 6's territory and stays as-is here.
  const { trip } = useTrip(tripId);
  const { for: settingsFor, update } = useTripSettings();
  const dismiss = useDismiss("/trips");

  if (!trip) {
    return <NotFound />;
  }

  const settings = settingsFor(trip, new Date());

  return (
    <FullscreenDialog
      title="Trip settings"
      primaryTitle="Done"
      onPrimary={dismiss}
      dismissHref={`/trips/detail?id=${trip.id}`}
    >
      <Text className="font-body text-sm text-ink">{trip.title}</Text>

      <Section title="Itinerary">
        <Row label="Past events">
          <ChipToggle
            label={settings.showPast ? "On" : "Off"}
            selected={settings.showPast}
            onPress={() => update(trip.id, { showPast: !settings.showPast })}
          />
        </Row>

        <Row label="Times">
          <View className="flex-row items-center gap-3">
            {CLOCKS.map((option) => (
              <ChipToggle
                key={option.value}
                label={option.label}
                selected={settings.clock === option.value}
                onPress={() => update(trip.id, { clock: option.value })}
              />
            ))}
          </View>
        </Row>

        <Row label="Layout">
          <View className="flex-row items-center gap-3">
            {LAYOUTS.map((option) => (
              <ChipToggle
                key={option.value}
                label={option.label}
                selected={settings.layout === option.value}
                onPress={() => update(trip.id, { layout: option.value })}
              />
            ))}
          </View>
        </Row>

        <Text className="font-body text-sm text-ink">
          This trip runs on {trip.preferredTimezone}.
        </Text>
      </Section>

      {/* The web dialog's ground, which is all per user per trip: the
          notification pair from the server's notification_preferences,
          phone sharing from the member row, calendar from the same row
          said the other way round, and a push permission that is the
          device's to grant. */}
      <Section title="Notifications">
        <Row
          label="Daily itinerary"
          description="A summary of the day's events in the morning"
        >
          <ChipToggle
            label={settings.dailyItinerary ? "On" : "Off"}
            selected={settings.dailyItinerary}
            onPress={() =>
              update(trip.id, { dailyItinerary: !settings.dailyItinerary })
            }
          />
        </Row>

        <Row
          label="Trip messages"
          description="When someone posts to the trip"
        >
          <ChipToggle
            label={settings.tripMessages ? "On" : "Off"}
            selected={settings.tripMessages}
            onPress={() =>
              update(trip.id, { tripMessages: !settings.tripMessages })
            }
          />
        </Row>

        <Row
          label="Push notifications"
          description="Your device asks the first time you turn this on"
        >
          <ChipToggle
            label={settings.pushEnabled ? "On" : "Off"}
            selected={settings.pushEnabled}
            onPress={() =>
              update(trip.id, { pushEnabled: !settings.pushEnabled })
            }
          />
        </Row>

        <Text className="font-body text-sm text-ink">
          Notifications reach you in the app, by push, and by text.
        </Text>
      </Section>

      <Section title="Privacy">
        <Row
          label="Share phone number"
          description="The others on this trip can see your number"
        >
          <ChipToggle
            label={settings.sharePhone ? "On" : "Off"}
            selected={settings.sharePhone}
            onPress={() =>
              update(trip.id, { sharePhone: !settings.sharePhone })
            }
          />
        </Row>
      </Section>

      <Section title="Calendar">
        <Row
          label="Include in calendar"
          description="Your subscription follows changes to this trip"
        >
          <ChipToggle
            label={settings.calendarIncluded ? "On" : "Off"}
            selected={settings.calendarIncluded}
            onPress={() =>
              update(trip.id, { calendarIncluded: !settings.calendarIncluded })
            }
          />
        </Row>
      </Section>
    </FullscreenDialog>
  );
}


/**
 * A setting: its name and why you would want it on the left, whatever
 * sets it at the far edge. The second line is not decoration — a switch
 * that says "Trip messages" and nothing else asks you to guess what
 * arrives.
 */
function Row({
  label,
  description,
  children,
}: {
  label: string;
  /** Omitted where the name says it: "Past events" needs no gloss. */
  description?: string;
  children: ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <View className="flex-1 gap-1">
        <Text className="font-body text-base text-ink">{label}</Text>
        {description ? (
          <Text className="font-body text-sm text-ink">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}
