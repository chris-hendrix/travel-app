import { Suspense, useMemo } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { TravelDialog } from "@/components/trip/TravelDialog";
import { buildSectionRecord, type TravelSectionInput } from "@/lib/newTravel";
import { wallClock } from "@/lib/timezone";
import { useTrips } from "@/lib/tripsStore";
import { useTravel } from "@/lib/travelStore";
import { membersFor } from "@/mocks/members";
import { zoneOffsetFor } from "@/mocks/events";
import { useDismiss } from "@/hooks/useDismiss";

/**
 * Travel form — one screen for both verbs. With a `travel` param it
 * opens on that record's member and direction; without one it starts
 * blank. Saving upserts each ticked direction: a member with travel
 * that way already gets that row updated, not a second one beside it.
 *
 * Who can file for whom is the API's rule, mirrored here: the
 * organizer files for anyone, a traveler is locked to self. The lab
 * threads the role down from the board so the two can never disagree.
 */
export default function TravelForm() {
  return (
    <Suspense fallback={null}>
      <TravelFormScreen />
    </Suspense>
  );
}

function sectionFromRecord(
  record: {
    time: string | null;
    location: string | null;
    flightNumber: string | null;
    details: string | null;
  },
  timeZone: string | null,
): Partial<TravelSectionInput> {
  const clock = record.time ? wallClock(record.time, timeZone) : null;
  return {
    enabled: true,
    day: clock?.date ?? "",
    time: clock?.clock ?? "",
    location: record.location ?? "",
    flightNumber: record.flightNumber ?? "",
    details: record.details ?? "",
  };
}

function TravelFormScreen() {
  const { id, travel: travelId, as, member, direction } = useLocalSearchParams<{
    id?: string;
    travel?: string;
    as?: string;
    member?: string;
    direction?: string;
  }>();
  const { trips } = useTrips();
  const { travelById, travelForTrip, addTravel, updateTravel, deleteTravel } =
    useTravel();
  const dismiss = useDismiss("/design/trips");
  const router = useRouter();

  const tripId = typeof id === "string" ? id : undefined;
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];
  // The lab's stand-in for `isOrganizer` on the membership, threaded
  // down from the board so the two can never disagree.
  const viewerIsOrganizer = as === "organizer";
  const editingId = typeof travelId === "string" ? travelId : undefined;
  const record = trip ? travelById(trip, editingId) : undefined;
  // A pending row links straight here with who and which way, so the
  // form opens on the right member with the right section ticked.
  const memberParam = typeof member === "string" ? member : undefined;
  const directionParam =
    direction === "arrival" || direction === "departure"
      ? direction
      : undefined;

  const members = useMemo(
    () =>
      trip
        ? membersFor(trip).filter((member) => member.status === "going")
        : [],
    [trip],
  );
  // The lab has no signed-in identity: the first traveler on the roster
  // stands in for "you".
  const lockedMember = members.find((member) => !member.isOrganizer) ?? null;
  // A linked member is only honored when they are on the roster — a
  // bad param falls back to the picker, never to a ghost record.
  const linkedMember =
    memberParam && members.some((m) => m.id === memberParam)
      ? memberParam
      : undefined;

  const records = useMemo(
    () => (trip ? travelForTrip(trip) : []),
    [trip?.id],
  );
  const whereSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const candidate of records) {
      if (candidate.location) seen.add(candidate.location);
    }
    return [...seen].sort();
  }, [records]);

  // Deleting leaves nothing to go back to, so the board is where it
  // ends — replacing, not dismissing, because dismissing would land on
  // the form we just deleted from.
  const boardHref = `/design/trips/travel?id=${trip?.id ?? ""}&as=${viewerIsOrganizer ? "organizer" : "traveler"}`;

  if (!trip) {
    return (
      <FullscreenDialog title="Travel" dismissHref="/design/trips">
        <Text className="font-body text-base text-ink">
          No trip to add to. Start one from the trips screen.
        </Text>
      </FullscreenDialog>
    );
  }

  if (editingId && !record) {
    return (
      <FullscreenDialog title="Travel" dismissHref="/design/trips">
        <Text className="font-body text-base text-ink">
          That travel is not on this trip any more.
        </Text>
      </FullscreenDialog>
    );
  }

  const timeZone = trip.preferredTimezone ?? null;
  // The record under edit, plus its counterpart when there is one, so
  // both sections open prefilled and saving keeps the pair in step.
  const counterpart = record
    ? records.find(
        (candidate) =>
          candidate.id !== record.id &&
          candidate.memberId === record.memberId &&
          candidate.travelType !== record.travelType,
      )
    : undefined;
  const arrivalRecord =
    record?.travelType === "arrival" ? record : counterpart?.travelType === "arrival" ? counterpart : undefined;
  const departureRecord =
    record?.travelType === "departure"
      ? record
      : counterpart?.travelType === "departure"
        ? counterpart
        : undefined;

  const initial =
    record || !viewerIsOrganizer || linkedMember || directionParam
      ? {
          memberId:
            record?.memberId ??
            linkedMember ??
            lockedMember?.id ??
            "",
          arrival:
            arrivalRecord
              ? sectionFromRecord(arrivalRecord, timeZone)
              : directionParam === "arrival"
                ? { enabled: true }
                : undefined,
          departure:
            departureRecord
              ? sectionFromRecord(departureRecord, timeZone)
              : directionParam === "departure"
                ? { enabled: true }
                : undefined,
        }
      : undefined;

  return (
    <TravelDialog
      title={record ? "Edit travel" : "Add travel"}
      primaryTitle={record ? "Save changes" : "Add travel"}
      trip={trip}
      members={members}
      viewerIsOrganizer={viewerIsOrganizer}
      lockedMember={lockedMember}
      whereSuggestions={whereSuggestions}
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
        const member = members.find((m) => m.id === input.memberId);
        const memberName = member?.name ?? record?.memberName ?? "";
        const offset = zoneOffsetFor(trip.id);

        for (const direction of ["arrival", "departure"] as const) {
          const section = input[direction];
          const existing = records.find(
            (candidate) =>
              candidate.memberId === input.memberId &&
              candidate.travelType === direction,
          );
          const next = buildSectionRecord(
            section,
            direction,
            existing?.id ?? `custom-${direction}-${Date.now()}`,
            input.memberId,
            memberName,
            offset,
          );
          // Unticked or invalid means unshared: nothing to save.
          if (!next) continue;
          if (existing) updateTravel(trip.id, existing.id, next);
          else addTravel(trip.id, next);
        }
        dismiss();
      }}
    />
  );
}
