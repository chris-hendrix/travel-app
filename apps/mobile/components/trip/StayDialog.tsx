import { useEffect, useMemo, useState } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
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
import {
  toPlaceOption,
  usePlaceDetails,
  usePlaceSessionToken,
  usePlaceSuggestions,
} from "@/lib/queries/places";

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

  // Live Places suggestions for the address. There is no static list
  // for street addresses, so the fallback here is free text alone:
  // a lookup failure leaves an empty suggestion list, typing keeps
  // working, and the failure never blocks submit. The stay keeps the
  // display string only — `addressLat`/`addressLon` stay null (the
  // `newStay.ts` mapping), so this wires no coordinates.
  const [search, setSearch] = useState("");
  const [sessionToken, rotateSessionToken] = usePlaceSessionToken();
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    null,
  );
  const { data: suggestions } = usePlaceSuggestions(search, sessionToken);
  const details = usePlaceDetails(selectedPlaceId, sessionToken);
  const liveById = useMemo(
    () => new Map((suggestions ?? []).map((s) => [s.placeId, s])),
    [suggestions],
  );
  const addressOptions = useMemo(
    () => (suggestions ?? []).map(toPlaceOption),
    [suggestions],
  );

  // Details only canonicalize the committed label (and close the
  // input session) — they never block submit.
  useEffect(() => {
    if (!selectedPlaceId) return;
    if (details.data?.placeId === selectedPlaceId) {
      setAddress(details.data.name);
    }
    if (details.data?.placeId === selectedPlaceId || details.isError) {
      rotateSessionToken();
    }
  }, [details.data, details.isError, selectedPlaceId, rotateSessionToken]);

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
      <Dropdown
        label="Address"
        options={addressOptions}
        value={address || null}
        onSearchText={setSearch}
        onChange={(picked) => {
          // Free text: every keystroke arrives here as well as every
          // pick, so a value that is not a live placeId is typed prose
          // (which abandons the session) rather than a selection.
          const hit = liveById.get(picked);
          if (hit) {
            setSelectedPlaceId(hit.placeId);
            setAddress(hit.name);
          } else {
            setSelectedPlaceId(null);
            setAddress(picked);
            rotateSessionToken();
          }
        }}
        placeholder="Carrer de la Mar 14, 07100 Sóller"
        error={errors.address}
        freeText
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
