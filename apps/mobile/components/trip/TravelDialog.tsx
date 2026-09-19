import { useState } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { Segmented } from "@/components/ui/Segmented";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimeField } from "@/components/ui/TimeField";
import type { Selection } from "@/lib/calendar";
import { dayLabel } from "@/lib/itinerary";
import { toIso } from "@/lib/dateRange";
import { validateNewTravel, type NewTravelInput } from "@/lib/newTravel";
import type { Trip } from "@/components/trip/TripCard";
import type { Member } from "@/lib/members";

const DIRECTIONS: Array<{ value: "arrival" | "departure"; label: string }> = [
  { value: "arrival", label: "Arriving" },
  { value: "departure", label: "Departing" },
];

/**
 * The travel form, in one place because there is one of it: adding and
 * editing ask the same questions, and only the verb changes. Two copies
 * of these fields would be two things to keep in step for no gain.
 *
 * Who, which way, which day, what time, and where make the travel; the
 * flight number and the details fill it in. The day comes off a calendar
 * bounded by the trip's own dates, so travel can never land outside it.
 */
export function TravelDialog({
  title,
  primaryTitle,
  trip,
  members,
  dismissHref,
  initial,
  onSubmit,
  onDelete,
}: {
  title: string;
  /** The dialog's one verb: "Add travel" or "Save changes". */
  primaryTitle: string;
  trip: Trip;
  /** Who the travel can belong to — the trip's going members. */
  members: Member[];
  dismissHref: string;
  /** Prefill, for editing. Nothing means a blank form. */
  initial?: Partial<NewTravelInput> | undefined;
  /** Handed an input that has already passed validation. */
  onSubmit: (input: NewTravelInput) => void;
  /**
   * Editing only: new travel has nothing to delete. Sits at the foot of
   * the form, as far from the primary as the dialog allows, and needs no
   * confirmation because deleting is soft — the row is dated, not
   * dropped, and Deleted items is where it comes back from.
   */
  onDelete?: (() => void) | undefined;
}) {
  const [direction, setDirection] = useState<"arrival" | "departure">(
    initial?.direction ?? "arrival",
  );
  const [memberId, setMemberId] = useState(initial?.memberId ?? "");
  const [dates, setDates] = useState<Selection>({
    start: initial?.day ?? null,
    end: initial?.day ?? null,
  });
  const [time, setTime] = useState<string | null>(initial?.time ?? null);
  const [location, setLocation] = useState(initial?.location ?? "");
  const [flightNumber, setFlightNumber] = useState(
    initial?.flightNumber ?? "",
  );
  const [details, setDetails] = useState(initial?.details ?? "");
  const [submitted, setSubmitted] = useState(false);

  const today = toIso(new Date());
  const day = dates.start ?? "";

  const input: NewTravelInput = {
    direction,
    memberId,
    day,
    time: time ?? "",
    location,
    flightNumber,
    details,
  };

  const errors = submitted ? validateNewTravel(input) : {};

  function submit() {
    setSubmitted(true);
    if (Object.keys(validateNewTravel(input)).length > 0) return;
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

      <Dropdown
        label="Who"
        options={members.map((member) => ({
          value: member.id,
          label: member.name,
        }))}
        value={memberId || null}
        onChange={setMemberId}
        placeholder="Pick who this is for…"
        error={errors.memberId}
      />

      <Segmented
        options={DIRECTIONS}
        value={direction}
        onChange={setDirection}
      />

      <View className="gap-2">
        <Text className="font-body-bold text-sm text-ink">Day</Text>
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

      <TimeField label="Time" value={time} onChange={setTime} error={errors.time} />

      <TextField
        label="Where"
        value={location}
        onChangeText={setLocation}
        placeholder="BCN T2"
        error={errors.location}
      />

      <TextField
        label="Flight number"
        value={flightNumber}
        onChangeText={setFlightNumber}
        placeholder="UA 1842"
      />

      <TextField
        label="Details"
        value={details}
        onChangeText={setDetails}
        placeholder="Landing T2, bags take twenty minutes."
        multiline
        numberOfLines={3}
      />

      {onDelete ? (
        <View className="border-t border-ink pt-6">
          <Button
            title="Delete travel"
            variant="danger"
            fullWidth
            onPress={onDelete}
          />
        </View>
      ) : null}
    </FullscreenDialog>
  );
}
