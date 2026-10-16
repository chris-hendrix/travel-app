import { RuledBlock } from "@/components/ui/RuledBlock";
import { Fact } from "@/components/ui/Fact";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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
import {
  endLabel,
  hasLookup,
  modeLabel,
  numberLabel,
  whereLabel,
  type TravelSide,
} from "@/lib/transportMode";
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
 * The board's row is the roll call's row — the name with the mode beside
 * it, the where on the line under it, the day and the clock at the far
 * edge — and this screen is the rest of the record behind it.
 *
 * It opens on the name, the way every other record sheet in this app does
 * (`members/detail.tsx`, `stay/detail.tsx`, `events/detail.tsx`): a
 * record's own noun is the title, and the fact under it is a sub-line —
 * here the mode's chip and the direction word, because a dialog has no
 * board sections to file the row under. The title used to be the *when*,
 * which set one of the leg's optional facts at display size and left the
 * record itself as a line at body size.
 *
 * The facts under it are the leg's, in the order a person coordinates a
 * landing: the row's own end — its where, then its when — then the far
 * end the same way, then the number. Each is a `Fact`, the mode's noun in
 * the quiet column and the value in ink, rather than a titled block:
 * `Lands at` is a field label, not a heading, and the display floor a
 * block title wears made the label half again the size of the fact under
 * it. Every word still comes from the one table
 * (`lib/transportMode.ts`) — `whereLabel` over a place and `endLabel`
 * over a time, so a flight reads `Lands at`/`Lands` over its arrival and
 * `Leaves from`/`Leaves` over the other end, and a hire reads `Pickup
 * at`/`Pickup` over its pickup — and the number wears the mode's own name
 * for it (`Flight number`, `Train number`, `Bus service`). Every one of
 * those facts is optional, so a fact that holds nothing is not drawn at
 * all, and the block is drawn only where it has something to say: a
 * label, or a rule, over nothing says "something is here" when nothing
 * is. A row nobody has filed has no mode, so it has none of those words
 * and the block says the one thing there is to say instead —
 * `Not shared yet`.
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
 * reachable: it has no record to look up, only a place on the board. That
 * row's *far end* is the one fact read the other way, off the record
 * itself through `travelById`: the board's row carries the half the board
 * shows, and the other half is only on the `MockTravel` the store holds.
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
  const { travelById, travelForTrip } = useTravel();
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
  // The clock, read on the same zone the board read it on: the own end's
  // when. A row with no date and time says so in the board's words rather
  // than leaving the mode's own word for that end over an empty line.
  // `date` and `time` come off the same instant in `travelBoard`, so this
  // asks about both rather than assuming one from the other.
  const when =
    row.date && row.time
      ? joinFacts(formatDay(row.date), wallClock(row.time, timeZone).time)
      : NOT_SHARED;
  // The mode the row wears, and with it every word this sheet says about
  // how the leg is taken. Null on a row nobody has filed — the board's own
  // rule, the one that keeps a chip off an owed row — so such a row has no
  // mode to wear, no word from the table and no far end, and reads exactly
  // as it did before there was a mode at all: the name, the direction, and
  // `Not shared yet` where the leg's facts would be.
  const mode = row.transportMode;
  // The leg's other side, and it is the *side* the mode's words are keyed
  // by rather than the position of the field: the direction names the side
  // the record files and the validator requires, and the far end is the
  // side it does not, in every mode and both directions — a hire's own end
  // is the pickup on an arrival row and the dropoff on a departure one
  // (D4). Same two lines as the form's own far end.
  const farSide: TravelSide =
    row.travelType === "arrival" ? "departure" : "arrival";
  // The far end is the one fact the board's row does not carry: `TravelRow`
  // holds the half the board shows, so the other half is read back off the
  // record, by the same id the edit destination opens the form with. A
  // pending row has no record behind its id, so this is undefined for it
  // and nothing below renders.
  const record = travelById(trip, row.id);
  const arrived = row.travelType === "arrival";
  const farPlace = record
    ? arrived
      ? record.departureLocation
      : record.arrivalLocation
    : null;
  const farIso = record
    ? arrived
      ? record.departureTime
      : record.arrivalTime
    : null;
  const farClock = farIso ? wallClock(farIso, timeZone) : null;
  // The far end's day, said back only when it is not the own end's: the
  // own end's time already names its day one line above, and that day
  // again over the far end is the noise the form's `farEndNote` refuses,
  // for the same reason. A row that shares no time names no day at all,
  // and the far end's own is then the only one there is — which is what
  // this very comparison gives, since no date can equal nothing. The place
  // and the time are separate facts on this sheet, so what `farEnd` used
  // to join is split: the place is its own row and this is the time's.
  const farDay =
    farClock && farClock.date !== row.date ? formatDay(farClock.date) : null;
  const farWhen = joinFacts(farDay, farClock?.time);
  // The number, under the mode's own name for it — and no fact at all
  // where the mode keeps none (D5): car, rental and other have no number
  // field in the form either, so a number a record holds against one of
  // them is not this sheet's to announce. The space goes back in for the
  // flight alone, the one mode's number the app formats (`hasLookup`, the
  // same gate the field's Autofill and `formatFlightNumber` use); every
  // other mode's reads as it was filed.
  const number = mode === null ? null : numberLabel(mode);
  const numberText = !row.flightNumber
    ? null
    : mode !== null && hasLookup(mode)
      ? formatFlightNumber(row.flightNumber)
      : row.flightNumber;
  // The leg's facts, in the order the sheet reads them: the row's own end,
  // its where and then its when, the far end the same way, and the number
  // last. Each label is the end's own word out of the one table the form's
  // fields come from — `whereLabel` over a place, `endLabel` over a time —
  // read by the **side** the end is, which is what makes a hire's own end
  // read `Pickup at` on an arrival row and `Dropoff at` on a departure
  // one. A fact that holds nothing is not in the list at all: a label over
  // an empty line is a word about nothing.
  //
  // They are rows of one block rather than a block each, which is also
  // what the rule census (check 9) counts: it counts the places a person
  // chose a mark, not the rules that reach the screen, so a block per fact
  // here would spend five marks on the one boundary this block draws.
  const facts: Array<{ label: string; value: string }> =
    mode === null
      ? []
      : [
          {
            label: whereLabel(mode, row.travelType),
            value: row.location ?? "",
          },
          { label: endLabel(mode, row.travelType), value: when },
          { label: whereLabel(mode, farSide), value: farPlace ?? "" },
          { label: endLabel(mode, farSide), value: farWhen },
          ...(number && numberText
            ? [{ label: number, value: numberText }]
            : []),
        ].filter((fact) => fact.value.trim() !== "");

  return (
    <FullscreenDialog
      title="Travel"
      primaryTitle={canEdit ? "Edit travel" : "Done"}
      onPrimary={
        canEdit ? () => router.push(editHref) : dismiss
      }
      dismissHref={`/trips/travel?id=${trip.id}`}
    >
      {/* The name is the title, the way every other record sheet in this
          app opens: the row was pressed for a person, and what this
          screen shows is their record. Under it the two facts a reader
          needs before they can act on it: how they are travelling, and
          which way the leg goes. The chip is the mode's own name and
          nothing else — never a word read off the direction or the where,
          and no hue (a mode is a classifier, and `Badge`'s neutral ink is
          what a classifier wears). It appears once, and a row nobody has
          filed wears none: the chip says what a member answered. */}
      <View className="gap-2">
        <Text className="font-display-extrabold text-display-md uppercase text-ink md:text-display-md-wide">
          {row.memberName}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          {mode ? (
            <Badge label={modeLabel(mode)} variant="category" size="sm" />
          ) : null}
          <Text className="font-body text-base text-ink">
            {DIRECTION_WORD[row.travelType]}
          </Text>
        </View>
      </View>

      {/* The leg's facts, in one block: the row's own end first, its where
          and then its when, the far end the same way, and the number under
          the mode's own name for it. A fact that holds nothing is not in
          the list, and the block is not drawn where the list is empty — an
          owed row has no mode, so it has none of these words and says the
          one thing it can instead. */}
      {mode === null || facts.length > 0 ? (
        <RuledBlock>
          {mode === null ? (
            <Text className="font-body text-base text-ink">{NOT_SHARED}</Text>
          ) : (
            facts.map((fact) => (
              <Fact key={fact.label} label={fact.label}>
                <Text className="font-body text-base text-ink">
                  {fact.value}
                </Text>
              </Fact>
            ))
          )}
        </RuledBlock>
      ) : null}

      {row.details ? (
        <RuledBlock>
          <Text
            selectable
            className="font-body text-base leading-relaxed text-ink"
          >
            {row.details}
          </Text>
        </RuledBlock>
      ) : null}

      {/* Duplicating is the couple's case, and it belongs on this screen
          because this is the one that shows a person's travel whole: the
          same flight, filed for someone else.

          A quiet sentence and then the button, which is the shape the
          roster's `Manage` block uses: the sentence carries the meaning —
          it names who the door is for and what happens to the record — so
          the button needs nothing but its verb. The button takes
          `secondary` and neither `fullWidth` nor `align`, so it fills the
          column on a phone — a thumb target beats a tidy box — and hugs
          the start edge from md up: a secondary action as wide as the page
          reads as the page's own.

          Organizer-only, and that is not caution — the API refuses a
          `memberId` from anyone else, so showing this to a traveler
          would be a door onto a 403. An unscheduled row has nothing to
          copy, so it has no door either. */}
      {(viewer?.isOrganizer ?? false) && !row.id.startsWith("pending-") ? (
        <RuledBlock>
          <View className="gap-2">
            <Text className="font-body text-sm text-ink opacity-60">
              Files the same travel for another member of this trip.
            </Text>
            <Button
              title="Duplicate"
              variant="secondary"
              onPress={() =>
                router.push(
                  `/trips/travel/form?id=${trip.id}&duplicate=${row.id}`,
                )
              }
            />
          </View>
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