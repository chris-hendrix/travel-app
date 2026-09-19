import { useState } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { DayStrip } from "@/components/ui/DayStrip";
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
 * is a real answer rather than an empty picker. The day comes off the
 * trip's own days, so an event can never land outside it.
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
  const [day, setDay] = useState(initial?.day ?? "");
  const [start, setStart] = useState<string | null>(initial?.start ?? null);
  const [end, setEnd] = useState<string | null>(initial?.end ?? null);
  const [submitted, setSubmitted] = useState(false);

  const today = toIso(new Date());

  const input: NewEventInput = {
    name,
    description,
    day,
    start: start ?? "",
    end: end ?? "",
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
        <Text className="font-body-bold text-sm text-ink">Day</Text>
        <DayStrip
          startDate={trip.startDate}
          endDate={trip.endDate}
          value={day}
          onChange={setDay}
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

      {onDelete ? (
        <View className="border-t border-ink pt-6">
          <Button
            title="Delete event"
            variant="danger"
            fullWidth
            onPress={onDelete}
          />
        </View>
      ) : null}
    </FullscreenDialog>
  );
}
