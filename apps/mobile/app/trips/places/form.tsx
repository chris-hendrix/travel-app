import { useRef, useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { PlaceForm, type SavedPlaceFormInput } from "@/components/trip/PlaceForm";
import { TripGate } from "@/components/trip/TripGate";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { useDismiss, useDismissTo } from "@/hooks/useDismiss";
import { toErrorCopy } from "@/lib/queries/errors";
import {
  isSavedPlaceDuplicate,
  useCreateSavedPlace,
  useDeleteSavedPlace,
  useSavedPlaces,
  useUpdateSavedPlace,
  type CreateSavedPlaceRequest,
  type UpdateSavedPlaceRequest,
} from "@/lib/queries/savedPlaces";
import { useTrip } from "@/lib/tripsStore";
import NotFound from "@/app/+not-found";

/**
 * The saved-place form, in its two modes:
 *
 * - `?id=X` — a new place, saved by any member.
 * - `?id=X&place=Y` — the row being edited, or deleted from.
 *
 * Both are the same fields over the same pick, so both are `PlaceForm`;
 * this file is the trip it belongs to, the mode, and where the answer
 * goes. The mode is read from the params, never from a piece of state,
 * because the route *is* the mode: a deep link, a notification or a
 * reload lands on the same form it was opened as.
 *
 * **The row is read through the section hook**, never through
 * `queryClient.getQueryData`: the cache is where a row that was deleted
 * on another phone still sits, and a form painted out of it would be a
 * form over a row nobody has confirmed is there.
 */
export default function SavedPlaceFormRoute() {
  return (
    <TripGate label="Loading the place form">
      <SavedPlaceFormScreen />
    </TripGate>
  );
}

/**
 * The create body: the pick's words and nothing else when typed — no
 * pair keys at all, which is what makes it typed — and the full pair
 * when picked. Blank prose and a missing address are omitted, and the
 * server defaults the rest.
 */
function toCreateRequest(input: SavedPlaceFormInput): CreateSavedPlaceRequest {
  return {
    name: input.name,
    ...(input.address ? { address: input.address } : null),
    ...(input.description ? { description: input.description } : null),
    placeType: input.placeType,
    ...(input.placeId
      ? { placeProvider: "google" as const, placeId: input.placeId }
      : null),
  };
}

/**
 * The update body: the same pick, restated whole. A re-pick carries its
 * own pair and a retype clears the old one with explicit nulls — absent
 * would leave the stored link untouched, which is how an edit that
 * un-links a place would keep pointing at it. Address and prose travel
 * as strings, never nulls: the update schema takes optional strings,
 * and an emptied field clears to "" (falsy everywhere the row reads,
 * the way a missing column reads) rather than 400ing on a null.
 */
function toUpdateRequest(input: SavedPlaceFormInput): UpdateSavedPlaceRequest {
  return {
    name: input.name,
    address: input.address ?? "",
    description: input.description,
    placeType: input.placeType,
    ...(input.placeId
      ? { placeProvider: "google" as const, placeId: input.placeId }
      : { placeProvider: null, placeId: null }),
  };
}

function SavedPlaceFormScreen() {
  const { id, place: placeParam } = useLocalSearchParams<{
    id?: string;
    place?: string;
  }>();

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  // Read before the guards: hooks called after a return are hooks called
  // a different number of times. The mutations never fire without a
  // trip, so the empty key below is never read — it only keeps the hooks
  // above the early returns.
  const saved = useSavedPlaces(trip?.id);
  const create = useCreateSavedPlace(trip?.id ?? "");
  const update = useUpdateSavedPlace(trip?.id ?? "");
  const remove = useDeleteSavedPlace(trip?.id ?? "");
  const pending = create.isPending || update.isPending || remove.isPending;
  // The last write's failure, fed to the dialog's InlineError — and the
  // duplicate refusal, fed to the Where field it belongs to. The dialog
  // stays open on either: dismissing would pretend it saved.
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  // The double-press guard: the hooks' `pending` flips only after the
  // mutation is underway, so two presses in the same frame would both
  // pass it. The ref flips synchronously, and one write is one write.
  const writing = useRef(false);

  if (!trip) {
    return <NotFound />;
  }

  const listHref = `/trips/places?id=${trip.id}`;
  const dismiss = useDismiss("/trips");
  // Where a save lands. A save lands on the list it was authored from,
  // not on a sheet that no longer exists: a create has no detail sheet
  // to go back to, and a delete just removed the one an edit came
  // through. `dismissTo` walks to the list however deep it is, and
  // replaces with it when it is not in the stack at all.
  const dismissToList = useDismissTo(listHref);

  const placeId =
    typeof placeParam === "string" && placeParam.length > 0
      ? placeParam
      : null;
  const editMode = placeId !== null;
  // A settled read is what makes "not here" a fact rather than a guess:
  // while the list is still loading the row may simply not have arrived.
  // A delete removes the row outright, so presence is the whole test.
  const row =
    editMode && saved.status === "success"
      ? (saved.places.find((place) => place.id === placeId) ?? null)
      : null;

  const spent = (error: unknown, fallback: string) =>
    setServerError(toErrorCopy(error).message ?? fallback);

  function failWrite(error: unknown, fallback: string) {
    // The already-saved refusal is answered in place, at the field that
    // caused it — the Where pick names a place that is already on this
    // trip — and every other failure reads as the request's sentence in
    // the block above the form.
    if (isSavedPlaceDuplicate(error)) {
      setDuplicateError("You've already saved this place to this trip.");
    } else {
      spent(error, fallback);
    }
  }

  function send(run: () => void) {
    // The guard first: a second press while a write is in flight — or in
    // the same frame, before the hooks' pending flips — does nothing,
    // and leaves the errors it is looking at alone.
    if (writing.current || pending) return;
    writing.current = true;
    setServerError(null);
    setDuplicateError(null);
    run();
  }

  const title = editMode ? "Edit place" : "Add place";
  const primaryTitle = editMode
    ? pending
      ? "Saving changes"
      : "Save changes"
    : pending
      ? "Saving place"
      : "Save place";

  // Edit: the list has to have answered before "not here" can be said.
  // Until then the dialog says what it is waiting for, rather than
  // painting a blank form over a row that may be about to arrive.
  if (editMode) {
    if (saved.status === "loading") {
      return (
        <FullscreenDialog title={title} dismissHref={listHref}>
          <LoadingBlock label="Loading the place" />
        </FullscreenDialog>
      );
    }
    if (saved.status === "offline") {
      return (
        <FullscreenDialog title={title} dismissHref={listHref}>
          <OfflineBlock onRetry={saved.retry} />
        </FullscreenDialog>
      );
    }
    if (saved.status === "error") {
      return (
        <FullscreenDialog title={title} dismissHref={listHref}>
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
          title={title}
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
  }

  const initial =
    editMode && row
      ? {
          name: row.name,
          address: row.address,
          placeType: row.type,
          placeId: row.placeId,
          description: row.description ?? "",
        }
      : undefined;

  return (
    <PlaceForm
      title={title}
      primaryTitle={primaryTitle}
      trip={trip}
      dismissHref={editMode && row ? `/trips/places/detail?id=${trip.id}&place=${row.id}` : listHref}
      {...(initial ? { initial } : {})}
      serverError={serverError}
      whereError={duplicateError}
      onPlaceChange={() => setDuplicateError(null)}
      pending={pending}
      onDelete={
        editMode && row
          ? () => {
              // The dialog asked first (its armed danger button): this is
              // the second press, and the row does not come back. A failed
              // delete stays on the form with the failure instead of
              // leaving, so the row is still there to try again.
              send(() => {
                remove.mutate(
                  { savedPlaceId: row.id },
                  {
                    // The row is gone and so is the sheet that read it:
                    // the list is the surface the row left, and it is the
                    // only place behind this form that still exists.
                    onSuccess: () => dismissToList(),
                    onError: (error: unknown) =>
                      failWrite(error, "Couldn't delete the place."),
                    onSettled: () => {
                      writing.current = false;
                    },
                  },
                );
              });
            }
          : undefined
      }
      onSubmit={(input) => {
        send(() => {
          if (editMode && row) {
            update.mutate(
              { savedPlaceId: row.id, input: toUpdateRequest(input) },
              {
                // An edit's sheet is still there, showing the row the
                // invalidation refetch repaints: one pop lands back on
                // it. Only a create or a delete walks to the list — a
                // create has no sheet, and a delete removed the one the
                // form came through.
                onSuccess: () => dismiss(),
                onError: (error: unknown) =>
                  failWrite(error, "Couldn't save the place."),
                onSettled: () => {
                  writing.current = false;
                },
              },
            );
          } else {
            create.mutate(toCreateRequest(input), {
              onSuccess: () => dismissToList(),
              onError: (error: unknown) =>
                failWrite(error, "Couldn't save the place."),
              onSettled: () => {
                writing.current = false;
              },
            });
          }
        });
      }}
    />
  );
}
