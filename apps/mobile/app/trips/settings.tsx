import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Section } from "@/components/ui/Section";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { useDismiss } from "@/hooks/useDismiss";
import { useTrip } from "@/lib/tripsStore";
import { toErrorCopy } from "@/lib/queries/errors";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useTripSettings } from "@/lib/tripSettingsStore";

/**
 * Your settings for one trip — Trip settings, and every member has
 * them. The organizer has a separate surface for the trip itself, called
 * Edit trip; this one is not that.
 *
 * Every row here is about you rather than about the trip: whether the
 * daily digest and the trip's messages reach you, whether the others can
 * see your number, and whether your calendar follows this trip. All of
 * them are server rows (`PATCH /trips/:tripId/my-settings` and the
 * notification pair beside it), and all of them are things you cannot
 * see from where you are standing.
 *
 * The run's own two switches are not here. Past events and grid-or-list
 * sit at the head of the run itself, because flipping one and watching
 * the page answer is the whole point of them, and the clock is the
 * header's zone token, on every screen that shows a time. A screen you
 * have to leave to flip a switch is a switch you flip blind.
 *
 * Each row is a label with its control at the far edge, which is what a
 * settings list is.
 */
export default function TripSettingsDialog() {
  return (
    <TripGate label="Loading trip settings">
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
  const {
    for: settingsFor,
    update,
    setSharePhone,
    setNotificationPreference,
  } = useTripSettings();
  const dismiss = useDismiss("/trips");
  const [failure, setFailure] = useState<string | null>(null);

  if (!trip) {
    return <NotFound />;
  }

  const settings = settingsFor(trip, new Date());

  // Server rows toggle optimistically (the store paints first) and
  // the failure reads here, in the screen's existing error style,
  // mapped through the same copies every other screen uses.
  async function saveServerRow(work: () => Promise<void>) {
    setFailure(null);
    try {
      await work();
    } catch (caught) {
      const copy = toErrorCopy(caught);
      if (copy.offline) {
        setFailure("You're offline. Check your connection and try again.");
      } else {
        setFailure(
          copy.message ?? "Couldn't save the setting. Try again.",
        );
      }
    }
  }

  return (
    <FullscreenDialog
      title="Loading trip settings"
      primaryTitle="Done"
      onPrimary={dismiss}
      dismissHref={`/trips/detail?id=${trip.id}`}
    >
      <Text className="font-body text-sm text-ink">{trip.title}</Text>

      {failure ? (
        <Text className="font-body text-sm text-ink">{failure}</Text>
      ) : null}

      <Section title="Notifications">
        <Row
          label="Daily itinerary"
          description="A summary of the day's events in the morning"
        >
          <ChipToggle
            label={settings.dailyItinerary ? "On" : "Off"}
            selected={settings.dailyItinerary}
            onPress={() =>
              void saveServerRow(() =>
                setNotificationPreference(trip.id, {
                  dailyItinerary: !settings.dailyItinerary,
                }),
              )
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
              void saveServerRow(() =>
                setNotificationPreference(trip.id, {
                  tripMessages: !settings.tripMessages,
                }),
              )
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
              void saveServerRow(() =>
                setSharePhone(trip.id, !settings.sharePhone),
              )
            }
          />
        </Row>
      </Section>

      {/* TODO(BE): `calendarIncluded` has no mobile write path: `PATCH /trips/:tripId/my-settings` covers only `sharePhone`; calendar exclusion lives in the calendar router. */}
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
