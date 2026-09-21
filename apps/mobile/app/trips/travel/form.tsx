import { useMemo } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
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
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { viewerMember } from "@/lib/members";
import { membersFor } from "@/mocks/members";
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
  const { for: settingsFor, update } = useTripSettings();
  const dismiss = useDismiss("/trips");
  const router = useRouter();

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
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

  const members = useMemo(
    () =>
      trip
        ? membersFor(trip).filter((member) => member.status === "going")
        : [],
    [trip],
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
      onDelete={
        record
          ? () => {
              deleteTravel(trip.id, record.id);
              router.replace(boardHref);
            }
          : undefined
      }
      onSubmit={(input) => {
        const target = members.find(
          (candidate) => candidate.id === input.memberId,
        );
        const memberName = target?.name ?? record?.memberName ?? "";

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
          if (existing) updateTravel(trip.id, existing.id, next);
          else addTravel(trip.id, next);
        }
        dismiss();
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
