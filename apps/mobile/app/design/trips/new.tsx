import { useState } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import type { Selection } from "@/lib/calendar";
import { formatDateRange } from "@/lib/dateRange";
import {
  buildTrip,
  validateNewTrip,
  type NewTripInput,
} from "@/lib/newTrip";
import { useTrips } from "@/lib/tripsStore";
import { useDismiss } from "@/hooks/useDismiss";
import { PLACES } from "@/mocks/places";

export default function NewTrip() {
  const { addTrip, trips } = useTrips();
  const dismiss = useDismiss("/design/trips");

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState<string | null>(null);
  const [dates, setDates] = useState<Selection>({ start: null, end: null });
  const [submitted, setSubmitted] = useState(false);

  // One tap is a day trip, so a start with no end closes on itself.
  const input: NewTripInput = {
    title,
    location: location ?? "",
    startDate: dates.start ?? "",
    endDate: dates.end ?? dates.start ?? "",
  };

  const errors = submitted ? validateNewTrip(input) : {};

  function create() {
    setSubmitted(true);
    if (Object.keys(validateNewTrip(input)).length > 0) return;

    addTrip(buildTrip(input, `trip-${trips.length + 1}-${Date.now()}`));
    dismiss();
  }

  return (
    <FullscreenDialog
      title="New trip"
      primaryTitle="Create trip"
      onPrimary={create}
      dismissHref="/design/trips"
    >
      {/* Modals are routes, presented modally: iOS slides it up and
          allows a swipe-down dismiss, Android maps its hardware back
          to the same dismissal. */}
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

      <View className="gap-1">
        <Text className="font-body-bold text-sm text-ink">
          What happens next
        </Text>
        <Text className="font-body text-sm text-ink">
          The trip appears in Upcoming straight away, empty but yours.
          Accommodation, travel, and events come after.
        </Text>
      </View>
    </FullscreenDialog>
  );
}
