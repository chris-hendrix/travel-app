import { RuledBlock } from "@/components/ui/RuledBlock";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Fact } from "@/components/ui/Fact";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { PhotoCredit } from "@/components/ui/PhotoCredit";
import { QuietAction } from "@/components/ui/QuietAction";
import { formatDay } from "@/lib/dateRange";
import { placeMapsUrl } from "@/lib/links";
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
import { useTrip } from "@/lib/tripsStore";
import { useAuth } from "@/lib/authStore";
import { viewerOf } from "@/lib/members";
import { useMembers } from "@/lib/queries/members";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useDismiss } from "@/hooks/useDismiss";
import { joinFacts } from "@/lib/wording";
import { placeRows } from "@/lib/place-rows";
import { PlaceholderImage } from "@/components/ui/PlaceholderImage";

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
    <TripGate label="Loading stay details">
      <StayDetailDialog />
    </TripGate>
  );
}

function StayDetailDialog() {
  const { id, stay: stayId } = useLocalSearchParams<{
    id?: string;
    stay?: string;
  }>();
  const { stayById } = useStays();
  const { for: settingsFor, update } = useTripSettings();
  const router = useRouter();
  const dismiss = useDismiss("/trips");

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  const { user } = useAuth();
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
  // Your role comes from the server: your own roster row, matched by
  // account — never a query param.
  const { members } = useMembers(trip?.id);
  const organizer = viewerOf(members, user?.id)?.isOrganizer ?? false;

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

  const checkInDay = stayStart(stay, timeZone);
  const checkOutDay = stayEnd(stay, timeZone);
  // The place block: the snapshot's name above its address, the
  // address falling back to the stay's own column for rows that
  // predate the snapshot.
  const rows = placeRows(stay);

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
            {!stay.image ? (
              <View className="w-full aspect-[2/1]">
                <PlaceholderImage kind="lodging" />
              </View>
            ) : stay.photoSourceUri ? (
              <Pressable
                onPress={() => void Linking.openURL(stay.photoSourceUri!)}
                aria-label="View photo source on Google Maps"
              >
                <Image
                  source={{ uri: stay.image }}
                  resizeMode="cover"
                  className="w-full aspect-[2/1]"
                />
              </Pressable>
            ) : (
              <Image
                source={{ uri: stay.image }}
                resizeMode="cover"
                className="w-full aspect-[2/1]"
              />
            )}
          </View>
          {/* The photo is the place's, which the API proxies from Google
              Places, and Places is owed the credit — a term of the
              licence rather than a preference. */}
          <PhotoCredit
            credit={stay.photoCredit ?? null}
            sourceUri={stay.photoSourceUri ?? null}
          />
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

      {/* The place block: the picked place's name leading in bold, its
          address following lighter on the same line — the reading of
          the picker row it came from — and the one verb a place has
          leading out to Maps, pinned to the place itself. The address
          falls back to the stay's own column, so every stay created
          before this feature keeps its address; the line hides when
          there is neither. */}
      {rows.name ?? rows.address ? (
        <RuledBlock title="Where">
          <Text selectable className="font-body text-base text-ink/70">
            {rows.name ? (
              <Text className="font-body-bold text-ink">{rows.name}</Text>
            ) : null}
            {rows.name && rows.address ? " " : null}
            {rows.address}
          </Text>
          {rows.address || stay.placeId ? (
            <QuietAction
              label="Open in Maps"
              onPress={() =>
                void Linking.openURL(
                  placeMapsUrl(stay.placeId, rows.address ?? rows.name!),
                )
              }
            />
          ) : null}
        </RuledBlock>
      ) : null}

      {/* Directly under the address, because this is what people open
          the screen for. An event's description is the organizer's
          colour and sits at the foot; here the prose is the arrival
          instructions, so it is the block the eye should land on after
          the address. Selectable: the wifi password is the one string
          here anybody needs to copy, and the platform's own selection
          gives the copy without a clipboard dependency. */}
      {stay.description ? (
        <RuledBlock title="Arrival">
          <Text
            selectable
            className="font-body text-base leading-relaxed text-ink"
          >
            {stay.description}
          </Text>
        </RuledBlock>
      ) : null}

      {checkInDay || checkOutDay ? (
        <RuledBlock>
          {checkInDay ? (
            <Fact label="Check in">
              <Text className="font-body text-base text-ink">
                {joinFacts(
                  formatDay(checkInDay),
                  stayTime(stay.checkIn, timeZone),
                )}
              </Text>
            </Fact>
          ) : null}
          {checkOutDay ? (
            <Fact label="Check out">
              <Text className="font-body text-base text-ink">
                {joinFacts(
                  formatDay(checkOutDay),
                  stayTime(stay.checkOut, timeZone),
                )}
              </Text>
            </Fact>
          ) : null}
        </RuledBlock>
      ) : null}
    </FullscreenDialog>
  );
}

