import { RuledBlock } from "@/components/ui/RuledBlock";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { formatDay } from "@/lib/dateRange";
import { formatFlightNumber } from "@/lib/flights";
import { joinFacts, NOT_SHARED } from "@/lib/wording";
import { wallClock } from "@/lib/timezone";
import { travelBoard } from "@/lib/travelBoard";
import { useTravel } from "@/lib/travelStore";
import { useTravel as useTravelSection } from "@/lib/queries/travel";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { useAuth } from "@/lib/authStore";
import { viewerOf, goingMembers } from "@/lib/members";
import { useMembers } from "@/lib/queries/members";
import { useTrip } from "@/lib/tripsStore";
import { useDismiss } from "@/hooks/useDismiss";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";

/**
 * Which way this row goes, in the board's own words. The board carries
 * the direction in the section it files the row under; a dialog has no
 * sections, so it has to say it here or "3:00 PM, Lisbon Airport" reads
 * as a flight nobody knows the direction of.
 */
const DIRECTION_WORD = {
  arrival: "Arriving",
  departure: "Departing",
} as const;

/**
 * Travel detail, as a dialog: one person's travel, seen whole.
 *
 * The board's row is three facts — the day, the name, the clock — and
 * this screen is the rest of the record behind it, in the order a person
 * coordinates a landing: when, where, which flight, and the prose. Every
 * one of those facts is optional, so each block hides itself rather than
 * ruling over nothing: a rule above an empty block is a line that says
 * "something is here" when nothing is.
 *
 * There is no state here to get wrong. The row this came from used to
 * open under the thumb with a triangle and a stack of facts, which meant
 * the board held two shapes of the same record and only one of them was
 * reachable without knowing which row it was. Everything is open at once
 * here, so the screen has no `open`, no `aria-expanded` and no icon.
 *
 * The row is addressed the way `events/detail.tsx` addresses its event:
 * `?id=<tripId>&travel=<travelId>`, where the id is the board row's own —
 * a filed row's record id, or the `pending-<direction>-<memberId>` a row
 * still owed carries on the board. Reading the row back out of
 * `travelBoard` rather than `travelById` is what keeps an unscheduled row
 * reachable: it has no record to look up, only a place on the board.
 */
export default function TravelDetail() {
  return (
    <TripGate label="Loading travel details">
      <TravelDetailDialog />
    </TripGate>
  );
}

function TravelDetailDialog() {
  const { id, travel: travelId } = useLocalSearchParams<{
    id?: string;
    travel?: string;
  }>();
  const { travelForTrip } = useTravel();
  const { for: settingsFor, update } = useTripSettings();
  const router = useRouter();
  const dismiss = useDismiss("/trips");

  const tripId = typeof id === "string" ? id : undefined;
  const rowId = typeof travelId === "string" ? travelId : undefined;
  const { trip } = useTrip(tripId);
  const { user } = useAuth();
  // Read before the guard: a hook called after a return is a hook called
  // a different number of times.
  const { clock } = trip
    ? settingsFor(trip)
    : { clock: "trip" as const };
  const timeZone = trip && clock === "trip" ? trip.preferredTimezone : null;
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);
  // Warms the list query the store reads from, so a deep link straight
  // here still finds the row once it lands.
  const { status, retry } = useTravelSection(trip?.id);
  const records = trip ? travelForTrip(trip) : [];
  // Who you are comes from the server: your own roster row, matched by
  // account, carries your role — never a query param.
  const { members: roster } = useMembers(trip?.id);
  const going = goingMembers(roster);
  const viewer = viewerOf(roster, user?.id);
  // The same board the row was read off, so the two screens can never
  // disagree about which record a row is. Derived rather than memoised:
  // `records` is a fresh array out of the store on every render, so a
  // `useMemo` keyed on it re-ran anyway while appearing to cache.
  const board = trip ? travelBoard(records, timeZone, going) : null;
  const row =
    rowId === undefined || !board
      ? undefined
      : [...board.arrivals, ...board.departures].find(
          (candidate) => candidate.id === rowId,
        );

  if (!trip) {
    return <NotFound />;
  }

  if (!row) {
    // While the list loads the row may simply not have arrived yet: only
    // the landed read gets to say it is gone. The states are the board's
    // own, so a cold link from a phone with no signal says so instead of
    // claiming the travel is missing.
    if (status === "loading") {
      return (
        <FullscreenDialog title="Travel" dismissHref="/trips">
          <LoadingBlock label="Loading travel details" />
        </FullscreenDialog>
      );
    }
    if (status === "offline") {
      return (
        <FullscreenDialog title="Travel" dismissHref="/trips">
          <OfflineBlock onRetry={retry} />
        </FullscreenDialog>
      );
    }
    if (status === "error") {
      return (
        <FullscreenDialog title="Travel" dismissHref="/trips">
          <InlineError
            message="Couldn't load the travel"
            onRetry={retry}
          />
        </FullscreenDialog>
      );
    }
    return (
      <FullscreenDialog title="Travel" dismissHref="/trips">
        <Text className="font-body text-base text-ink">
          That travel is not on this trip any more.
        </Text>
      </FullscreenDialog>
    );
  }

  // The organizer corrects anyone; a traveler touches only their own —
  // the board's own rule, so the two screens give the same answer.
  const canEdit =
    (viewer?.isOrganizer ?? false) || (viewer?.id ?? "") === row.memberId;
  // An unscheduled row has no record to edit, so it opens the form on the
  // member and the direction instead — which is how that row ever gets a
  // time at all.
  const editHref = row.id.startsWith("pending-")
    ? `/trips/travel/form?id=${trip.id}&member=${row.memberId}&direction=${row.travelType}`
    : `/trips/travel/form?id=${trip.id}&travel=${row.id}`;
  // The clock, read on the same zone the board read it on. A row with no
  // date and time says so in the board's words rather than showing an empty
  // heading. `date` and `time` come off the same instant in `travelBoard`,
  // so this asks about both rather than assuming one from the other.
  const when =
    row.date && row.time
      ? joinFacts(formatDay(row.date), wallClock(row.time, timeZone).time)
      : NOT_SHARED;

  return (
    <FullscreenDialog
      title="Travel"
      primaryTitle={canEdit ? "Edit travel" : "Done"}
      onPrimary={
        canEdit ? () => router.push(editHref) : dismiss
      }
      dismissHref={`/trips/travel?id=${trip.id}`}
    >
      {/* The time is the heading, because that is the fact the row was
          pressed for; whose it is and which way it goes sit under it as
          the two facts a reader needs before they can act on it. */}
      <View className="gap-2">
        <Text className="font-body-bold text-heading-md text-ink">
          {when}
        </Text>
        <Text className="font-body text-base text-ink">
          {joinFacts(row.memberName, DIRECTION_WORD[row.travelType])}
        </Text>
      </View>

      {row.location ? (
        <RuledBlock title="Where">
          <Text className="font-body text-base text-ink">
            {row.location}
          </Text>
        </RuledBlock>
      ) : null}

      {row.flightNumber ? (
        <RuledBlock title="Flight">
          <Text className="font-body text-base text-ink">
            {/* The row holds the compact form the lookup wants
                ("UA1842"); the space is the app's, put back where a
                person expects to see it. */}
            {formatFlightNumber(row.flightNumber)}
          </Text>
        </RuledBlock>
      ) : null}

      {row.details ? (
        <RuledBlock title="Details">
          <Text
            selectable
            className="font-body text-base leading-relaxed text-ink"
          >
            {row.details}
          </Text>
        </RuledBlock>
      ) : null}

      {/* There is no second Edit button at the foot. The bar above already
          carries the primary for this same destination — labelled "Edit
          travel" whether the row has a time or still owes one — and the body
          button that used to sit here said "Add times" for that identical
          href: two names for one door. */}
    </FullscreenDialog>
  );
}