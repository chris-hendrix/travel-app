import { useMemo } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrivalBoard } from "@/components/trip/ArrivalBoard";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { travelBoard } from "@/lib/travelBoard";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useTravel } from "@/lib/travelStore";
import { useTravel as useTravelSection } from "@/lib/queries/travel";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { goingMembers } from "@/lib/members";import { useMembers } from "@/lib/queries/members";

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
          <ArrivalBoard
            heading="Arriving"
            rows={board.arrivals}
            timeZone={timeZone}
            // The press the lift took out of the row. Every row opens
            // its own travel detail, which is what this screen has
            // always done: the board reads, the route shows.
            onPressRow={(row) =>
              router.push(
                `/trips/travel/detail?id=${trip.id}&travel=${row.id}`,
              )
            }
          />
          <ArrivalBoard
            heading="Departing"
            rows={board.departures}
            timeZone={timeZone}
            onPressRow={(row) =>
              router.push(
                `/trips/travel/detail?id=${trip.id}&travel=${row.id}`,
              )
            }
          />
        </View>
      ) : null}
    </FullscreenDialog>
  );
}
