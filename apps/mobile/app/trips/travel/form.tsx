import { useMemo, useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { TravelDialog } from "@/components/trip/TravelDialog";
import {
  buildLegRecord,
  legFromRecord,
  type TravelDirection,
  type TravelLeg,
} from "@/lib/newTravel";
import { getPertinentLocation, getPertinentTime } from "@journiful/shared/utils";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useTravel } from "@/lib/travelStore";
import { useTravel as useTravelSection } from "@/lib/queries/travel";
import { toErrorCopy } from "@/lib/queries/errors";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { viewerMember } from "@/lib/members";
import { useMembers } from "@/lib/queries/members";
import type { MockTravel } from "@/mocks/travel";

import { useDismiss } from "@/hooks/useDismiss";

/**
 * Travel form — one screen for both verbs, and the same screen for both
 * roles. With a `travel` param it opens on that record; with none,
 * blank. Saving upserts each direction that has been filled in: a
 * member with travel that way already gets that row updated, not a
 * second one beside it.
 *
 * Who can file for whom is the API's rule, mirrored here: the organizer
 * files for anyone, a traveler is locked to self. The lab threads the
 * role down from the board so the two can never disagree.
 */
export default function TravelForm() {
  return (
    <TripGate label="Travel details">
      <TravelFormScreen />
    </TripGate>
  );
}

function TravelFormScreen() {
  const { id, travel: travelId, as, member, direction } = useLocalSearchParams<{
    id?: string;
    travel?: string;
    as?: string;
    member?: string;
    direction?: string;
  }>();
  const { travelById, travelForTrip, addTravel, updateTravel, deleteTravel } =
    useTravel();
  // The last save's or delete's failure, fed to the dialog's
  // InlineError. The dialog stays open on failure.
  const [serverError, setServerError] = useState<string | null>(null);
  const { for: settingsFor, update } = useTripSettings();
  const dismiss = useDismiss("/trips");
  const router = useRouter();

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  // Warms the section query the store reads from, so a cold load
  // (deep link straight here) still finds the record once it lands.
  const { status: sectionStatus } = useTravelSection(trip?.id);
  // The zone the fields mean: the trip's own clock setting, the same one
  // the board behind this form is reading. What is typed is stamped in
  // it, and what it stamps is read back in it.
  const { clock } = trip
    ? settingsFor(trip, new Date())
    : { clock: "trip" as const };
  const timeZone = clock === "trip" ? (trip?.preferredTimezone ?? null) : null;
  // A form sets times on the same clock the screen behind it reads them
  // on, so the zone it is writing in is the zone the chrome names.
  useDisplayZone(trip ? zoneFor(trip, clock, update) : null);
  // The lab's stand-in for `isOrganizer` on the membership, threaded
  // down from the board so the two can never disagree.
  const viewerIsOrganizer = as === "organizer";
  const editingId = typeof travelId === "string" ? travelId : undefined;
  const record = trip ? travelById(trip, editingId) : undefined;
  const directionParam: TravelDirection | undefined =
    direction === "arrival" || direction === "departure" ? direction : undefined;

  // The member picker is server state now, suspended under the same
  // gate as the trip above.
  const { members: roster } = useMembers(trip?.id);
  const members = useMemo(
    () => roster.filter((member) => member.status === "going"),
    [roster],
  );

  const records = useMemo(
    () => (trip ? travelForTrip(trip) : []),
    [trip?.id],
  );

  // Whose form this is: the record's member, a linked row's member, or
  // the viewer themselves.
  const filedMemberIds = records
    .filter((candidate) => getPertinentTime(candidate))
    .map((candidate) => candidate.memberId);
  const viewer = viewerMember(members, viewerIsOrganizer, filedMemberIds);
  const linkedMember =
    member && members.some((candidate) => candidate.id === member)
      ? member
      : undefined;
  const memberId = record?.memberId ?? linkedMember ?? viewer?.id ?? "";

  // Both directions for that member, so the tabs open prefilled and
  // saving keeps the pair in step.
  const theirs = records.filter(
    (candidate) => candidate.memberId === memberId,
  );
  const arrivalRecord = theirs.find(
    (candidate) => candidate.travelType === "arrival",
  );
  const departureRecord = theirs.find(
    (candidate) => candidate.travelType === "departure",
  );

  const boardHref = `/trips/travel?id=${trip?.id ?? ""}&as=${viewerIsOrganizer ? "organizer" : "traveler"}`;

  if (!trip) {
    return <NotFound />;
  }

  if (editingId && !record) {
    // While the section loads the record may simply not have arrived
    // yet: only the landed read gets to say it is gone.
    if (sectionStatus === "loading") {
      return (
        <FullscreenDialog title="Travel" dismissHref="/trips">
          <LoadingBlock label="Travel" />
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

  const initial = record
    ? {
        memberId,
        arrival: arrivalRecord
          ? legFromRecord(
              arrivalRecord,
              "arrival",
              timeZone,
              trip.startDate,
              trip.endDate,
            )
          : undefined,
        departure: departureRecord
          ? legFromRecord(
              departureRecord,
              "departure",
              timeZone,
              trip.startDate,
              trip.endDate,
            )
          : undefined,
        direction: record.travelType,
      }
    : linkedMember || directionParam
      ? {
          memberId,
          arrival: undefined,
          departure: undefined,
          direction: directionParam ?? "arrival",
        }
      : undefined;

  return (
    <TravelDialog
      title={record ? "Edit travel" : "Add travel"}
      primaryTitle={record ? "Save changes" : "Add travel"}
      trip={trip}
      timeZone={timeZone}
      members={members}
      viewerIsOrganizer={viewerIsOrganizer}
      lockedMember={viewer}
      whereSuggestions={suggestionsFrom(records)}
      filed={{
        arrival: Boolean(arrivalRecord),
        departure: Boolean(departureRecord),
      }}
      dismissHref={boardHref}
      initial={initial}
      serverError={serverError}
      onDelete={
        record
          ? (direction) => {
              // Deleting is per direction: the panel you are in is what
              // goes, and each direction is its own server row.
              const existing =
                direction === "arrival" ? arrivalRecord : departureRecord;
              if (!existing) return;
              // A failed delete stays on the form with the failure
              // instead of leaving.
              setServerError(null);
              void deleteTravel(trip.id, existing.id).then(
                () => router.replace(boardHref),
                (error: unknown) =>
                  setServerError(
                    toErrorCopy(error).message ??
                      "Couldn't delete the travel.",
                  ),
              );
            }
          : undefined
      }
      onSubmit={(input) => {
        const target = members.find(
          (candidate) => candidate.id === input.memberId,
        );
        const memberName = target?.name ?? record?.memberName ?? "";

        const saves: Array<Promise<unknown>> = [];
        for (const legDirection of ["arrival", "departure"] as const) {
          const existing = records.find(
            (candidate) =>
              candidate.memberId === input.memberId &&
              candidate.travelType === legDirection,
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
        void Promise.all(saves).then(
          () => dismiss(),
          (error: unknown) =>
            setServerError(
              toErrorCopy(error).message ?? "Couldn't save the travel.",
            ),
        );
      }}
    />
  );
}

/** Past wheres on this trip, so the field suggests rather than guesses. */
function suggestionsFrom(records: MockTravel[]): string[] {
  const seen = new Set<string>();
  for (const record of records) {
    const location = getPertinentLocation(record);
    if (location) seen.add(location);
  }
  return [...seen].sort();
}

export type { TravelLeg };
