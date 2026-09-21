import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { QuietAction } from "@/components/ui/QuietAction";
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
import { viewerMember } from "@/lib/members";
import { pertinentIso } from "@/lib/travelBoard";
import { useMembers } from "@/lib/queries/members";
import { INK } from "@/lib/theme";

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
    <TripGate label="Travel">
      <TripTravelDialog />
    </TripGate>
  );
}

function TripTravelDialog() {
  const { id, as } = useLocalSearchParams<{ id?: string; as?: string }>();
  const { travelForTrip } = useTravel();
  const { for: settingsFor, update } = useTripSettings();
  const router = useRouter();

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  // The zone these rows are read in: the trip's own clock setting, the
  // same one the itinerary behind this dialog is reading. A board and a
  // form that disagreed about what time it is would be two trips.
  const { clock } = trip
    ? settingsFor(trip, new Date())
    : { clock: "trip" as const };
  const timeZone = clock === "trip" ? (trip?.preferredTimezone ?? null) : null;
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);
  // The lab's stand-in for `isOrganizer` on the membership, threaded
  // down from the trip screen so the two can never disagree.
  const viewerIsOrganizer = as === "organizer";
  // The lab has no signed-in identity: one member of the roster stands
  // in for "you", and the board and the trip screen nudge share the
  // same stand-in so the two can never disagree.
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
  const going = roster.filter((member) => member.status === "going");
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
        router.push(`/trips/travel/form?id=${trip.id}&as=${asParam}`)
      }
      dismissHref={`/trips/detail?id=${trip.id}`}
    >
      {travelStatus === "loading" ? (
        <LoadingBlock label="Travel" />
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
            asParam={asParam}
            canEdit={canEditRow}
          />
          <TravelSection
            heading="Departing"
            rows={board.departures}
            timeZone={timeZone}
            tripId={trip.id}
            asParam={asParam}
            canEdit={canEditRow}
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
  asParam,
  canEdit,
}: {
  heading: string;
  rows: TravelRow[];
  timeZone: string | null;
  tripId: string;
  asParam: string;
  canEdit: (memberId: string) => boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <View className="gap-4">
      <Text className="font-display text-3xl uppercase text-ink">
        {heading}
      </Text>
      {/* Ruled rows, like every other list here. One list per direction,
          with the day carried on each row rather than on a heading above
          a run of them. */}
      <View className="border-t border-ink">
        {rows.map((row) => (
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
        role="button"
        accessibilityRole="button"
        aria-expanded={open}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center gap-4"
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
        <Icon color={INK} size={20} />
      </Pressable>
      {open ? (
        <View className="gap-1 pt-2">
          {row.location ? (
            <Text className="font-body text-sm text-ink">
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
                    ? `/trips/travel/form?id=${tripId}&as=${asParam}&member=${row.memberId}&direction=${row.travelType}`
                    : `/trips/travel/form?id=${tripId}&travel=${row.id}&as=${asParam}`,
                )
              }
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
