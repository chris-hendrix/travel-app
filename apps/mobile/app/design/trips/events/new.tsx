import { Suspense, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimeField } from "@/components/ui/TimeField";
import type { Selection } from "@/lib/calendar";
import { dayLabel } from "@/lib/itinerary";
import { toIso } from "@/lib/dateRange";
import { buildEvent, validateNewEvent } from "@/lib/newEvent";
import { useTrips } from "@/lib/tripsStore";
import { useEvents } from "@/lib/eventsStore";
import { useDismiss } from "@/hooks/useDismiss";
import { placePhoto, zoneOffsetFor } from "@/mocks/events";
import { EVENT_PLACES } from "@/mocks/places";

/**
 * Add event — the organizer's way onto the itinerary.
 *
 * A name, the day, and a start: the day comes off a calendar bounded by
 * the trip's own dates, so an event can never land outside it, and both
 * times come off the same inline picker the rest of the system uses.
 *
 * The place is a Places lookup, and it is the only field that also
 * feeds the event's type — a restaurant is a restaurant because Places
 * says so, not because the organizer was asked twice.
 */
export default function NewEvent() {
  return (
    <Suspense fallback={null}>
      <NewEventScreen />
    </Suspense>
  );
}

function NewEventScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trips } = useTrips();
  const { addEvent } = useEvents();
  const dismiss = useDismiss("/design/trips");

  const tripId = typeof id === "string" ? id : undefined;
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];

  const [name, setName] = useState("");
  const [dates, setDates] = useState<Selection>({ start: null, end: null });
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!trip) {
    return (
      <FullscreenDialog title="Add event" dismissHref="/design/trips">
        <Text className="font-body text-base text-ink">
          No trip to add to. Start one from the trips screen.
        </Text>
      </FullscreenDialog>
    );
  }

  const today = toIso(new Date());
  const day = dates.start ?? "";

  const errors = submitted
    ? validateNewEvent({
        name,
        day,
        start: start ?? "",
        end: end ?? "",
        place: place ?? "",
      })
    : {};

  function create() {
    const input = {
      name,
      day,
      start: start ?? "",
      end: end ?? "",
      place: place ?? "",
    };
    setSubmitted(true);
    if (Object.keys(validateNewEvent(input)).length > 0) return;

    addEvent(
      trip!.id,
      buildEvent(
        input,
        `custom-${Date.now()}`,
        zoneOffsetFor(trip!.id),
        placePhoto(input.place.trim() || input.name.trim()),
      ),
    );
    dismiss();
  }

  return (
    <FullscreenDialog
      title="Add event"
      primaryTitle="Add event"
      onPrimary={create}
      dismissHref={`/design/trips/detail?id=${trip.id}`}
    >
      <Stack.Screen options={{ presentation: "modal" }} />
      <Text className="font-body text-sm text-ink">{trip.title}</Text>

      <TextField
        label="Event name"
        value={name}
        onChangeText={setName}
        placeholder="Dinner in town"
        error={errors.name}
      />

      {/* Above the pickers because the form reads better that way: two
          short fields, then the two tall ones. Required all the same — a
          place is what the photo, the type, and the map hang off, and a
          suggestion or a typed answer are both a place. */}
      <Dropdown
        label="Place"
        options={EVENT_PLACES}
        value={place}
        onChange={setPlace}
        placeholder="Search for a place…"
        error={errors.place}
        freeText
      />

      <View className="gap-2">
        <Text className="font-body-bold text-sm text-ink">Day</Text>
        {/* Bounded by the trip: the days it does not run are not days
            this event can be on. */}
        <DatePicker
          selection={dates}
          onChange={setDates}
          single
          min={trip.startDate}
          max={trip.endDate}
        />
        <Text className="font-body text-sm text-ink">
          {day ? dayLabel(day, today) : "Pick the day it happens."}
        </Text>
        {errors.day ? (
          <Text className="font-body text-sm text-ink">{errors.day}</Text>
        ) : null}
      </View>

      <View className="gap-4 md:flex-row">
        <View className="md:flex-1">
          <TimeField
            label="Starts"
            value={start}
            onChange={setStart}
            optional
            noneLabel="All day"
          />
        </View>
        <View className="md:flex-1">
          <TimeField
            label="Ends"
            value={end}
            onChange={setEnd}
            optional
            error={errors.end}
          />
        </View>
      </View>
    </FullscreenDialog>
  );
}
