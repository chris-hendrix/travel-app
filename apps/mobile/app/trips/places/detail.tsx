import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { PlaceDetail } from "@/components/trip/PlaceDetail";
import { TripGate } from "@/components/trip/TripGate";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { useDismiss, useDismissTo } from "@/hooks/useDismiss";
import { useAuth } from "@/lib/authStore";
import { viewerOf } from "@/lib/members";
import { useMembers } from "@/lib/queries/members";
import { usePinSavedPlace, useSavedPlaces } from "@/lib/queries/savedPlaces";
import { useTrip } from "@/lib/tripsStore";
import NotFound from "@/app/+not-found";

/**
 * One saved place, opened from the list: the photo, the address and its
 * verbs, the saver's note, and who saved it.
 *
 * The row is read through the section hook, never from
 * `queryClient.getQueryData` — the cache is where a row that was deleted
 * on another phone still sits, and this dialog is the one that says
 * whether there is still something to read. A settled read that does not
 * carry the row says so; a read that has not landed yet says what it is
 * waiting for.
 *
 * The author, or anybody running the trip: the API's own rule for a
 * write (`canEditSavedPlace` — author or organizer), mirrored rather
 * than invented, the way the settle sheet mirrors `canModifyPayment`.
 * Everyone else gets Done. The pin is the organizer's alone and sits in
 * the body, not the bar, so the bar keeps the one verb every sibling
 * sheet keeps: Edit for those who may, Done for those who may not.
 */
export default function SavedPlaceDetailRoute() {
  return (
    <TripGate label="Loading place details">
      <SavedPlaceDetailScreen />
    </TripGate>
  );
}

function SavedPlaceDetailScreen() {
  const { id, place: placeParam } = useLocalSearchParams<{
    id?: string;
    place?: string;
  }>();
  const router = useRouter();
  const dismiss = useDismiss("/trips");

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  const { user } = useAuth();
  const { members } = useMembers(trip?.id);
  const viewer = viewerOf(members, user?.id);
  const saved = useSavedPlaces(trip?.id);
  // Read before the guards: a hook called after a return is a hook called
  // a different number of times. The mutation never fires without a row,
  // so the empty key below is never read — it only keeps the hook above
  // the early returns.
  const pin = usePinSavedPlace(trip?.id ?? "");

  const placeId =
    typeof placeParam === "string" && placeParam.length > 0
      ? placeParam
      : null;
  // Present or not: a delete removes the row (`useDeleteSavedPlace`), so
  // there is no mark to read past. The sentence below still has a job — a
  // row deleted on another phone, or a link to one that never existed.
  const row =
    saved.status === "success"
      ? (saved.places.find((place) => place.id === placeId) ?? null)
      : null;

  if (!trip) {
    return <NotFound />;
  }

  const listHref = `/trips/places?id=${trip.id}`;
  // A row that is gone leaves this sheet as the odd one out in the stack:
  // the form that deleted it is popped and the list is behind, so one pop
  // from here lands back on the list's own X, which lands here again.
  // `dismissTo` walks to the list however deep it is, and replaces this
  // sheet with it when it is not in the stack at all (a stale link, the
  // deep-link case).
  const dismissToList = useDismissTo(listHref);

  if (saved.status === "loading") {
    return (
      <FullscreenDialog title="Place" dismissHref={listHref}>
        <LoadingBlock label="Loading the place" />
      </FullscreenDialog>
    );
  }
  if (saved.status === "offline") {
    return (
      <FullscreenDialog title="Place" dismissHref={listHref}>
        <OfflineBlock onRetry={saved.retry} />
      </FullscreenDialog>
    );
  }
  if (saved.status === "error") {
    return (
      <FullscreenDialog title="Place" dismissHref={listHref}>
        <InlineError
          message="Couldn't load the place"
          onRetry={saved.retry}
        />
      </FullscreenDialog>
    );
  }
  if (!row) {
    return (
      <FullscreenDialog
        title="Place"
        primaryTitle="Done"
        onPrimary={() => dismissToList()}
        dismissHref={listHref}
      >
        <Text className="font-body text-base text-ink">
          That place is not here any more.
        </Text>
      </FullscreenDialog>
    );
  }

  // The author, or anybody running the trip: the API's own rule for a
  // write (`canEditSavedPlace`), mirrored rather than invented. Everyone
  // else gets Done — the row is a thing to read, and a form behind every
  // row would read as an offer to change rows that are not yours.
  const canEdit =
    row.createdBy === viewer?.userId || (viewer?.isOrganizer ?? false);

  return (
    <FullscreenDialog
      title={row.name}
      primaryTitle={canEdit ? "Edit place" : "Done"}
      onPrimary={
        canEdit
          ? () =>
              router.push(
                `/trips/places/form?id=${trip.id}&place=${row.id}`,
              )
          : dismiss
      }
      dismissHref={listHref}
    >
      <PlaceDetail
        place={row}
        viewerUserId={user?.id ?? ""}
        isOrganizer={viewer?.isOrganizer ?? false}
        onTogglePin={() =>
          void pin.mutateAsync({
            savedPlaceId: row.id,
            pinned: !row.isPinned,
          })
        }
      />
    </FullscreenDialog>
  );
}
