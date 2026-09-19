import { Suspense, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { formatDay } from "@/lib/dateRange";
import { wallClock } from "@/lib/timezone";
import {
  travelBoard,
  type TravelDirection,
  type TravelRow,
} from "@/lib/travelBoard";
import { useTrips } from "@/lib/tripsStore";
import { travelFor } from "@/mocks/travel";

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
 * The row answers "do I need to care" (when, who, which flight,
 * where); the accordion holds what coordination sometimes needs (the
 * details prose). If a field would cost a tap every time, it belongs
 * on the row.
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

  const tripId = typeof id === "string" ? id : undefined;
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];

  const board = useMemo(
    () =>
      trip
        ? travelBoard(travelFor(trip), trip.preferredTimezone ?? null)
        : null,
    [trip],
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
          />
          <TravelSection
            heading="Departing"
            direction={board.departures}
            timeZone={timeZone}
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
}: {
  heading: string;
  direction: TravelDirection;
  timeZone: string | null;
}) {
  if (direction.days.length === 0 && direction.unscheduled.length === 0) {
    return null;
  }

  return (
    <View className="gap-4">
      <Text className="font-display text-3xl uppercase text-ink">
        {heading}
      </Text>
      {direction.days.map((day) => (
        <View key={day.date}>
          <Text className="font-body-bold text-base text-ink">
            {formatDay(day.date)}
          </Text>
          {/* Ruled rows, like every other list here. */}
          <View className="border-t border-ink">
            {day.rows.map((row) => (
              <TravelRowItem key={row.id} row={row} timeZone={timeZone} />
            ))}
          </View>
        </View>
      ))}
      {direction.unscheduled.length > 0 ? (
        <View>
          <Text className="font-body-bold text-base text-ink">
            No time shared
          </Text>
          <View className="border-t border-ink">
            {direction.unscheduled.map((row) => (
              <TravelRowItem key={row.id} row={row} timeZone={timeZone} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One person's travel. The row is the manifest line — time, name,
 * flight, where — and the accordion opens only onto the details prose,
 * when there is any. A row with nothing behind it is not expandable:
 * no chevron, no dead tap.
 */
function TravelRowItem({
  row,
  timeZone,
}: {
  row: TravelRow;
  timeZone: string | null;
}) {
  const [open, setOpen] = useState(false);
  const expandable = row.details !== null && row.details !== "";
  const Icon = open ? ArrowUp : ArrowDown;

  return (
    <View className="border-b border-b-ink py-3">
      <Pressable
        accessibilityRole={expandable ? "button" : undefined}
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center justify-between gap-4"
      >
        <View className="flex-1 gap-0.5">
          <View className="flex-row flex-wrap items-baseline gap-x-3">
            <Text className="font-body-bold text-base text-ink">
              {row.time ? wallClock(row.time, timeZone).time : "No time yet"}
            </Text>
            <Text className="font-body text-base text-ink">
              {row.memberName}
            </Text>
          </View>
          {row.flightNumber || row.location ? (
            <Text className="font-body text-sm text-ink">
              {[row.flightNumber, row.location]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}
        </View>
        {expandable ? <Icon color="#000000" size={20} /> : null}
      </Pressable>
      {expandable && open ? (
        <Text className="font-body pt-2 text-sm leading-relaxed text-ink">
          {row.details}
        </Text>
      ) : null}
    </View>
  );
}
