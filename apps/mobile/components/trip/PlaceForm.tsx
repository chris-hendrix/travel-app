import { useEffect, useMemo, useState } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { QuietAction } from "@/components/ui/QuietAction";
import type { Trip } from "@/components/trip/TripCard";
import type { EventType } from "@/lib/itinerary";
import { pickSavedPlace } from "@/lib/place-pick";
import {
  biasForTrip,
  countryForTrip,
  placePickerRows,
  usePlaceDetails,
  usePlaceSessionToken,
  usePlaceSuggestions,
} from "@/lib/queries/places";

/**
 * The saved-place form, in one place because there is one of it: adding
 * and editing ask the same questions, and only the verb changes.
 *
 * Two questions, and they are almost the payload's own: where, and the
 * saver's prose about it. The name is not a third question — it comes
 * off the pick itself (`pickSavedPlace`: a suggestion's main text, the
 * typed words when typed), so the form never asks twice for what one
 * tap already said. The type rides the same pick: Google's types imply
 * it, typed words are unclassified, and every re-pick re-derives it —
 * never a chip the saver sets by hand.
 *
 * The address under the field is the pick's own: the suggestion's
 * reading at once, refined when the details lookup lands. Typed words
 * carry no address, so the line hides the way the detail sheet hides
 * its own address block — a line that holds nothing is not drawn.
 */
// Hoisted, not written inline in the JSX below: `Stack.Screen` re-applies
// its options whenever the object's identity changes (`expo-router`'s
// `Screen` effect depends on `options`), so an inline literal asks the
// navigator to re-apply them on every render of this dialog — and this
// dialog renders on every keystroke.
const MODAL_SCREEN_OPTIONS = { presentation: "modal" } as const;

/** What a save sends: the pick's snapshot plus the saver's prose. */
export type SavedPlaceFormInput = {
  name: string;
  address: string | null;
  placeType: EventType;
  placeId: string | null;
  /** "google" for a suggestion pick, null for typed words. */
  placeProvider: "google" | null;
  description: string;
};

export function PlaceForm({
  title,
  primaryTitle,
  trip,
  dismissHref,
  initial,
  serverError,
  whereError,
  onPlaceChange,
  onSubmit,
  onDelete,
  pending = false,
}: {
  title: string;
  /** The dialog's one verb: "Save place" or "Save changes". */
  primaryTitle: string;
  trip: Trip;
  dismissHref: string;
  /** Prefill, for editing. Nothing means a blank form. */
  initial?: Partial<SavedPlaceFormInput>;
  /** The last save's or delete's failure. The dialog stays open on failure. */
  serverError?: string | null;
  /**
   * The last save's duplicate refusal (409 `SAVED_PLACE_DUPLICATE`):
   * it belongs at the field that caused it, under Where, rather than
   * in the block above the form — a failure belongs at the field that
   * caused it. Owned by the caller, which is what reads the code.
   */
  whereError?: string | null;
  /** The Where answer moved: the caller's duplicate refusal no longer names it. */
  onPlaceChange?: (() => void) | undefined;
  /** Handed an input that has already passed validation. */
  onSubmit: (input: SavedPlaceFormInput) => void;
  /**
   * Editing only, and permanent on the server: the foot row's danger
   * button arms a confirmation rather than firing on the first press,
   * because there is no undo.
   */
  onDelete?: (() => void) | undefined;
  /** A write is in flight: the dialog's own two buttons stop. */
  pending?: boolean;
}) {
  // The delete's first press: the foot button inverts and a way out
  // appears above it. The same two-step the expense form takes, because
  // a permanent write asks the same question wherever it lives.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [submitted, setSubmitted] = useState(false);

  // The Where answer: the pick's own snapshot, seeded from the row on
  // edit so an untouched Where resends itself. A live pick sets all
  // four at once (the type re-derived, never carried over); the typed
  // row clears the link and unclassifies the type, and the typed words
  // ARE the name.
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState<string | null>(
    initial?.address ?? null,
  );
  const [placeId, setPlaceId] = useState<string | null>(
    initial?.placeId ?? null,
  );
  const [placeType, setPlaceType] = useState<EventType>(
    initial?.placeType ?? "misc",
  );

  // Live Places suggestions plus the typed text as a row: a lookup
  // failure degrades to the user's own words, and free text keeps
  // working throughout — the failure never blocks submit. Without a
  // key the proxy 503s, the rows carry only the typed one, and the
  // form is exactly the event form's picker with nothing to pick from.
  const [search, setSearch] = useState("");
  const [sessionToken, rotateSessionToken] = usePlaceSessionToken();
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    null,
  );
  const {
    data: suggestions,
    isFetching: suggestionsFetching,
    isError: suggestionsFailed,
  } = usePlaceSuggestions(
    search,
    sessionToken,
    biasForTrip(trip),
    countryForTrip(trip),
  );
  const details = usePlaceDetails(selectedPlaceId, sessionToken);
  const liveById = useMemo(
    () => new Map((suggestions ?? []).map((s) => [s.placeId, s])),
    [suggestions],
  );
  const placeOptions = useMemo(
    () =>
      placePickerRows({
        suggestions,
        query: search,
        isFetching: suggestionsFetching,
        isError: suggestionsFailed,
      }).rows,
    [suggestions, search, suggestionsFetching, suggestionsFailed],
  );

  // Details refine the address under the field to the canonical one —
  // never the name, which is the tapped row's own. A pick with no live
  // details keeps the suggestion's reading, so the save never waits on
  // the lookup and never submits bare for having picked.
  useEffect(() => {
    if (!selectedPlaceId) return;
    if (details.data?.placeId === selectedPlaceId) {
      setAddress(details.data.address);
    }
    if (details.data?.placeId === selectedPlaceId || details.isError) {
      rotateSessionToken();
    }
  }, [details.data, details.isError, selectedPlaceId, rotateSessionToken]);

  // The danger button's two states, read once instead of as nested
  // ternaries in the props: the first press arms the ask, the second
  // does it.
  const dangerTitle = onDelete
    ? confirmingDelete
      ? "Delete place, for good"
      : "Delete place"
    : undefined;
  const onDanger = onDelete
    ? () => {
        if (confirmingDelete) onDelete();
        else setConfirmingDelete(true);
      }
    : undefined;

  const whereInvalid = name.trim() === "";
  const whereComplaint = whereError ?? (submitted && whereInvalid
    ? "Choose a place."
    : undefined);

  function submit() {
    setSubmitted(true);
    if (name.trim() === "") return;
    onSubmit({
      name: name.trim(),
      address,
      // Re-derived from the pick on every save: the state above is set
      // by the pick handler, never by a separate control.
      placeType,
      placeId,
      // The provider follows the link, the way the stay and event
      // writers supply it: a suggestion carries Google's pair, typed
      // words carry no pair at all.
      placeProvider: placeId ? "google" : null,
      description: description.trim(),
    });
  }

  return (
    <FullscreenDialog
      title={title}
      primaryTitle={primaryTitle}
      onPrimary={submit}
      pending={pending}
      dangerTitle={dangerTitle}
      onDanger={onDanger}
      dismissHref={dismissHref}
    >
      <Stack.Screen options={MODAL_SCREEN_OPTIONS} />
      <Text className="font-body text-sm text-ink">{trip.title}</Text>

      {serverError ? <InlineError message={serverError} /> : null}

      {/* First, because it is what the place is: the pick's words are the
          name, so there is no second field asking for it again. */}
      <View className="gap-1">
        <Dropdown
          label="Where"
          options={placeOptions}
          liveOptions
          attribution
          value={name || null}
          onSearchText={setSearch}
          onChange={(picked) => {
            // Free text: every keystroke arrives here as well as every
            // pick, so a value that is not a live placeId is typed prose
            // (which abandons the session) rather than a selection.
            const hit = liveById.get(picked);
            const pick = pickSavedPlace(hit ?? null, picked);
            if (hit) {
              setSelectedPlaceId(pick.placeId);
              // A live pick commits the suggestion's main text as the
              // name and its reading as the address until details refine
              // it — and the type its Google types imply.
              setName(pick.name);
              setAddress(pick.address);
              setPlaceId(pick.placeId);
              setPlaceType(pick.placeType);
            } else {
              setSelectedPlaceId(null);
              // The typed words are the name, with no link, no address
              // and no class.
              setName(pick.name);
              setAddress(null);
              setPlaceId(null);
              setPlaceType(pick.placeType);
              rotateSessionToken();
            }
            onPlaceChange?.();
          }}
          placeholder="Konoba Mate, Hvar"
          error={whereComplaint ?? undefined}
          freeText
        />
        {address ? (
          <Text className="font-body text-sm text-ink">{address}</Text>
        ) : null}
      </View>

      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Book the terrace at sunset."
        multiline
        numberOfLines={3}
        maxLength={2000}
      />

      {/* The confirmation, in the body rather than in the foot row: the
          button that asks is the button that does it, and this is what it
          says before it does. No undo exists to offer, so the way out has
          to be visible while the finger is still on the button. */}
      {onDelete && confirmingDelete ? (
        <View className="gap-2">
          <Text className="font-body text-base text-ink">
            Deleting a place is permanent.
          </Text>
          <QuietAction
            label="Keep it"
            ariaLabel="Keep this place"
            onPress={() => setConfirmingDelete(false)}
          />
        </View>
      ) : null}
    </FullscreenDialog>
  );
}
