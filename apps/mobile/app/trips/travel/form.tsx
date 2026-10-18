import { useMemo, useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { TravelDialog } from "@/components/trip/TravelDialog";
import {
  buildLegRecord,
  legFromRecord,
  travelForMemberDirection,
  type LegSeed,
  type TravelDirection,
  type TravelLeg,
} from "@/lib/newTravel";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useTravel } from "@/lib/travelStore";
import {
  useTravel as useTravelSection,
  useMyTravelLocations,
} from "@/lib/queries/travel";
import { travelWhere } from "@/lib/travelWhere";
import { travelFormGate } from "@/lib/travelGate";
import { toErrorCopy } from "@/lib/queries/errors";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { useAuth } from "@/lib/authStore";
import { goingMembers, travelMemberOptions, viewerOf } from "@/lib/members";
import { useMembers } from "@/lib/queries/members";

import { useDismiss, useDismissTo } from "@/hooks/useDismiss";

/**
 * Travel form — one screen for both verbs, and the same screen for both
 * roles. With a `travel` param it opens on that record; with none,
 * blank. Saving upserts each direction that has been filled in: a
 * member with travel that way already gets that row updated, not a
 * second one beside it.
 *
 * Who can file for whom is the API's rule, mirrored here: the organizer
 * files for anyone, a traveler is locked to self. The role comes from
 * the server — your own roster row, matched by account.
 */
export default function TravelForm() {
  return (
    <TripGate label="Loading travel details">
      <TravelFormScreen />
    </TripGate>
  );
}

function TravelFormScreen() {
  const { id, travel: travelId, duplicate: duplicateId, member, direction } =
    useLocalSearchParams<{
      id?: string;
      travel?: string;
      duplicate?: string;
      member?: string;
      direction?: string;
    }>();
  const { travelById, travelForTrip, addTravel, updateTravel, deleteTravel } =
    useTravel();
  // The last save's or delete's failure, fed to the dialog's
  // InlineError. The dialog stays open on failure.
  const [serverError, setServerError] = useState<string | null>(null);
  // A write in flight. The dialog's buttons stop on it, so a second
  // press cannot save twice or delete a direction being saved.
  const [saving, setSaving] = useState(false);
  const { for: settingsFor, update } = useTripSettings();
  const router = useRouter();

  const tripId = typeof id === "string" ? id : undefined;
  // Where this form's writes belong, and the one address the dialog's
  // chrome, its gate and its save share. The board, not the trips list:
  // the list is the app's home, not this form's parent — the board is what
  // files travel and what a filed row appears on — and the form has two
  // parents (the board's own Add travel, and the trip page's action list),
  // so the one address has to be the screen they both lead through. Read
  // from the param rather than from the trip so a failed trip read still
  // has somewhere to go.
  const boardHref = tripId ? `/trips/travel?id=${tripId}` : "/trips";
  // One pop: an edit belongs to the record sheet it was opened from, and
  // an add belongs to the board it was pushed from.
  const dismiss = useDismiss(boardHref);
  // A duplicate's row is on the board, two screens down — see the save's
  // own note, and `useDismissTo`.
  const dismissToBoard = useDismissTo(boardHref);
  const { trip } = useTrip(tripId);
  // Warms the section query the store reads from, so a cold load
  // (deep link straight here) still finds the record once it lands. Its
  // `retry` is the gate's below: a read that failed is a form that must
  // not open empty, and asking again is how it opens.
  const { status: sectionStatus, retry: retrySection } = useTravelSection(
    trip?.id,
  );
  // The `Where` field's cross-trip suggestions. Read for its rows only,
  // never for its status: the field already works from this trip's own
  // wheres and the trip's destination, so a failed read narrows the list
  // instead of blocking the form (see `useMyTravelLocations`).
  const { locations: otherLocations } = useMyTravelLocations();
  // The zone the fields mean: the trip's own clock setting, the same one
  // the board behind this form is reading. What is typed is stamped in
  // it, and what it stamps is read back in it.
  const { clock } = trip
    ? settingsFor(trip)
    : { clock: "trip" as const };
  const timeZone = clock === "trip" ? (trip?.preferredTimezone ?? null) : null;
  // A form sets times on the same clock the screen behind it reads them
  // on, so the zone it is writing in is the zone the chrome names.
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);
  const { user } = useAuth();
  const editingId = typeof travelId === "string" ? travelId : undefined;
  const record = trip ? travelById(trip, editingId) : undefined;
  // The row a duplicate copies from. `travel` wins when both are present:
  // an edit is about one record, and a seed under it would only be
  // confusing.
  const duplicateOf =
    typeof duplicateId === "string" ? duplicateId : undefined;
  const duplicateFrom =
    !editingId && duplicateOf && trip
      ? travelById(trip, duplicateOf)
      : undefined;
  const directionParam: TravelDirection | undefined =
    direction === "arrival" || direction === "departure" ? direction : undefined;

  // The member picker is server state now, suspended under the same
  // gate as the trip above.
  const { members: roster } = useMembers(trip?.id);
  // The board's own roster: who is going. Deliberately narrower than the
  // picker's list below. The viewer's own row and its organizer flag are
  // read from here, so a non-going member who happens to hold a record
  // cannot widen the list into granting that flag.
  const going = useMemo(() => goingMembers(roster), [roster]);

  // Read per render, never through a memo: a memo whose deps cannot
  // change (`[trip?.id]`) snapshots an empty list on a cold first render,
  // and the form then opens blank on a record that exists — the bug this
  // phase is here to kill. The board's own screens already read it this
  // way (`app/trips/travel.tsx`, `app/trips/travel/detail.tsx`).
  const records = trip ? travelForTrip(trip) : [];

  // Who can be filed for: everyone going, plus anyone who already holds
  // a record. Rebuilt per render rather than memoized, because `records`
  // is a fresh array each render and a memo over it would defeat itself;
  // the work is a Set and a filter over a dozen rows.
  const memberOptions = travelMemberOptions(roster, records);

  // Whose form this is: the record's member, a linked row's member, or
  // the viewer themselves — your own roster row, matched by account.
  const viewer = viewerOf(going, user?.id);
  const viewerIsOrganizer = viewer?.isOrganizer ?? false;
  // A `member=` in the URL may name anyone *the picker can name*: the same
  // list, not the narrower going roster. The delete path below redirects to
  // exactly this URL when one of two directions goes, and a member who
  // answered "maybe" after filing still owns what they filed — resolving
  // their id against `going` alone would drop the form back onto the
  // viewer, which is the wrong-member failure this file exists to prevent.
  // Outside this list the param is still ignored: a member nobody can name
  // would otherwise print their raw id in the field.
  const linkedMember =
    member && memberOptions.some((option) => option.id === member)
      ? member
      : undefined;

  // Which member the fields are about. The state holds only the *pick*;
  // until somebody picks, the answer is derived — which is what lets this
  // survive the read landing late.
  //
  // It cannot be a `useState` seeded once, and that is not a style choice.
  // The travel section is a plain query, not a suspended one, so on a cold
  // load `record` is undefined on the first render and a seed captured
  // there resolves to the *viewer* — leaving the form editing whoever is
  // signed in while the URL asks for somebody else's row, and saving it
  // would write to the wrong person. The gate below returns a loading
  // block on that render, so nothing is shown yet, but the hook has
  // already run by then and its value would outlive the wait. Derived, the
  // answer is simply right whenever the record arrives.
  //
  // A duplicate starts with nobody picked, because picking is the act: the
  // seed is a flight waiting for a name. Only an organizer can duplicate
  // at all, so a traveler still falls back to their own row rather than to
  // nobody.
  const [pickedMemberId, setPickedMemberId] = useState<string | null>(null);
  const memberId =
    pickedMemberId ??
    (duplicateFrom && viewerIsOrganizer
      ? ""
      : (record?.memberId ?? linkedMember ?? viewer?.id ?? ""));

  // What the picked member already holds, per direction. `filed` and the
  // delete target derive from the same lookup, so Delete always names
  // the row of the member you are looking at — not the one you started
  // on before a `Who` change.
  const filed = {
    arrival: Boolean(travelForMemberDirection(records, memberId, "arrival")),
    departure: Boolean(
      travelForMemberDirection(records, memberId, "departure"),
    ),
  };
  // The verb follows whether saving will update or create for the picked
  // member, which is a question about this member, not about how the
  // screen was opened.
  const editingExisting = filed.arrival || filed.departure;

  if (!trip) {
    return <NotFound />;
  }

  // Nothing opens until the section read has landed — one gate for every
  // door, because the reason is the same for all of them. The rule is
  // `travelFormGate` (`lib/travelGate.ts`), which is where the reasoning
  // lives and where it is tested; what belongs here is the screen's half
  // of it, the copy each way out gets.
  //
  // The section is a plain query, not a suspension, while the two reads
  // above it are suspended by the trip gate: a cold load reaches this line
  // with `records` still empty and the roster already here, and an empty
  // read is the seed rather than a blank that fills in later
  // (`components/trip/TravelDialog.tsx`). The `travel=` and `duplicate=`
  // doors are guarded by the record each names — the one to edit and the
  // one to copy; the `member=` door and the bare add door name no record,
  // so they had nothing to wait for and opened on the empty read. That is
  // why "not still loading" is not the test — a failed read is just as
  // empty, and the save that follows it clears every field the body
  // leaves out.
  const gate = travelFormGate({
    status: sectionStatus,
    // Both doors that name a row count here, and the duplicate names the
    // *source* one: `travel=` is the record this form edits, `duplicate=`
    // the record it copies. Reading only the first left a stale duplicate
    // URL opening a blank add whose Who had already fallen back to the
    // viewer (`memberId` above), so a save from it filed for the wrong
    // person — the same class of failure this gate exists for, one door
    // further out. A URL carrying both is an edit: it says so below, in
    // the note above the seed.
    namesRecord: Boolean(editingId) || Boolean(duplicateOf),
    recordFound: Boolean(record) || Boolean(duplicateFrom),
  });

  if (gate !== "open") {
    // The board, like every other way out of this form: the gate stands in
    // for the form the address asked for (`boardHref` above), so it leaves
    // onto the screen that form belongs to rather than onto the trips
    // list. Without it the form answered "where do you land with no
    // history behind you" twice, in two different places.
    return (
      <FullscreenDialog title="Travel" dismissHref={boardHref}>
        {gate === "loading" ? (
          <LoadingBlock label="Loading travel details" />
        ) : gate === "offline" ? (
          <OfflineBlock onRetry={retrySection} />
        ) : gate === "failed" ? (
          <InlineError
            message="Couldn't load the travel"
            onRetry={retrySection}
          />
        ) : (
          // Landed, and this door names a row that is not in the answer.
          <Text className="font-body text-base text-ink">
            That travel is not on this trip any more.
          </Text>
        )}
      </FullscreenDialog>
    );
  }

  // Both directions, read out of the one row being copied: a leg's two
  // ends live in a single record, so the same row read as an arrival and
  // as a departure is the flight both ways. A seat that the record never
  // had stays empty, and an empty leg is untouched rather than wrong.
  const seed: LegSeed | undefined = duplicateFrom
    ? {
        arrival: legFromRecord(
          duplicateFrom,
          "arrival",
          timeZone,
          trip.startDate,
          trip.endDate,
        ),
        departure: legFromRecord(
          duplicateFrom,
          "departure",
          timeZone,
          trip.startDate,
          trip.endDate,
        ),
      }
    : undefined;

  return (
    <TravelDialog
      title={
        duplicateFrom
          ? "Duplicate travel"
          : editingExisting
            ? "Edit travel"
            : "Add travel"
      }
      primaryTitle={
        editingExisting
          ? saving
            ? "Saving changes"
            : "Save changes"
          : saving
            ? "Adding travel"
            : "Add travel"
      }
      trip={trip}
      timeZone={timeZone}
      members={memberOptions}
      viewerIsOrganizer={viewerIsOrganizer}
      lockedMember={viewer}
      memberId={memberId}
      onMemberChange={setPickedMemberId}
      records={records}
      seed={seed}
      openDirection={
        record?.travelType ?? duplicateFrom?.travelType ?? directionParam ?? "arrival"
      }
      whereEntries={travelWhere(records, trip, otherLocations)}
      filed={filed}
      dismissHref={boardHref}
      serverError={serverError}
      pending={saving}
      onDelete={(direction) => {
        // Deleting is per direction: the panel you are in is what goes,
        // and each direction is its own server row. The row is looked up
        // by the member and the direction rather than remembered, so it
        // follows a `Who` change.
        const existing = travelForMemberDirection(
          records,
          memberId,
          direction,
        );
        if (!existing) return;
        // A failed delete stays on the form with the failure instead of
        // leaving.
        setServerError(null);
        setSaving(true);
        void deleteTravel(trip.id, existing.id)
          .then(
            () => {
              // The form is about the member's travel, and a direction is
              // part of it: with the other direction still filed there is
              // still something on screen to read and edit, so deleting
              // one of two does not throw the reader out to the board.
              // It leaves only when nothing is left — the same rule the
              // board's own door follows.
              const other: TravelDirection =
                direction === "arrival" ? "departure" : "arrival";
              if (!travelForMemberDirection(records, memberId, other)) {
                router.replace(boardHref);
                return;
              }
              // Staying means the URL must stop naming the row that is
              // gone: `travel=<id>` resolves to nothing now, and the gate
              // above would answer "that travel is not on this trip any
              // more" over a form that is still perfectly usable. So the
              // address becomes the member's, which is what this screen
              // is about, plus the panel that was open — the reader keeps
              // the direction they were looking at, now empty.
              router.replace(
                `/trips/travel/form?id=${trip.id}` +
                  (memberId ? `&member=${memberId}` : "") +
                  `&direction=${direction}`,
              );
            },
            (error: unknown) =>
              setServerError(
                toErrorCopy(error).message ?? "Couldn't delete the travel.",
              ),
          )
          .finally(() => setSaving(false));
      }}
      onSubmit={(input) => {
        const target = memberOptions.find(
          (candidate) => candidate.id === input.memberId,
        );
        const memberName = target?.name ?? record?.memberName ?? "";

        const saves: Array<Promise<unknown>> = [];
        for (const legDirection of ["arrival", "departure"] as const) {
          const existing = travelForMemberDirection(
            records,
            input.memberId,
            legDirection,
          );
          const next = buildLegRecord(
            input[legDirection],
            legDirection,
            existing?.id ?? `custom-${legDirection}-${Date.now()}`,
            input.memberId,
            memberName,
            timeZone,
          );
          // An untouched direction is unshared: nothing to save.
          if (!next) continue;
          // The built row is the optimistic paint the store swaps the
          // server record in by.
          saves.push(
            existing
              ? updateTravel(trip.id, existing.id, next)
              : addTravel(trip.id, next),
          );
        }
        // The dialog stays open on failure: dismissing would pretend
        // it saved.
        setServerError(null);
        setSaving(true);
        // Where a save lands is a question about the write, not about the
        // form, and there are three answers. An edit goes back to the
        // record's sheet: one pop, the thing you changed, updated. An add
        // goes back to the board it was pushed from: one pop, with the new
        // row on it. A duplicate is the one that is neither — its row is
        // on the board, but the form sits on top of the *source* record's
        // sheet, so a single pop leaves you reading somebody else's record
        // with nothing on it of what you just filed, which is what the
        // screen did until this became a rule. `dismissToBoard` takes the
        // whole stack off down to the board, and replaces when a cold load
        // has no stack to take off (see `useDismissTo`). The sheet already
        // answers this for the copy it files itself — "the result is a row
        // on the board, so the board is where the sheet leaves you"
        // (`detail.tsx`) — and this is that rule one screen deeper rather
        // than a second opinion about it.
        void Promise.all(saves)
          .then(
            () => (duplicateFrom ? dismissToBoard() : dismiss()),
            (error: unknown) =>
              setServerError(
                toErrorCopy(error).message ?? "Couldn't save the travel.",
              ),
          )
          .finally(() => setSaving(false));
      }}
    />
  );
}

export type { TravelLeg };
