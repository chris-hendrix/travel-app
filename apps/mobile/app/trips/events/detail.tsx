import { RuledBlock } from "@/components/ui/RuledBlock";
import { Linking, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { Badge } from "@/components/ui/Badge";
import { PhotoCredit } from "@/components/ui/PhotoCredit";
import { QuietAction } from "@/components/ui/QuietAction";
import { placeMapsUrl } from "@/lib/links";
import { placeRows } from "@/lib/place-rows";
import {
  EVENT_TYPE_LABEL,
  dayLabel,
  eventTimeLabel,
} from "@/lib/itinerary";
import { useEvents } from "@/lib/eventsStore";
import { useEvents as useEventsSection } from "@/lib/queries/events";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { todayIn, wallClock } from "@/lib/timezone";
import { useTrip } from "@/lib/tripsStore";
import { useAuth } from "@/lib/authStore";
import { viewerOf } from "@/lib/members";
import { useMembers } from "@/lib/queries/members";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useDismiss } from "@/hooks/useDismiss";
import { PlaceholderImage } from "@/components/ui/PlaceholderImage";
import { useMotion } from "@/hooks/useMotion";
import { EVENT_HUES } from "@/lib/eventColors";

/**
 * Event detail, as a dialog: one event, seen whole.
 *
 * The facts read exactly like the card it was opened from — type chip on
 * the photo, then the name, the place, and the time — with the one thing
 * the card could not say: the day. A card sits under a day heading, so it
 * never repeats the date; a dialog hangs over everything, so it has to.
 *
 * The photo is the place's, which the API proxies from Google Places.
 * That is the cover until a place has no photo of its own.
 *
 * The organizer gets one action, Edit event. The traveler gets Done:
 * the same bar, one word for the only thing left to do with a dialog you
 * have finished reading. A bar with nothing in it would be chrome; a bar
 * with the way out is where the thumb already is. The trip's rule is
 * that trip-level things are organizer-authored, so nothing else is on
 * offer here. Your role comes from the server: your own roster row,
 * matched by account.
 */
export default function EventDetail() {
  return (
    <TripGate label="Loading event details">
      <EventDetailDialog />
    </TripGate>
  );
}

function EventDetailDialog() {
  const { id, event: eventId } = useLocalSearchParams<{
    id?: string;
    event?: string;
  }>();
  const { eventById } = useEvents();
  const motion = useMotion();
  const { for: settingsFor, update } = useTripSettings();
  const router = useRouter();
  const dismiss = useDismiss("/trips");

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  const { user } = useAuth();
  // Warms the section query the store reads from, so a cold load
  // (deep link straight here) still finds the event once it lands.
  const { status: sectionStatus } = useEventsSection(trip?.id);
  const event = trip
    ? eventById(trip, typeof eventId === "string" ? eventId : undefined)
    : undefined;

  // The same clock the day behind this dialog is reading, so the two can
  // never disagree about what time it is. Read before the guard: a hook
  // called after a return is a hook called a different number of times.
  const { clock } = trip
    ? settingsFor(trip)
    : { clock: "trip" as const };
  const timeZone = trip && clock === "trip" ? trip.preferredTimezone : null;
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);
  // Your role comes from the server: your own roster row, matched by
  // account — never a query param.
  const { members } = useMembers(trip?.id);
  const organizer = viewerOf(members, user?.id)?.isOrganizer ?? false;

  if (!trip) {
    return <NotFound />;
  }

  if (!event) {
    // While the section loads the event may simply not have arrived
    // yet: only the landed read gets to say it is gone.
    if (sectionStatus === "loading") {
      return (
        <FullscreenDialog title="Event" dismissHref="/trips">
          <LoadingBlock label="Loading event details" />
        </FullscreenDialog>
      );
    }
    return (
      <FullscreenDialog title="Event" dismissHref="/trips">
        <Text className="font-body text-base text-ink">
          That event is not on this trip any more.
        </Text>
      </FullscreenDialog>
    );
  }

  const today = todayIn(timeZone);
  // The place block: the snapshot's name above its address, each row
  // hiding when its value is missing.
  const rows = placeRows(event);

  return (
    <FullscreenDialog
      title={event.name}
      primaryTitle={organizer ? "Edit event" : "Done"}
      onPrimary={
        organizer
          ? () =>
              router.push(
                `/trips/events/edit?id=${trip.id}&event=${event.id}`,
              )
          : dismiss
      }
      dismissHref={`/trips/detail?id=${trip.id}`}
    >
      <View className="gap-y-6 md:flex-row md:gap-12">
        <View className="md:flex-1">
          <View className="relative overflow-hidden">
            {!event.image ? (
              <View className="w-full aspect-[2/1]">
                <PlaceholderImage kind={event.type} />
              </View>
            ) : event.photoSourceUri ? (
              <Pressable
                onPress={() => void Linking.openURL(event.photoSourceUri!)}
                aria-label="View photo source on Google Maps"
                className={motion.pressDim}
              >
                <Image
                  source={{ uri: event.image }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  className="w-full aspect-[2/1]"
                />
              </Pressable>
            ) : (
              <Image
                source={{ uri: event.image }}
                contentFit="cover"
                cachePolicy="memory-disk"
                className="w-full aspect-[2/1]"
              />
            )}
            <View className="absolute left-3 top-3">
              <Badge
                label={EVENT_TYPE_LABEL[event.type]}
                variant="category"
                hue={EVENT_HUES[event.type] ?? undefined}
              />
            </View>
          </View>
          <PhotoCredit
            credit={event.photoCredit ?? null}
            sourceUri={event.photoSourceUri ?? null}
          />
        </View>

        {/* Card order, then the day: what it is, when, and which day of
            the trip it belongs to. The place moved into the block
            below, so the name is not printed twice; the user's own
            label still shows on the itinerary tile. */}
        <View className="gap-2 md:flex-1">
          <Text className="font-body-bold text-lg text-ink">
            {dayLabel(wallClock(event.startTime, timeZone).date, today)}
          </Text>
          <Text className="font-display-extrabold text-display-md uppercase text-ink md:text-display-md-wide">
            {event.name}
          </Text>
          <Text className="font-body text-base text-ink">
            {eventTimeLabel(event, timeZone)}
          </Text>
        </View>
      </View>

      {/* The place block: the picked place's name leading in bold, its
          address following lighter on the same line — the reading of
          the picker row it came from — and the one verb a place has
          leading out to Maps, pinned to the place itself. The line
          hides when there is neither. */}
      {rows.name ?? rows.address ? (
        <RuledBlock title="Where">
          <Text selectable className="font-body text-base text-ink/70">
            {rows.name ? (
              <Text className="font-body-bold text-ink">{rows.name}</Text>
            ) : null}
            {rows.name && rows.address ? " " : null}
            {rows.address}
          </Text>
          {rows.address || event.placeId ? (
            <QuietAction
              label="Open in Maps"
              onPress={() =>
                void Linking.openURL(
                  placeMapsUrl(event.placeId, rows.address ?? rows.name!),
                )
              }
            />
          ) : null}
        </RuledBlock>
      ) : null}

      {/* The organizer's prose, at full width under both columns: it is
          the one thing here that is a paragraph rather than a fact, and
          a paragraph squeezed into a column beside a photo reads as
          caption. */}
      {event.description ? (
        <RuledBlock>
          <Text className="font-body text-base leading-relaxed text-ink">
            {event.description}
          </Text>
        </RuledBlock>
      ) : null}
    </FullscreenDialog>
  );
}
