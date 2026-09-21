import { useState } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import type { Selection } from "@/lib/calendar";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { TimeField } from "@/components/ui/TimeField";
import { dayLabel } from "@/lib/itinerary";
import { toIso } from "@/lib/dateRange";
import { validateNewEvent, type NewEventInput } from "@/lib/newEvent";
import type { Trip } from "@/components/trip/TripCard";
import { EVENT_PLACES } from "@/mocks/places";

/**
 * The event form, in one place because there is one of it: adding and
 * editing ask the same questions, and only the verb changes. Two copies
 * of these fields would be two things to keep in step for no gain.
 *
 * Name, place, and day make the event; the times fill it in, and All day
 * is a real answer rather than an empty picker — a toggle beside the
 * day, which parks the time selectors dimmed rather than hiding them.
 * What was typed stays where it was for the toggle-off that brings it
 * back, and hiding them would say they were gone. The day comes off a
 * calendar bounded by the trip's own dates, so an event can never land
 * outside it.
 *
 * The place is a Places lookup and the only field that also feeds the
 * event's type — a restaurant is a restaurant because Places says so,
 * not because the organizer was asked twice.
 */
export function EventDialog({
  title,
  primaryTitle,
  trip,
  dismissHref,
  initial,
  onSubmit,
  onDelete,
}: {
  title: string;
  /** The dialog's one verb: "Add event" or "Save changes". */
  primaryTitle: string;
  trip: Trip;
  dismissHref: string;
  /** Prefill, for editing. Nothing means a blank form. */
  initial?: Partial<NewEventInput>;
  /** Handed an input that has already passed validation. */
  onSubmit: (input: NewEventInput) => void;
  /**
   * Editing only: a new event has nothing to delete. Sits at the foot of
   * the form, as far from the primary as the dialog allows, and needs no
   * confirmation because deleting is soft — the row is dated, not
   * dropped, and Deleted items is where it comes back from.
   */
  onDelete?: (() => void) | undefined;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [place, setPlace] = useState<string | null>(initial?.place ?? null);
  const [dates, setDates] = useState<Selection>({
    start: initial?.day ?? null,
    end: initial?.day ?? null,
  });
  // All-day is its own answer, so the times below it are the timed
  // case's fields rather than the place an all-day event is expressed by
  // leaving them empty.
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const [start, setStart] = useState<string | null>(initial?.start ?? null);
  const [end, setEnd] = useState<string | null>(initial?.end ?? null);
  const [submitted, setSubmitted] = useState(false);

  const today = toIso(new Date());
  const day = dates.start ?? "";

  const input: NewEventInput = {
    name,
    description,
    day,
    allDay,
    start: allDay ? "" : (start ?? ""),
    end: allDay ? "" : (end ?? ""),
    place: place ?? "",
  };

  const errors = submitted ? validateNewEvent(input) : {};

  function submit() {
    setSubmitted(true);
    if (Object.keys(validateNewEvent(input)).length > 0) return;
    onSubmit(input);
  }

  return (
    <FullscreenDialog
      title={title}
      primaryTitle={primaryTitle}
      onPrimary={submit}
      dangerTitle={onDelete ? "Delete event" : undefined}
      onDanger={onDelete}
      dismissHref={dismissHref}
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

      {/* Second, because it is the other half of what the event is: a
          name and a place. Everything below is detail about that. */}
      <Dropdown
        label="Place"
        options={EVENT_PLACES}
        value={place}
        onChange={setPlace}
        placeholder="Search for a place…"
        error={errors.place}
        freeText
      />

      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Table for eight under the vines."
        multiline
        numberOfLines={3}
      />

      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-4">
          <Text className="font-body-bold text-sm text-ink">Day</Text>
          {/* The no-time case, asked outright. Without it, all-day is
              what an empty Starts field means, and "no time" is then
              indistinguishable from "not filled in yet". */}
          <ChipToggle
            label="All day"
            selected={allDay}
            onPress={() => setAllDay((current) => !current)}
          />
        </View>
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

      {/* The times are always here and never hidden: all-day parks them
          dimmed rather than taking them away, so what was typed is what
          comes back on toggle-off and nothing reads as gone. */}
      <View className="gap-4 md:flex-row">
        <View className="md:flex-1">
          <TimeField
            label="Starts"
            value={start}
            onChange={setStart}
            disabled={allDay}
            error={errors.start}
          />
        </View>
        <View className="md:flex-1">
          <TimeField
            label="Ends"
            value={end}
            onChange={setEnd}
            optional
            disabled={allDay}
            error={errors.end}
          />
        </View>
      </View>
    </FullscreenDialog>
  );
}
