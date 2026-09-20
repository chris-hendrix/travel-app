import { Suspense } from "react";
import { Image, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Badge } from "@/components/ui/Badge";
import { PlaceLink } from "@/components/ui/PlaceLink";
import { placeQuery } from "@/lib/links";
import {
  EVENT_TYPE_LABEL,
  dayLabel,
  eventTimeLabel,
} from "@/lib/itinerary";
import { useEvents } from "@/lib/eventsStore";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { todayIn, wallClock } from "@/lib/timezone";
import { useTrips } from "@/lib/tripsStore";
import { useDismiss } from "@/hooks/useDismiss";

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
 * offer here. Where the variant comes from is the lab's business: `?as=`,
 * threaded down from the trip screen's own toggle, standing in for what
 * the API will answer with `isOrganizer`.
 */
export default function EventDetail() {
  return (
    <Suspense fallback={null}>
      <EventDetailDialog />
    </Suspense>
  );
}

function EventDetailDialog() {
  const { id, event: eventId, as } = useLocalSearchParams<{
    id?: string;
    event?: string;
    as?: string;
  }>();
  const { trips } = useTrips();
  const { eventById } = useEvents();
  const { for: settingsFor, update } = useTripSettings();
  const router = useRouter();
  const dismiss = useDismiss("/design/trips");

  const tripId = typeof id === "string" ? id : undefined;
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];
  const event = trip
    ? eventById(trip, typeof eventId === "string" ? eventId : undefined)
    : undefined;

  // The same clock the day behind this dialog is reading, so the two can
  // never disagree about what time it is. Read before the guard: a hook
  // called after a return is a hook called a different number of times.
  const { clock } = trip
    ? settingsFor(trip, new Date())
    : { clock: "trip" as const };
  const timeZone = trip && clock === "trip" ? trip.preferredTimezone : null;
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);

  if (!trip || !event) {
    return (
      <FullscreenDialog title="Event" dismissHref="/design/trips">
        <Text className="font-body text-base text-ink">
          That event is not on this trip any more.
        </Text>
      </FullscreenDialog>
    );
  }

  const organizer = as === "organizer";
  const today = todayIn(timeZone);

  return (
    <FullscreenDialog
      title={event.name}
      primaryTitle={organizer ? "Edit event" : "Done"}
      onPrimary={
        organizer
          ? () =>
              router.push(
                `/design/trips/events/edit?id=${trip.id}&event=${event.id}`,
              )
          : dismiss
      }
      dismissHref={`/design/trips/detail?id=${trip.id}`}
    >
      <View className="gap-y-6 md:flex-row md:gap-12">
        <View className="relative overflow-hidden md:flex-1">
          <Image
            source={{ uri: event.image }}
            resizeMode="cover"
            className="w-full aspect-[2/1]"
          />
          <View className="absolute left-3 top-3">
            <Badge label={EVENT_TYPE_LABEL[event.type]} variant="category" />
          </View>
        </View>

        {/* Card order, then the day: what it is, where, when, and which
            day of the trip it belongs to. */}
        <View className="gap-2 md:flex-1">
          <Text className="font-body-bold text-lg text-ink">
            {dayLabel(wallClock(event.startTime, timeZone).date, today)}
          </Text>
          <Text className="font-display text-4xl uppercase leading-[0.95] text-ink md:text-5xl">
            {event.name}
          </Text>
          {/* The place leads out of the app rather than into a screen of
              ours: the trip is where it is, and Maps is where it is
              exactly. The query carries the trip's own place so that a
              restaurant name lands on the restaurant. */}
          <PlaceLink
            label={event.place}
            query={placeQuery(event.place, trip.location)}
          />
          <Text className="font-body text-base text-ink">
            {eventTimeLabel(event, timeZone)}
          </Text>
        </View>
      </View>

      {/* The organizer's prose, at full width under both columns: it is
          the one thing here that is a paragraph rather than a fact, and
          a paragraph squeezed into a column beside a photo reads as
          caption. */}
      {event.description ? (
        <View className="border-t border-ink pt-6">
          <Text className="max-w-[68ch] font-body text-base leading-relaxed text-ink">
            {event.description}
          </Text>
        </View>
      ) : null}
    </FullscreenDialog>
  );
}
