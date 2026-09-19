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
import { viewerMember } from "@/lib/members";
import { pertinentIso } from "@/lib/travelBoard";
import { membersFor } from "@/mocks/members";

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
  const { id, as } = useLocalSearchParams<{ id?: string; as?: string }>();
  const { trips } = useTrips();
  const { travelForTrip } = useTravel();
  const router = useRouter();

  const tripId = typeof id === "string" ? id : undefined;
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];
  // The lab's stand-in for `isOrganizer` on the membership, threaded
  // down from the trip screen so the two can never disagree.
  const viewerIsOrganizer = as === "organizer";
  // The lab has no signed-in identity: one member of the roster stands
  // in for "you", and the board and the trip screen nudge share the
  // same stand-in so the two can never disagree.
  const records = travelForTrip(trip!);
  const going = trip
    ? membersFor(trip).filter((member) => member.status === "going")
    : [];
  const viewer = viewerMember(
    going,
    viewerIsOrganizer,
    records.filter((record) => pertinentIso(record)).map((record) => record.memberId),
  );
  const asParam = viewerIsOrganizer ? "organizer" : "traveler";
  // The organizer corrects anyone; a traveler touches only their own.
  const canEditRow = (memberId: string) =>
    viewerIsOrganizer || (viewer?.id ?? "") === memberId;

  const board = useMemo(
    () =>
      trip
        ? travelBoard(records, trip.preferredTimezone ?? null, going)
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
      onPrimary={() =>
        router.push(`/design/trips/travel/form?id=${trip.id}&as=${asParam}`)
      }
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
            asParam={asParam}
            canEdit={canEditRow}
          />
          <TravelSection
            heading="Departing"
            direction={board.departures}
            timeZone={timeZone}
            tripId={trip.id}
            asParam={asParam}
            canEdit={canEditRow}
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
  asParam,
  canEdit,
}: {
  heading: string;
  direction: TravelDirection;
  timeZone: string | null;
  tripId: string;
  asParam: string;
  canEdit: (memberId: string) => boolean;
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
        <View key={day.date} className="gap-2 pt-2">
          {/* The day in display type, a size down from the section:
              heads mark groups, they are not the content. */}
          <Text className="font-display text-xl uppercase text-ink">
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
                asParam={asParam}
                canEdit={canEdit(row.memberId)}
              />
            ))}
          </View>
        </View>
      ))}
      {direction.unscheduled.length > 0 ? (
        <View className="gap-2 pt-2">
          <Text className="font-display text-xl uppercase text-ink">
            No time shared
          </Text>
          <View className="border-t border-ink">
            {direction.unscheduled.map((row) => (
              <TravelRowItem
                key={row.id}
                row={row}
                timeZone={timeZone}
                tripId={tripId}
                asParam={asParam}
                canEdit={canEdit(row.memberId)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One person's travel. The name and the time are the row — who, and
 * when they land — and nothing else, so the column reads straight down.
 * Where sits in the accordion with the flight and the details: the
 * location is what you look up once you have decided to care.
 */
function TravelRowItem({
  row,
  timeZone,
  tripId,
  asParam,
  canEdit,
}: {
  row: TravelRow;
  timeZone: string | null;
  tripId: string;
  asParam: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Every row opens: the accordion holds the where, the flight, the
  // details, and the Edit link — and an unscheduled row's Edit is how
  // it gets a time at all, so those rows must open most of all.
  const Icon = open ? ArrowUp : ArrowDown;

  return (
    <View className="border-b border-b-ink py-4">
      <Pressable
        accessibilityRole="button"
        aria-expanded={open}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center justify-between gap-4"
      >
        <View className="flex-1 flex-row items-baseline justify-between gap-4">
          <Text className="font-body-bold text-base text-ink">
            {row.memberName}
          </Text>
          <Text className="font-body-bold text-base text-ink">
            {row.time ? wallClock(row.time, timeZone).time : "No time yet"}
          </Text>
        </View>
        <Icon color="#000000" size={20} />
      </Pressable>
      {open ? (
        <View className="gap-1 pt-2">
          {row.location ? (
            <Text className="font-body-bold text-sm text-ink">
              {row.location}
            </Text>
          ) : null}
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
          {canEdit ? (
            <QuietAction
              label={row.time ? "Edit" : "Add times"}
              onPress={() =>
                router.push(
                  row.id.startsWith("pending-")
                    ? `/design/trips/travel/form?id=${tripId}&as=${asParam}&member=${row.memberId}&direction=${row.travelType}`
                    : `/design/trips/travel/form?id=${tripId}&travel=${row.id}&as=${asParam}`,
                )
              }
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
