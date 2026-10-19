import { RuledBlock } from "@/components/ui/RuledBlock";
import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "@/components/ui/Image";
import { Fact } from "@/components/ui/Fact";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { LinkedText } from "@/components/ui/LinkedText";
import { PhotoCredit } from "@/components/ui/PhotoCredit";
import { PlaceActions } from "@/components/ui/PlaceActions";
import { QuietAction } from "@/components/ui/QuietAction";
import { formatDay } from "@/lib/dateRange";
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
import { useMotion } from "@/hooks/useMotion";
import { PlaceholderImage } from "@/components/ui/PlaceholderImage";

/**
 * Stay detail, as a dialog: one roof, seen whole.
 *
 * The facts read like the row it was opened from — the span, the name,
 * the address — then the two times, then the description last. The way
 * in has no field of its own on the row: the door code, the lockbox, the
 * wifi and the host's number are prose the organizer pasted out of a
 * message, which is why the description carries more than an event's
 * note does. It is still the column the form names `Description`, and
 * the times are what a reader wants ahead of the prose — the order the
 * form asks for them in. The prose itself is read through `LinkedText`,
 * so an address the host pasted is pressable where it sits, and the copy
 * the password wants is the `Copy` word under the block rather than the
 * platform's selection: a selectable `Text` is a different native view on
 * Android, where the presses nested inside it stop firing. Selection and
 * links are one or the other, not both, and a word that takes the arrival
 * details whole is worth more than a long press that catches the line a
 * finger landed on.
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

/**
 * How long the copy verb stays answered. Long enough to read the word, short
 * enough that nobody presses it twice wondering whether it took — the same
 * beat `PlaceActions` holds, because two copies on two screens answering at
 * two speeds is a difference nobody could tell you the reason for.
 */
const COPIED_MS = 2000;

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
  const motion = useMotion();
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
    ? settingsFor(trip)
    : { clock: "trip" as const };
  const timeZone = trip && clock === "trip" ? trip.preferredTimezone : null;
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);
  // Your role comes from the server: your own roster row, matched by
  // account — never a query param.
  const { members } = useMembers(trip?.id);
  const organizer = viewerOf(members, user?.id)?.isOrganizer ?? false;
  // The description's own answer, held for the word that gave it. Above the
  // guards, because a hook called after a return is a hook called a
  // different number of times.
  const [copiedDescription, setCopiedDescription] = useState(false);

  useEffect(() => {
    if (!copiedDescription) return;
    const timer = setTimeout(() => setCopiedDescription(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copiedDescription]);

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
  // The way-in, as the organizer pasted it. A stay with none draws neither
  // the prose nor the copy that would take it.
  const description = stay.description ?? "";

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
                className={motion.pressDim}
              >
                <Image
                  source={{ uri: stay.image }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  className="w-full aspect-[2/1]"
                />
              </Pressable>
            ) : (
              <Image
                source={{ uri: stay.image }}
                contentFit="cover"
                cachePolicy="memory-disk"
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
          <Text className="font-display-extrabold text-display-md uppercase text-ink md:text-display-md-wide">
            {stay.name}
          </Text>
        </View>
      </View>

      {/* The place block: the picked place's name leading in bold, its
          address following lighter on the same line — the reading of
          the picker row it came from — and the two verbs a place has under
          it (`PlaceActions`): the Maps link, pinned to the place itself,
          and the address beside it. The address falls back to the stay's
          own column, so every stay created before this feature keeps its
          address; the line hides when there is neither. */}
      {rows.name ?? rows.address ? (
        <RuledBlock title="Where">
          <Text selectable className="font-body text-base text-ink/70">
            {rows.name ? (
              <Text className="font-body-bold text-ink">{rows.name}</Text>
            ) : null}
            {rows.name && rows.address ? " " : null}
            {rows.address}
          </Text>
          <PlaceActions
            name={rows.name}
            address={rows.address}
            placeId={stay.placeId}
          />
        </RuledBlock>
      ) : null}

      {/* The booking's two times, above the prose: the form asks for
          them in this order — check-in, check-out, then the description —
          and arriving is read the same way: where, then when, then the
          way in. */}
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

      {/* Titled with the column's own word. The form labels this field
          `Description` and keeps the arrival framing in its placeholder —
          the code, the lockbox, the wifi — so this screen does not invent
          a second name for one field. Read through `LinkedText`, so an
          address the host pasted is pressable where it sits. Not
          selectable, though this is the one string here somebody takes
          with them: on Android a selectable `Text` is a different native
          view, and the presses nested inside it stop firing, so selection
          and links are one or the other and this block takes the links.
          The copy that was wanted is the word underneath — `Copy` hands
          the description over verbatim, the whole of it rather than the
          line a long press caught, and answers by inverting itself for
          two seconds the way `PlaceActions` does. It names what it takes
          besides, so a screen reader hears arrival details and not an
          anonymous verb. */}
      {description ? (
        <RuledBlock title="Description">
          <LinkedText text={description} />
          <QuietAction
            label={copiedDescription ? "Copied" : "Copy"}
            ariaLabel="Copy arrival details"
            onPress={() => {
              void Clipboard.setStringAsync(description).then(
                () => setCopiedDescription(true),
                // Nothing was copied, so nothing is confirmed: the word
                // stays as it was, which is the answer a write that never
                // landed gets.
                () => setCopiedDescription(false),
              );
            }}
          />
        </RuledBlock>
      ) : null}
    </FullscreenDialog>
  );
}

