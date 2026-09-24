import { useEffect, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Section } from "@/components/ui/Section";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { useDismiss } from "@/hooks/useDismiss";
import { useTrip } from "@/lib/tripsStore";
import { toErrorCopy } from "@/lib/queries/errors";
import {
  mySettingsOptions,
  notificationPreferencesOptions,
} from "@/lib/queries/trip-settings";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useTripSettings } from "@/lib/tripSettingsStore";

/**
 * Your settings for one trip — Trip settings, and every member has
 * them. The organizer has a separate surface for the trip itself,
 * called Edit trip; this one is not that.
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
    hydrate,
    isBusy,
    setSharePhone,
    setCalendarIncluded,
    setNotificationPreference,
  } = useTripSettings();
  const dismiss = useDismiss("/trips");
  const [failure, setFailure] = useState<string | null>(null);

  // The server-backed rows, read through the query layer beside the
  // device-local store: the screen paints the fallbacks first, and a
  // successful read wins over them. A pending or failed read never
  // reaches `hydrate`, so the fallbacks stand rather than flashing a
  // value the server never held.
  const { data: mySettings } = useQuery({
    ...mySettingsOptions(tripId ?? ""),
    enabled: tripId !== undefined,
  });
  const { data: notificationPreferences } = useQuery({
    ...notificationPreferencesOptions(tripId ?? ""),
    enabled: tripId !== undefined,
  });

  useEffect(() => {
    if (tripId === undefined || mySettings === undefined) return;
    hydrate(tripId, {
      sharePhone: mySettings.sharePhone,
      calendarIncluded: !mySettings.calendarExcluded,
    });
  }, [tripId, mySettings, hydrate]);

  useEffect(() => {
    if (tripId === undefined || notificationPreferences === undefined) return;
    hydrate(tripId, { ...notificationPreferences });
  }, [tripId, notificationPreferences, hydrate]);

  if (!trip) {
    return <NotFound />;
  }

  // A write in flight quiets its row: the store drops a second press
  // on the same field, and the disabled chip tells the thumb first.
  const busy = trip ? isBusy(trip.id) : false;

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
      title="Trip settings"
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
            disabled={busy}
            onPress={() =>
              void saveServerRow(() =>
                setNotificationPreference(trip.id, {
                  dailyItinerary: !settings.dailyItinerary,
                }),
              )
            }
          />
        </Row>

        {/* "Trip messages" stays even though there is no chat surface: the
            toggle writes a real server notification preference
            (`trip_messages`), and deleting it would drop working server
            state. The description is delivery-only for the same reason — it
            says when the notice arrives, not where the thread lives. */}
        <Row
          label="Trip messages"
          description="Get notified when someone posts to the trip"
        >
          <ChipToggle
            label={settings.tripMessages ? "On" : "Off"}
            selected={settings.tripMessages}
            disabled={busy}
            onPress={() =>
              void saveServerRow(() =>
                setNotificationPreference(trip.id, {
                  tripMessages: !settings.tripMessages,
                }),
              )
            }
          />
        </Row>

        {/* No push switch. There was one, and its own copy promised the
            device would ask permission the first time it was turned on —
            while the handler wrote a boolean into a store that nothing
            reads, with no permission request, no device token and no
            registration call behind it (`app.json` carries no
            notification plugin). A control that reports success and does
            nothing is worse than an absent one, and this is the same
            reason `disabled` in this system means "real, its input is not
            here yet": a push switch with no push behind it is neither.
            It comes back in ten lines, on the day push does. */}

        <Text className="font-body text-sm text-ink">
          Notifications reach you in the app, and invitations by text.
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
            disabled={busy}
            onPress={() =>
              void saveServerRow(() =>
                setSharePhone(trip.id, !settings.sharePhone),
              )
            }
          />
        </Row>
      </Section>

      {/* The per-trip half of the calendar feed, through its own
          endpoint — not the my-settings PATCH, which is what the TODO
          that used to sit here assumed and stopped at. The server has
          filtered the feed on this flag all along, and the web app has
          called this route since before this screen existed. */}
      <Section title="Calendar">
        <Row
          label="Include in calendar"
          description="Your subscription follows changes to this trip"
        >
          <ChipToggle
            label={settings.calendarIncluded ? "On" : "Off"}
            selected={settings.calendarIncluded}
            disabled={busy}
            onPress={() =>
              void saveServerRow(() =>
                setCalendarIncluded(trip.id, !settings.calendarIncluded),
              )
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
