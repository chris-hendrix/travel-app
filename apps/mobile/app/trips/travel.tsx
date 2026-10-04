import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { dayNumber, weekdayAbbrev } from "@/lib/dateRange";
import { wallClock } from "@/lib/timezone";
import { travelBoard, type TravelRow } from "@/lib/travelBoard";
import { NOT_SHARED } from "@/lib/wording";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useTravel } from "@/lib/travelStore";
import { useTravel as useTravelSection } from "@/lib/queries/travel";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { goingMembers } from "@/lib/members";import { useMembers } from "@/lib/queries/members";
import { useMotion } from "@/hooks/useMotion";

/**
 * Travel, reached from "Travel" beside "N going" on the trip header.
 *
 * A dialog rather than a screen, like the roll call: the board is
 * something you read standing up. It holds nothing of its own — a row
 * press is a route change — and authoring happens in the form the bar's
 * Add travel reaches.
 *
 * Arrivals first, departures after, each grouped by day: the organizer
 * scans times top to bottom with no taps, and a traveler hunting the
 * same flight reads the flight numbers down the rows. One row per
 * person, no flight grouping — sharing a flight shows as adjacent rows
 * with the same number.
 *
 * The row is three facts — day, name, where — and nothing else. The
 * rest of the record, the flight and the details and the Edit link, is
 * a screen of its own at `/trips/travel/detail`: a row press is a route
 * change rather than a panel, so the board holds one shape of each
 * travel instead of two. If a field would cost a tap every time, it
 * belongs on the row.
 */
export default function TripTravel() {
  return (
    <TripGate label="Loading travel">
      <TripTravelDialog />
    </TripGate>
  );
}

function TripTravelDialog() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { travelForTrip } = useTravel();
  const { for: settingsFor, update } = useTripSettings();
  const router = useRouter();

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  // The zone these rows are read in: the trip's own clock setting, the
  // same one the itinerary behind this dialog is reading. A board and a
  // form that disagreed about what time it is would be two trips.
  const { clock } = trip
    ? settingsFor(trip)
    : { clock: "trip" as const };
  const timeZone = clock === "trip" ? (trip?.preferredTimezone ?? null) : null;
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);
  // The board rows are server state now (GET
  // /trips/:tripId/member-travel), explicit — the dialog chrome above
  // never blanks while they load, and the board owns its own copy.
  const { status: travelStatus, retry: retryTravel } = useTravelSection(
    trip?.id,
  );
  const records = trip ? travelForTrip(trip) : [];
  // The board's name column is server state now, suspended under the
  // same gate as the trip above.
  const { members: roster } = useMembers(trip?.id);
  const going = goingMembers(roster);

  const board = useMemo(
    () => (trip ? travelBoard(records, timeZone, going) : null),
    [trip, records, timeZone],
  );
  if (!trip) {
    return <NotFound />;
  }
  if (!board) {
    return (
      <FullscreenDialog title="Travel" dismissHref="/trips">
        <Text className="font-body text-base text-ink">
          No trip to show. Start one from the trips screen.
        </Text>
      </FullscreenDialog>
    );
  }

  // The roster is the list, so "empty" is never an empty screen: every
  // direction lists whoever owes it. What is worth saying out loud is
  // when nobody at all has filed, because then the dashes are the whole
  // board rather than the exceptions in it.
  const nothingFiled = [...board.arrivals, ...board.departures].every(
    (row) => row.time === null,
  );

  return (
    <FullscreenDialog
      title="Travel"
      primaryTitle="Add travel"
      onPrimary={() =>
        router.push(`/trips/travel/form?id=${trip.id}`)
      }
      dismissHref={`/trips/detail?id=${trip.id}`}
    >
      {travelStatus === "loading" ? (
        <LoadingBlock label="Loading travel details" />
      ) : travelStatus === "offline" ? (
        <OfflineBlock onRetry={retryTravel} />
      ) : travelStatus === "error" ? (
        <InlineError
          message="Couldn't load the travel"
          onRetry={retryTravel}
        />
      ) : nothingFiled ? (
        <Text className="font-body text-base text-ink">
          Nobody has shared their times yet.
        </Text>
      ) : null}

      {travelStatus === "success" ? (
        <View className="gap-8">
          <TravelSection
            heading="Arriving"
            rows={board.arrivals}
            timeZone={timeZone}
            tripId={trip.id}
          />
          <TravelSection
            heading="Departing"
            rows={board.departures}
            timeZone={timeZone}
            tripId={trip.id}
          />
        </View>
      ) : null}
    </FullscreenDialog>
  );
}

function TravelSection({
  heading,
  rows,
  timeZone,
  tripId,
}: {
  heading: string;
  rows: TravelRow[];
  timeZone: string | null;
  tripId: string;
}) {
  if (rows.length === 0) return null;

  return (
    <View className="gap-4">
      <Text className="font-display-bold text-display-sm uppercase text-ink">
        {heading}
      </Text>
      {/* No mark on this list. A board row is read DOWN — the day's own
          narrow column, the name, the clock — so the rows group by
          proximity and the padding does the work. One list per
          direction, with the day carried on each row rather than on a
          heading above a run of them. */}
      <View>
        {rows.map((row) => (
          <TravelRowItem
            key={row.id}
            row={row}
            timeZone={timeZone}
            tripId={tripId}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * One person's travel. The day, the name and the clock are the row —
 * when, who, and how late — and nothing else, so the column reads
 * straight down. Where, the flight and the details live on the row's own screen, where
 * they have room: the location is what you look up once you have
 * decided to care, and the dialog is one hop rather than a press.
 *
 * It discloses nothing, so it has nothing to report and nothing to draw:
 * no triangle, no expanded flag, no icon. The whole row is the press
 * target and what it presses is a route. The bold name and the fixed
 * day column already say "pressable", and this system spends a triangle
 * only where a bare label would read as prose.
 */
function TravelRowItem({
  row,
  timeZone,
  tripId,
}: {
  row: TravelRow;
  timeZone: string | null;
  tripId: string;
}) {
  const router = useRouter();
  const motion = useMotion();

  return (
    <Pressable
      role="button"
      accessibilityRole="button"
      onPress={() =>
        router.push(`/trips/travel/detail?id=${tripId}&travel=${row.id}`)
      }
      className={`flex-row items-center gap-4 py-4 ${motion.row}`}
    >
      {/* The day's own column, narrow and fixed so it aligns down the
          list. Every row names its day, so a run that outlives the
          screen still says when it is. The number reads at the same
          weight as the facts beside it: the column's position already
          says it is a date. */}
      <View className="w-10 items-center">
        {row.date ? (
          <>
            <Text className="font-body text-xs text-ink opacity-60">
              {weekdayAbbrev(row.date)}
            </Text>
            <Text className="font-body text-base leading-none text-ink">
              {dayNumber(row.date)}
            </Text>
          </>
        ) : (
          <Text className="font-body text-base text-ink opacity-40">–</Text>
        )}
      </View>

      <Text className="flex-1 font-body-bold text-base text-ink">
        {row.memberName}
      </Text>

      {/* The clock is a fact about the row, like the members dialog's
          status: read, not announced. Bold here made every row shout
          and left the name with nothing to anchor against. */}
      <Text className="font-body text-base text-ink">
        {row.time ? wallClock(row.time, timeZone).time : NOT_SHARED}
      </Text>
    </Pressable>
  );
}
