import { useCallback, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import type { Selection } from "@/lib/calendar";
import { formatDateRange } from "@/lib/dateRange";
import { validateNewTrip, type NewTripInput } from "@/lib/newTrip";
import { useTrip, useTripsActions } from "@/lib/tripsStore";
import { placeholderPhoto } from "@/lib/mapping";
import type { UpdateTripRequest } from "@/lib/queries/trips";
import { toErrorCopy } from "@/lib/queries/errors";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useDismiss } from "@/hooks/useDismiss";
import { PLACES } from "@/mocks/places";

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
    <TripGate label="Edit trip">
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
  const [cover, setCover] = useState(trip?.image ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

    // Covers ride the cover endpoints, never this patch. The picker
    // state stays local until save: a picked local URI uploads, an
    // emptied field deletes (when the trip had a real cover), and an
    // unchanged remote URL or placeholder sends nothing. A null
    // cover maps to `placeholderPhoto` — never a broken box — so
    // "no cover" needs no separate state.
    const patch: UpdateTripRequest = {
      name: input.title.trim(),
      destination: input.location.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      // `description` is optional-but-not-nullable server-side, so an
      // emptied field is omitted (no change) rather than nulled.
      ...(description.trim() ? { description: description.trim() } : null),
    };
    setBusy(true);
    try {
      await updateTrip(trip!.id, patch);
      const hadCover = trip!.image !== placeholderPhoto(trip!.id);
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
      primaryDisabled={busy}
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
        label="Where"
        options={PLACES}
        value={location}
        onChange={setLocation}
        placeholder="Start typing a place…"
        error={errors.location}
      />

      <View className="gap-2">
        <Text className="font-body-bold text-sm text-ink">Dates</Text>
        <DatePicker selection={dates} onChange={setDates} />
        <Text className="font-body text-sm text-ink">
          {dates.start
            ? formatDateRange(input.startDate, input.endDate)
            : "Tap the first day, then the last. One tap is a day trip."}
        </Text>
        {errors.startDate ? (
          <Text className="font-body text-sm text-ink">
            {errors.startDate}
          </Text>
        ) : null}
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
                <Text className="font-display text-4xl leading-none text-sand">
                  +
                </Text>
              </View>
            )}
          </Pressable>
          <View className="flex-row items-center gap-5">
            <Pressable onPress={pickCover} className="self-start">
              <Text className="font-body-bold text-sm text-ink underline">
                {cover ? "Change cover" : "Upload cover"}
              </Text>
            </Pressable>
            {cover ? (
              <Pressable
                onPress={() => setCover("")}
                className="self-start"
              >
                <Text className="font-body-bold text-sm text-ink underline">
                  Remove cover
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </FullscreenDialog>
  );
}
