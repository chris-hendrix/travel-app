import { useState } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { TextField } from "@/components/ui/TextField";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimeField } from "@/components/ui/TimeField";
import type { Selection } from "@/lib/calendar";
import { addDays, formatDaySpan } from "@/lib/dateRange";
import {
  validateNewStay,
  type NewStayErrors,
  type NewStayInput,
} from "@/lib/newStay";
import type { Trip } from "@/components/trip/TripCard";

/**
 * The stay form, in one place because there is one of it: adding and
 * editing ask the same questions, and only the verb changes.
 *
 * Five questions, and they are the payload's own: a name, an address,
 * the two days, and the description. Three of them are required, which
 * is why the form is short — the rest of what a stay is (an address the
 * driver can be told, a code, a wifi name) has no field to live in and
 * goes in the description, which is therefore the largest thing here and
 * the one worth writing well.
 *
 * The dates are one range rather than two pickers, because a stay is one
 * span — arrive, leave — and the same two taps that make a trip make
 * this. The picker runs a day past the trip's end: a stay is booked
 * through its last night, so check-out is the morning after.
 */
export function StayDialog({
  title,
  /** The dialog's one verb: "Add stay" or "Save changes". */
  primaryTitle,
  trip,
  dismissHref,
  initial,
  serverError,
  onSubmit,
  onDelete,
}: {
  title: string;
  primaryTitle: string;
  trip: Trip;
  dismissHref: string;
  /** Prefill, for editing. Nothing means a blank form. */
  initial?: Partial<NewStayInput>;
  /** The last save's or delete's failure. The dialog stays open on failure. */
  serverError?: string | null;
  /** Handed an input that has already passed validation. */
  onSubmit: (input: NewStayInput) => void;
  /** Editing only. Soft, so it needs no confirmation step. */
  onDelete?: (() => void) | undefined;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [dates, setDates] = useState<Selection>({
    start: initial?.checkInDay ?? null,
    end: initial?.checkOutDay ?? null,
  });
  const [checkInTime, setCheckInTime] = useState(initial?.checkInTime ?? "");
  const [checkOutTime, setCheckOutTime] = useState(
    initial?.checkOutTime ?? "",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [submitted, setSubmitted] = useState(false);

  const input: NewStayInput = {
    name,
    address,
    checkInDay: dates.start ?? "",
    checkOutDay: dates.end ?? dates.start ?? "",
    checkInTime,
    checkOutTime,
    description,
  };

  const errors: NewStayErrors = submitted
    ? validateNewStay(input)
    : ({} as NewStayErrors);

  function submit() {
    setSubmitted(true);
    if (Object.keys(validateNewStay(input)).length > 0) return;
    onSubmit(input);
  }

  return (
    <FullscreenDialog
      title={title}
      primaryTitle={primaryTitle}
      onPrimary={submit}
      dangerTitle={onDelete ? "Delete stay" : undefined}
      onDanger={onDelete}
      dismissHref={dismissHref}
    >
      <Stack.Screen options={{ presentation: "modal" }} />
      {serverError ? <InlineError message={serverError} /> : null}
      <Text className="font-body text-sm text-ink">{trip.title}</Text>

      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Ca'n Puig"
        error={errors.name}
      />

      {/* TODO(BE): `GET /api/locations/autocomplete` and `/details` do not request `photos[].name` (field masks at `location.routes.ts:88-130`, `:178`), so a picked place has no image reference even though `/locations/photos/:photoRef` exists. */}
      <TextField
        label="Address"
        value={address}
        onChangeText={setAddress}
        placeholder="Carrer de la Mar 14, 07100 Sóller"
        error={errors.address}
      />

      <View className="gap-2">
        <Text className="font-body-bold text-sm text-ink">Nights</Text>
        <DatePicker
          selection={dates}
          onChange={setDates}
          min={trip.startDate}
          max={addDays(trip.endDate, 1)}
        />
        <Text className="font-body text-sm text-ink">
          {dates.start
            ? dates.end
              ? formatDaySpan(dates.start, dates.end)
              : "Now pick the day you leave."
            : "Pick the day you arrive, then the day you leave."}
        </Text>
        {errors.checkInDay ? (
          <Text className="font-body text-sm text-ink">
            {errors.checkInDay}
          </Text>
        ) : null}
        {errors.checkOutDay ? (
          <Text className="font-body text-sm text-ink">
            {errors.checkOutDay}
          </Text>
        ) : null}
      </View>

      {/* Both times are optional and both are often unknown: a host says
          "from three" in a message and an app booking never says it at
          all. An empty field here means nobody said, which is a fact
          about the place rather than a gap in this form. */}
      <View className="gap-4 md:flex-row">
        <View className="md:flex-1">
          <TimeField
            label="Check-in time"
            value={checkInTime || null}
            onChange={(value) => setCheckInTime(value ?? "")}
            optional
            noneLabel="No check-in time"
            error={errors.checkInTime}
          />
        </View>
        <View className="md:flex-1">
          <TimeField
            label="Check-out time"
            value={checkOutTime || null}
            onChange={(value) => setCheckOutTime(value ?? "")}
            optional
            noneLabel="No check-out time"
            error={errors.checkOutTime}
          />
        </View>
      </View>

      {/* The largest field in the form because it carries the most: this
          is where the way in goes, and there is nowhere else for it. The
          placeholder says so rather than the label, which is the
          payload's own word for the column. */}
      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder={
          "Door code 4417, lockbox left of the blue gate.\nWifi PuigSoller / tramuntana2019. Marta: +34 600 123 456."
        }
        multiline
        numberOfLines={6}
      />
    </FullscreenDialog>
  );
}
