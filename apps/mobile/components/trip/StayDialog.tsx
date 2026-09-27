import { useEffect, useMemo, useState } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { PickedPlace } from "@/components/trip/PickedPlace";
import { FieldError } from "@/components/ui/FieldError";
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
  biasForTrip,
  countryForTrip,
  placePickerRows,
  usePlaceDetails,
  usePlaceSessionToken,
  usePlaceSuggestions,
} from "@/lib/queries/places";
import { pickPlace, pickStayAddress } from "@/lib/place-pick";

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
  initialCoords = null,
  serverError,
  onSubmit,
  onDelete,
  pending = false,
}: {
  title: string;
  primaryTitle: string;
  trip: Trip;
  dismissHref: string;
  /** Prefill, for editing. Nothing means a blank form. */
  initial?: Partial<NewStayInput>;
  /**
   * The stay's coordinates when the row has them, for editing: seeded
   * into the picker's state so an untouched address keeps them. The
   * form never asks for coordinates outright — a fresh pick resolves
   * them, typed prose carries none.
   */
  initialCoords?: { lat: number; lon: number } | null;
  /** The last save's or delete's failure. The dialog stays open on failure. */
  serverError?: string | null;
  /**
   * Handed an input that has already passed validation, plus the live
   * lookup's coordinates when the address was picked from a suggestion
   * — null when it was typed, which carries no coordinates.
   */
  onSubmit: (input: NewStayInput, coords: { lat: number; lon: number } | null) => void;
  /** Editing only. Soft, so it needs no confirmation step. */
  onDelete?: (() => void) | undefined;
  /** A write is in flight: the dialog's own two buttons stop. */
  pending?: boolean;
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

  // Live Places suggestions for the address, plus the typed text as a
  // row: a lookup failure degrades to the user's own words, typing
  // keeps working, and the failure never blocks submit. A picked
  // suggestion's details resolve the stay's coordinates, which ride out
  // on the submit beside the input; typed prose carries none, so it
  // submits bare.
  const [search, setSearch] = useState("");
  const [sessionToken, rotateSessionToken] = usePlaceSessionToken();
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    null,
  );
  // The picked place's id for the submitted input, seeded from the
  // draft on edit so an untouched address keeps its link. A live pick
  // sets it; the typed row clears it, because typed text has no place.
  const [placeId, setPlaceId] = useState<string | null>(
    initial?.placeId ?? null,
  );
  // The picked place's snapshot strings for the submitted input: the
  // tapped row's name and the details response's formatted address.
  // Seeded from the draft on edit so an untouched address resends its
  // own snapshot; a live pick sets the name at once and the address
  // when details land; the typed row clears both, which clears the
  // snapshot on the server with the pair. Never the stay's name —
  // that field is the user's own words, and a pick leaves it alone.
  const [placeName, setPlaceName] = useState<string | null>(
    initial?.placeName ?? null,
  );
  const [placeAddress, setPlaceAddress] = useState<string | null>(
    initial?.placeAddress ?? null,
  );
  // The live lookup's coordinates for the picked address, when there
  // is one. Seeded from the row on edit so an untouched address keeps
  // its coordinates; cleared the moment the address is re-picked or
  // typed, so no coordinate outlives the address it belonged to.
  const [coords, setCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(() =>
    initialCoords &&
    Number.isFinite(initialCoords.lat) &&
    Number.isFinite(initialCoords.lon)
      ? { lat: initialCoords.lat, lon: initialCoords.lon }
      : null,
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
  const addressOptions = useMemo(
    () =>
      placePickerRows({
        suggestions,
        query: search,
        isFetching: suggestionsFetching,
        isError: suggestionsFailed,
      }).rows,
    [suggestions, search, suggestionsFetching, suggestionsFailed],
  );

  // Details resolve the stay's coordinates, its formatted address, and
  // its snapshot address — never the name, which is the user's own
  // words — and close the input session. They never block submit. An
  // address with no live details submits bare.
  useEffect(() => {
    if (!selectedPlaceId) return;
    const landed = details.data;
    if (landed?.placeId === selectedPlaceId) {
      const formattedAddress = landed.address;
      setAddress((current) =>
        pickStayAddress({ address: current }, formattedAddress),
      );
      setPlaceAddress(formattedAddress);
      setCoords(
        Number.isFinite(landed.lat) && Number.isFinite(landed.lon)
          ? { lat: landed.lat, lon: landed.lon }
          : null,
      );
    }
    if (details.data?.placeId === selectedPlaceId || details.isError) {
      rotateSessionToken();
    }
  }, [details.data, details.isError, selectedPlaceId, rotateSessionToken]);

  const input: NewStayInput = {
    name,
    address,
    // The picked suggestion's id, or null for typed prose — which is
    // what clears a previous link on edit rather than keeping it over.
    placeId,
    // The picked place's snapshot: the tapped row's name and the
    // details response's formatted address (null until details land,
    // or when the address was typed, which clears the snapshot).
    placeName,
    placeAddress,
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
    onSubmit(input, coords);
  }

  return (
    <FullscreenDialog
      title={title}
      primaryTitle={primaryTitle}
      onPrimary={submit}
      pending={pending}
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

      <Dropdown
        label="Location"
        options={addressOptions}
        liveOptions
        attribution
        value={address || null}
        onSearchText={setSearch}
        onChange={(picked) => {
          // Free text: every keystroke arrives here as well as every
          // pick, so a value that is not a live placeId is typed prose
          // (which abandons the session) rather than a selection.
          const hit = liveById.get(picked);
          const pick = pickPlace(hit ?? null, picked);
          if (hit) {
            setSelectedPlaceId(pick.selectedPlaceId);
            setPlaceId(pick.selectedPlaceId);
            // A live pick sets the address — the suggestion's own
            // while the formatted address arrives with the details
            // lookup — and the snapshot's name and address. The name
            // field keeps the user's own words: a pick never writes it.
            setAddress(pickStayAddress(hit, null));
            setPlaceName(hit.shortName);
            setPlaceAddress(null);
            // The coordinates arrive with the details lookup; until
            // then the pick carries none, not the previous address's.
            setCoords(null);
          } else {
            setSelectedPlaceId(null);
            setPlaceId(null);
            setPlaceName(null);
            setPlaceAddress(null);
            setAddress(pick.place);
            setCoords(null);
            rotateSessionToken();
          }
        }}
        placeholder="Carrer de la Mar 14, 07100 Sóller"
        error={errors.address}
        freeText
      />

      {/* Both halves of the pick: the Address field carries only the
          formatted address, so the place's own name would otherwise be
          invisible here. */}
      {placeId ? (
        <PickedPlace name={placeName} address={placeAddress} />
      ) : null}

      <View className="gap-2">
        <Text className="font-body-bold text-sm text-ink">Nights</Text>
        <DatePicker
          selection={dates}
          onChange={setDates}
          min={trip.startDate}
          max={addDays(trip.endDate, 1)}
        />
        {dates.start && dates.end ? (
          <Text className="font-body text-sm text-ink">
            {formatDaySpan(dates.start, dates.end)}
          </Text>
        ) : null}
        <FieldError message={errors.checkInDay} />
        <FieldError message={errors.checkOutDay} />
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
