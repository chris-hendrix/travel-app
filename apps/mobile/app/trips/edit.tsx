import { Suspense, useCallback, useState } from "react";
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
import { useTrips } from "@/lib/tripsStore";
import { tripFor } from "@/lib/tripLookup";
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
    <Suspense fallback={null}>
      <EditTripScreen />
    </Suspense>
  );
}

function EditTripScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trips, updateTrip } = useTrips();
  const dismiss = useDismiss("/trips");

  const tripId = typeof id === "string" ? id : undefined;
  const trip = tripFor(trips, tripId);

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

  const defaultCover = `https://picsum.photos/seed/${encodeURIComponent(trip.id)}/900/600`;

  const input: NewTripInput = {
    title,
    location: location ?? "",
    startDate: dates.start ?? "",
    endDate: dates.end ?? dates.start ?? "",
  };

  const errors = submitted ? validateNewTrip(input) : {};

  function save() {
    setSubmitted(true);
    if (Object.keys(validateNewTrip(input)).length > 0) return;

    updateTrip(trip!.id, {
      title: input.title.trim(),
      location: input.location.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      description: description.trim() ? description.trim() : null,
      image: cover || defaultCover,
    });
    dismiss();
  }

  return (
    <FullscreenDialog
      title="Edit trip"
      primaryTitle="Save changes"
      onPrimary={save}
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
