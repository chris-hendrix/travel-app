import { Suspense, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { QuietAction } from "@/components/ui/QuietAction";
import { formatDay } from "@/lib/dateRange";
import { wallClock } from "@/lib/timezone";
import {
  travelBoard,
  type TravelDirection,
  type TravelRow,
} from "@/lib/travelBoard";
import { useTrips } from "@/lib/tripsStore";
import { useTravel } from "@/lib/travelStore";

/**
 * Travel, reached from "Travel" beside "N going" on the trip header.
 *
 * A dialog rather than a screen: it discloses one line on the screen
 * behind it, exactly like the roll call. Nothing gets authored here —
 * with the travel form built, this dialog is where "Add your times"
 * would sit.
 *
 * Arrivals first, departures after, each grouped by day: the organizer
 * scans times top to bottom with no taps, and a traveler hunting the
 * same flight reads the flight numbers down the rows. One row per
 * person, no flight grouping — sharing a flight shows as adjacent rows
 * with the same number.
 *
 * The row is three facts — time, name, where — and nothing else.
 * Flight number and details live behind the accordion, with an Edit
 * link for the organizer's corrections. If a field would cost a tap
 * every time, it belongs on the row.
 */
export default function TripTravel() {
  return (
    <Suspense fallback={null}>
      <TripTravelDialog />
    </Suspense>
  );
}

function TripTravelDialog() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trips } = useTrips();
  const { travelForTrip } = useTravel();
  const router = useRouter();

  const tripId = typeof id === "string" ? id : undefined;
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];

  const records = travelForTrip(trip!);
  const board = useMemo(
    () =>
      trip
        ? travelBoard(records, trip.preferredTimezone ?? null)
        : null,
    [trip, records],
  );

  if (!trip || !board) {
    return (
      <FullscreenDialog title="Travel" dismissHref="/design/trips">
        <Text className="font-body text-base text-ink">
          No trip to show. Start one from the trips screen.
        </Text>
      </FullscreenDialog>
    );
  }

  const timeZone = trip.preferredTimezone ?? null;
  const empty =
    board.arrivals.days.length === 0 &&
    board.arrivals.unscheduled.length === 0 &&
    board.departures.days.length === 0 &&
    board.departures.unscheduled.length === 0;

  return (
    <FullscreenDialog
      title="Travel"
      primaryTitle="Add travel"
      onPrimary={() => router.push(`/design/trips/travel/form?id=${trip.id}`)}
      dismissHref={`/design/trips/detail?id=${trip.id}`}
    >
      {empty ? (
        <Text className="font-body text-base text-ink">
          Nobody has shared their times yet.
        </Text>
      ) : (
        <View className="gap-8">
          <TravelSection
            heading="Arriving"
            direction={board.arrivals}
            timeZone={timeZone}
            tripId={trip.id}
          />
          <TravelSection
            heading="Departing"
            direction={board.departures}
            timeZone={timeZone}
            tripId={trip.id}
          />
        </View>
      )}
    </FullscreenDialog>
  );
}

function TravelSection({
  heading,
  direction,
  timeZone,
  tripId,
}: {
  heading: string;
  direction: TravelDirection;
  timeZone: string | null;
  tripId: string;
}) {
  if (direction.days.length === 0 && direction.unscheduled.length === 0) {
    return null;
  }

  return (
    <View className="gap-6">
      <Text className="font-display text-3xl uppercase text-ink">
        {heading}
      </Text>
      {direction.days.map((day) => (
        <View key={day.date} className="gap-1">
          {/* The day in display type: this is what separates one
              arrival group from the next, not another rule. */}
          <Text className="font-display text-2xl uppercase text-ink">
            {formatDay(day.date)}
          </Text>
          {/* Ruled rows, like every other list here. */}
          <View className="border-t border-ink">
            {day.rows.map((row) => (
              <TravelRowItem
                key={row.id}
                row={row}
                timeZone={timeZone}
                tripId={tripId}
              />
            ))}
          </View>
        </View>
      ))}
      {direction.unscheduled.length > 0 ? (
        <View className="gap-1">
          <Text className="font-display text-2xl uppercase text-ink">
            No time shared
          </Text>
          <View className="border-t border-ink">
            {direction.unscheduled.map((row) => (
              <TravelRowItem
                key={row.id}
                row={row}
                timeZone={timeZone}
                tripId={tripId}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One person's travel. The name leads, the time sits right-aligned,
 * the where hangs beneath — three facts, nothing else. The accordion
 * holds the flight, the details, and the Edit link; every row opens,
 * because an unscheduled row's Edit is how it gets a time at all.
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
  const [open, setOpen] = useState(false);
  // Every row opens: the accordion holds the flight, the details, and
  // the Edit link — and an unscheduled row's Edit is how it gets a
  // time at all, so those rows must open most of all.
  const Icon = open ? ArrowUp : ArrowDown;

  return (
    <View className="border-b border-b-ink py-3">
      <Pressable
        accessibilityRole="button"
        aria-expanded={open}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center justify-between gap-4"
      >
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-baseline justify-between gap-4">
            <Text className="font-body-bold text-base text-ink">
              {row.memberName}
            </Text>
            <Text className="font-body-bold text-base text-ink">
              {row.time ? wallClock(row.time, timeZone).time : "No time yet"}
            </Text>
          </View>
          {row.location ? (
            <Text className="font-body text-sm text-ink opacity-60">
              {row.location}
            </Text>
          ) : null}
        </View>
        <Icon color="#000000" size={20} />
      </Pressable>
      {open ? (
        <View className="gap-1 pt-2">
          {row.flightNumber ? (
            <Text className="font-body text-sm text-ink">
              {row.flightNumber}
            </Text>
          ) : null}
          {row.details ? (
            <Text className="font-body text-sm leading-relaxed text-ink">
              {row.details}
            </Text>
          ) : null}
          <QuietAction
            label="Edit"
            onPress={() =>
              router.push(
                `/design/trips/travel/form?id=${tripId}&travel=${row.id}`,
              )
            }
          />
        </View>
      ) : null}
    </View>
  );
}
