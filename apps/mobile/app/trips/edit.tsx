import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { QuietAction } from "@/components/ui/QuietAction";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { FieldError } from "@/components/ui/FieldError";
import type { Selection } from "@/lib/calendar";
import { formatDateRange } from "@/lib/dateRange";
import { validateNewTrip, type NewTripInput } from "@/lib/newTrip";
import { useTrip, useTripsActions } from "@/lib/tripsStore";
import { coverPreviewSeed } from "@/lib/place-images";
import {
  tripPlaceSnapshotPatch,
  type UpdateTripRequest,
} from "@/lib/queries/trips";
import { toErrorCopy } from "@/lib/queries/errors";
import {
  biasForTrip,
  countryForTrip,
  placePickerRows,
  usePlaceDetails,
  usePlaceSessionToken,
  usePlaceSuggestions,
} from "@/lib/queries/places";
import { pickPlace } from "@/lib/place-pick";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useDismiss } from "@/hooks/useDismiss";

/**
 * Edit trip — the organizer's surface for the trip itself. The create
 * form plus the two things only an existing trip has: a description and
 * a cover photo. Nothing else: style personalization lives nowhere.
 *
 * Fields read exactly like New trip — name, where, dates — so editing
 * never re-teaches. The cover sits at the bottom as a small icon: the
 * thumbnail itself opens the system library, Remove drops back to the
 * default seed.
 */
export default function EditTrip() {
  return (
    <TripGate label="Loading trip details">
      <EditTripScreen />
    </TripGate>
  );
}

function EditTripScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tripId = typeof id === "string" ? id : undefined;
  // The trip read is the detail query; the write goes through
  // `PUT /trips/:id` (failure rolls back in the mutation and reads
  // here, in the screen's existing submit-area style).
  const { trip } = useTrip(tripId);
  const { updateTrip, uploadCover, removeCover } = useTripsActions();
  const dismiss = useDismiss("/trips");

  const [title, setTitle] = useState(trip?.title ?? "");
  const [location, setLocation] = useState<string | null>(
    trip?.location ?? null,
  );
  const [dates, setDates] = useState<Selection>({
    start: trip?.startDate ?? null,
    end: trip?.endDate ?? null,
  });
  const [description, setDescription] = useState(trip?.description ?? "");
  // The preview seeds from the raw upload only, never the resolved
  // image: a trip with a place photo but no upload seeds to no image,
  // keeping the `+` add-a-cover affordance.
  const [cover, setCover] = useState(coverPreviewSeed(trip ?? { coverImageUrl: null }));
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Live Places suggestions plus the typed text as a row: offline, an
  // empty key, or a 503 degrades to the user's own words, and the
  // required-pick still accepts the typed row. The field keeps the
  // display string only. The lookup is biased to the trip's own
  // coordinates when the detail carried them — this picker edits a
  // destination that already exists, unlike `trips/new` which stays
  // unbiased because it is itself choosing the destination.
  const [search, setSearch] = useState("");
  const [sessionToken, rotateSessionToken] = usePlaceSessionToken();
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    null,
  );
  // The destination's picked-place id for the patch, seeded from the
  // trip's existing link so 'untouched' (omit both keys) stays
  // distinguishable from 'typed' (null: clear the link). A live pick
  // sets it; the typed row clears it — opening an edit and saving
  // without touching the field unlinks nothing.
  const [placeId, setPlaceId] = useState<string | null>(
    trip?.placeId ?? null,
  );
  const [placeTouched, setPlaceTouched] = useState(false);
  // The picked place's snapshot strings, seeded from the trip so an
  // untouched field resends nothing (see the patch below). A live
  // pick sets the tapped row's short name at once and clears the
  // address until details land; the typed row clears both, which
  // clears the snapshot on the server with the pair.
  const [placeName, setPlaceName] = useState<string | null>(
    trip?.placeName ?? null,
  );
  const [placeAddress, setPlaceAddress] = useState<string | null>(
    trip?.placeAddress ?? null,
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

  // Details resolve the formatted address — never the label, which
  // is the tapped row's own — and close the input session. A re-pick
  // with no live details submits a null address, which still clears
  // the previous place's address rather than keeping it over.
  useEffect(() => {
    if (!selectedPlaceId) return;
    if (details.data?.placeId === selectedPlaceId) {
      setPlaceAddress(details.data.address);
    }
    if (details.data?.placeId === selectedPlaceId || details.isError) {
      rotateSessionToken();
    }
  }, [details.data, details.isError, selectedPlaceId, rotateSessionToken]);

  const pickCover = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [2, 1],
      quality: 0.8,
    });

    const uri = result.canceled ? null : result.assets[0]?.uri;
    if (uri) setCover(uri);
  }, []);

  if (!trip) {
    return <NotFound />;
  }

  const input: NewTripInput = {
    title,
    location: location ?? "",
    startDate: dates.start ?? "",
    endDate: dates.end ?? dates.start ?? "",
  };

  const errors = submitted ? validateNewTrip(input) : {};

  async function save() {
    setSubmitted(true);
    setFailure(null);
    if (Object.keys(validateNewTrip(input)).length > 0) return;

    // Coordinates ride along only when the details on screen belong to
    // the place in the field: a re-pick made while the previous place's
    // details are still cached sends none, and the server geocodes the
    // text instead of being handed the wrong point.
    const landedCoords =
      selectedPlaceId != null && details.data?.placeId === selectedPlaceId
        ? details.data
        : null;

    // Covers ride the cover endpoints, never this patch. The picker
    // state stays local until save: a picked local URI uploads, an
    // emptied field deletes (when the trip had a real cover), and an
    // unchanged remote URL or placeholder sends nothing. A null
    // cover maps to null — the tile, never a broken box — so
    // "no cover" needs no separate state.
    const patch: UpdateTripRequest = {
      name: input.title.trim(),
      destination: input.location.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      // `description` is optional-but-not-nullable server-side, so an
      // emptied field is omitted (no change) rather than nulled.
      ...(description.trim() ? { description: description.trim() } : null),
      // The destination's link and snapshot: the pair plus the
      // pick-time name/address on a re-pick, explicit nulls for all
      // four when typed over (which clears them), and nothing spread at
      // all when the field was never touched.
      ...(placeTouched
        ? tripPlaceSnapshotPatch({
            placeId,
            placeName,
            placeAddress,
            coords: landedCoords,
          })
        : {}),
    };
    setBusy(true);
    try {
      await updateTrip(trip!.id, patch);
      const hadCover = trip!.coverImageUrl !== null;
      const isLocalUri =
        cover !== "" && /^(file:|blob:|data:|content:)/.test(cover);
      if (cover === "" && hadCover) {
        await removeCover(trip!.id);
      } else if (isLocalUri) {
        await uploadCover(trip!.id, cover);
      }
      dismiss();
    } catch (caught) {
      // The failure reads at the submit area (the lab's Feedback rule:
      // it belongs where its content would have been — the saved
      // trip), mapped through the same copies every other screen uses.
      const copy = toErrorCopy(caught);
      if (copy.offline) {
        setFailure("You're offline. Check your connection and try again.");
      } else {
        setFailure(
          copy.message ??
            (caught instanceof Error ? caught.message : "Couldn't save the trip."),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <FullscreenDialog
      title="Edit trip"
      primaryTitle={busy ? "Saving changes" : "Save changes"}
      onPrimary={() => void save()}
      pending={busy}
      dismissHref={`/trips/detail?id=${trip.id}`}
    >
      <Stack.Screen options={{ presentation: "modal" }} />

      <TextField
        label="Trip name"
        value={title}
        onChangeText={setTitle}
        placeholder="Los Picos Trail"
        error={errors.title}
      />

      <Dropdown
        label="Location"
        options={placeOptions}
        liveOptions
        attribution
        value={location}
        onSearchText={setSearch}
        onChange={(picked) => {
          const hit = liveById.get(picked);
          const pick = pickPlace(hit ?? null, picked);
          if (hit) {
            setSelectedPlaceId(pick.selectedPlaceId);
            setPlaceId(pick.selectedPlaceId);
            setPlaceTouched(true);
            setPlaceName(hit.shortName);
            setPlaceAddress(null);
            setLocation(pick.place);
          } else {
            setSelectedPlaceId(null);
            setPlaceId(null);
            setPlaceTouched(true);
            setPlaceName(null);
            setPlaceAddress(null);
            setLocation(pick.place);
            rotateSessionToken();
          }
        }}
        placeholder="Start typing a place…"
        error={errors.location}
      />

      <View className="gap-2">
        <Text className="font-body-bold text-sm text-ink">Dates</Text>
        <DatePicker selection={dates} onChange={setDates} />
        {dates.start ? (
          <Text className="font-body text-sm text-ink">
            {formatDateRange(input.startDate, input.endDate)}
          </Text>
        ) : null}
        <FieldError message={errors.startDate} />
        <FieldError message={errors.endDate} />
      </View>

      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="What is this trip about?"
        multiline
        numberOfLines={4}
      />

      {failure ? (
        <Text className="font-body text-sm text-ink">{failure}</Text>
      ) : null}

      <View className="gap-2">
        <Text className="font-body-bold text-sm text-ink">Cover photo</Text>
        <View className="gap-3">
          <Pressable
            onPress={pickCover}
            aria-label="Change cover photo"
            className="cursor-pointer"
          >
            {cover ? (
              <Image
                source={{ uri: cover }}
                resizeMode="contain"
                className="w-full h-56 bg-paper"
              />
            ) : (
              <View className="h-20 w-20 items-center justify-center bg-ink">
                <Text className="font-display-extrabold text-display-md text-sand">
                  +
                </Text>
              </View>
            )}
          </Pressable>
          <View className="flex-row items-center gap-5">
            {/* Two `QuietAction`s, which is what they already were by
                hand: a bold underlined word with no box, pressable. The
                underline is the only mark either word carries, so they were
                never candidates for having it taken away — and the phase
                that proposed moving them to "a muted-tier word" would have
                made two pressable words read as labels. */}
            <QuietAction
              label={cover ? "Change cover" : "Upload cover"}
              onPress={pickCover}
            />
            {cover ? (
              <QuietAction
                label="Remove cover"
                onPress={() => setCover("")}
              />
            ) : null}
          </View>
        </View>
      </View>
    </FullscreenDialog>
  );
}
