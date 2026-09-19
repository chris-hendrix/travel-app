import { Suspense } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { TravelDialog } from "@/components/trip/TravelDialog";
import { buildTravel, draftFromTravel } from "@/lib/newTravel";
import { useTrips } from "@/lib/tripsStore";
import { useTravel } from "@/lib/travelStore";
import { membersFor } from "@/mocks/members";
import { zoneOffsetFor } from "@/mocks/events";
import { useDismiss } from "@/hooks/useDismiss";

/**
 * Travel form — one screen for both verbs. With a `travel` param it
 * edits that record; without one it adds, and adding onto a member and
 * direction that already has a row updates it instead of doubling it.
 * An edit is an add you have already made, so there is one form, not
 * two to keep in step.
 *
 * Deleting lives here too: the form is already the place you are
 * deciding what this travel is, and the board row behind it has one job
 * and should keep it.
 */
export default function TravelForm() {
  return (
    <Suspense fallback={null}>
      <TravelFormScreen />
    </Suspense>
  );
}

function TravelFormScreen() {
  const { id, travel: travelId } = useLocalSearchParams<{
    id?: string;
    travel?: string;
  }>();
  const { trips } = useTrips();
  const { travelById, travelForTrip, addTravel, updateTravel, deleteTravel } =
    useTravel();
  const dismiss = useDismiss("/design/trips");
  const router = useRouter();

  const tripId = typeof id === "string" ? id : undefined;
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];
  const editingId = typeof travelId === "string" ? travelId : undefined;
  const record = trip ? travelById(trip, editingId) : undefined;

  // Deleting leaves nothing to go back to, so the board is where it
  // ends — replacing, not dismissing, because dismissing would land on
  // the form we just deleted from.
  const boardHref = `/design/trips/travel?id=${trip?.id ?? ""}`;

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

  const members = membersFor(trip).filter(
    (member) => member.status === "going",
  );
  const initial = record
    ? draftFromTravel(record, record.memberName, trip.preferredTimezone)
    : undefined;

  return (
    <TravelDialog
      title={record ? "Edit travel" : "Add travel"}
      primaryTitle={record ? "Save changes" : "Add travel"}
      trip={trip}
      members={members}
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

        if (record) {
          // Rebuilt rather than patched: the form sets every field the
          // record has, so what it returns is the record.
          const next = buildTravel(
            input,
            record.id,
            memberName,
            zoneOffsetFor(trip.id),
          );
          updateTravel(trip.id, record.id, next);
          dismiss();
          return;
        }

        // No double rows: a member with travel in this direction already
        // gets that row updated, not a second one beside it.
        const existing = travelForTrip(trip).find(
          (candidate) =>
            candidate.memberId === input.memberId &&
            candidate.travelType === input.direction,
        );
        const next = buildTravel(
          input,
          existing?.id ?? `custom-${Date.now()}`,
          memberName,
          zoneOffsetFor(trip.id),
        );
        if (existing) updateTravel(trip.id, existing.id, next);
        else addTravel(trip.id, next);
        dismiss();
      }}
    />
  );
}
