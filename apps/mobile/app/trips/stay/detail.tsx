import { Suspense, type ReactNode } from "react";
import { Image, Linking, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { QuietAction } from "@/components/ui/QuietAction";
import { formatDay } from "@/lib/dateRange";
import { mapsSearchUrl } from "@/lib/links";
import {
  nightsLabel,
  stayEnd,
  staySpan,
  stayStart,
  stayTime,
} from "@/lib/stays";
import { useStays } from "@/lib/staysStore";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { useTrips } from "@/lib/tripsStore";
import { tripFor } from "@/lib/tripLookup";
import NotFound from "@/app/+not-found";
import { useDismiss } from "@/hooks/useDismiss";
import { joinFacts } from "@/lib/wording";

/**
 * Stay detail, as a dialog: one roof, seen whole.
 *
 * The facts read like the row it was opened from — the span, the name,
 * the address — and then the description, which is the reason anybody
 * opens this screen. The way in has no field of its own on the row: the
 * door code, the lockbox, the wifi and the host's number are prose the
 * organizer pasted out of a message, so this block sits directly under
 * the address rather than at the foot where an event's description
 * goes. It is selectable, because the password is the one string on this
 * screen somebody needs a copy of.
 *
 * The address leads out of the app rather than into a screen of ours,
 * for the same reason an event's place does: the trip is where it is,
 * and Maps is where it is exactly — which is also the answer to a taxi
 * driver, and the reason the address is a link rather than a row.
 *
 * The organizer gets one action, Edit stay. The traveler gets Done: the
 * same bar, one word for the only thing left to do with a dialog you
 * have finished reading.
 */
export default function StayDetail() {
  return (
    <Suspense fallback={null}>
      <StayDetailDialog />
    </Suspense>
  );
}

function StayDetailDialog() {
  const { id, stay: stayId, as } = useLocalSearchParams<{
    id?: string;
    stay?: string;
    as?: string;
  }>();
  const { trips } = useTrips();
  const { stayById } = useStays();
  const { for: settingsFor, update } = useTripSettings();
  const router = useRouter();
  const dismiss = useDismiss("/trips");

  const tripId = typeof id === "string" ? id : undefined;
  const trip = tripFor(trips, tripId);
  const stay = trip
    ? stayById(trip, typeof stayId === "string" ? stayId : undefined)
    : undefined;

  // Read before the guard: a hook called after a return is a hook called
  // a different number of times.
  const { clock } = trip
    ? settingsFor(trip, new Date())
    : { clock: "trip" as const };
  const timeZone = trip && clock === "trip" ? trip.preferredTimezone : null;
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);

  if (!trip) {
    return <NotFound />;
  }

  if (!stay) {
    return (
      <FullscreenDialog title="Stay" dismissHref="/trips">
        <Text className="font-body text-base text-ink">
          That stay is not on this trip any more.
        </Text>
      </FullscreenDialog>
    );
  }

  const organizer = as === "organizer";
  const checkInDay = stayStart(stay, timeZone);
  const checkOutDay = stayEnd(stay, timeZone);

  return (
    <FullscreenDialog
      title={stay.name}
      primaryTitle={organizer ? "Edit stay" : "Done"}
      onPrimary={
        organizer
          ? () =>
              router.push(
                `/trips/stay/edit?id=${trip.id}&stay=${stay.id}`,
              )
          : dismiss
      }
      dismissHref={`/trips/detail?id=${trip.id}`}
    >
      <View className="gap-y-6 md:flex-row md:gap-12">
        <View className="md:flex-1">
          <View className="relative overflow-hidden">
            <Image
              source={{ uri: stay.image }}
              resizeMode="cover"
              className="w-full aspect-[2/1]"
            />
          </View>
          {/* The photo is the place's, which the API proxies from Google
              Places, and Places is owed the credit — a term of the
              licence rather than a preference. */}
          <Text className="pt-1 font-body text-xs text-ink opacity-60">
            Photo: Google Places
          </Text>
        </View>

        {/* Row order, then the two facts a row has no space for: how
            many nights, and where exactly. */}
        <View className="gap-2 md:flex-1">
          <Text className="font-body-bold text-lg text-ink">
            {joinFacts(nightsLabel(stay, timeZone), staySpan(stay, timeZone))}
          </Text>
          <Text className="font-display text-4xl uppercase leading-[0.95] text-ink md:text-5xl">
            {stay.name}
          </Text>
        </View>
      </View>

      {/* The address as a row rather than a link beside the title. An
          address is longer than a place name, which is what the link was
          shaped for: the arrow that follows a name lands in the middle
          of a wrapped line. The row holds the string whole, selectable
          for a driver or a booking form, with the one verb an address
          has. */}
      {stay.address ? (
        <View className="border-t border-ink pt-6">
          <Fact label="Address">
            <Text selectable className="font-body text-base text-ink">
              {stay.address}
            </Text>
            <QuietAction
              label="Open in Maps"
              onPress={() => void Linking.openURL(mapsSearchUrl(stay.address!))}
            />
          </Fact>
        </View>
      ) : null}

      {/* Directly under the address, because this is what people open
          the screen for. An event's description is the organizer's
          colour and sits at the foot; here the prose is the arrival
          instructions, so it is the block the eye should land on after
          the address. Selectable: the wifi password is the one string
          here anybody needs to copy, and the platform's own selection
          gives the copy without a clipboard dependency. */}
      {stay.description ? (
        <View className="border-t border-ink pt-6">
          <Text
            selectable
            className="font-body text-base leading-relaxed text-ink"
          >
            {stay.description}
          </Text>
        </View>
      ) : null}

      {checkInDay || checkOutDay ? (
        <View className="gap-4 border-t border-ink pt-6">
          {checkInDay ? (
            <Fact label="Check in">
              {joinFacts(formatDay(checkInDay), stayTime(stay.checkIn, timeZone))}
            </Fact>
          ) : null}
          {checkOutDay ? (
            <Fact label="Check out">
              {joinFacts(
                formatDay(checkOutDay),
                stayTime(stay.checkOut, timeZone),
              )}
            </Fact>
          ) : null}
        </View>
      ) : null}
    </FullscreenDialog>
  );
}

/**
 * One fact, as a ruled row: the noun the reader is looking for in the
 * quiet column, the answer in ink.
 */
function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View className="flex-row gap-4">
      <Text className="w-20 shrink-0 font-body text-sm text-ink opacity-60">
        {label}
      </Text>
      <View className="flex-1 gap-1">{children}</View>
    </View>
  );
}
