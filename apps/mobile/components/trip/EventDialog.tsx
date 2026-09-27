import { useEffect, useMemo, useState } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { PickedPlace } from "@/components/trip/PickedPlace";
import type { Selection } from "@/lib/calendar";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { FieldError } from "@/components/ui/FieldError";
import { TimeField } from "@/components/ui/TimeField";
import { dayLabel } from "@/lib/itinerary";
import { toIso } from "@/lib/dateRange";
import { validateNewEvent, type NewEventInput } from "@/lib/newEvent";
import type { EventType } from "@/lib/itinerary";
import { pickPlace } from "@/lib/place-pick";
import type { Trip } from "@/components/trip/TripCard";
import {
  biasForTrip,
  countryForTrip,
  placePickerRows,
  usePlaceDetails,
  usePlaceSessionToken,
  usePlaceSuggestions,
} from "@/lib/queries/places";

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
  serverError,
  onDelete,
  pending = false,
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
   * The last server write's failure, when there is one. The section
   * already renders error states (Task 1); this feeds them without a
   * redesign — a statement, not a way back (retry is the primary).
   */
  serverError?: string | null;
  /**
   * Editing only: a new event has nothing to delete. Sits at the foot of
   * the form, as far from the primary as the dialog allows, and needs no
   * confirmation because deleting is soft — the row is dated, not
   * dropped, and Deleted items is where it comes back from.
   */
  onDelete?: (() => void) | undefined;
  /** A write is in flight: the dialog's own two buttons stop. */
  pending?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [place, setPlace] = useState<string | null>(initial?.place ?? null);
  // The picked place's derived event type: a restaurant is food_and_drink
  // because Places says so, not because the organizer was asked twice.
  // Typed prose carries no types, so it stays whatever it was.
  const [eventType, setEventType] = useState<EventType>(
    initial?.type ?? "misc",
  );
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

  // Live Places suggestions plus the typed text as a row: a lookup
  // failure degrades to the user's own words, and free text keeps
  // working throughout — the failure never blocks submit. A picked
  // suggestion's details resolve the event's coordinates, which ride on
  // the submitted input; typed prose carries none, so it submits bare.
  const [search, setSearch] = useState("");
  const [sessionToken, rotateSessionToken] = usePlaceSessionToken();
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    null,
  );
  // The picked place's id for the submitted input, seeded from the
  // draft on edit so an untouched place keeps its link. A live pick
  // sets it; the typed row clears it, because typed text has no place.
  const [placeId, setPlaceId] = useState<string | null>(
    initial?.placeId ?? null,
  );
  // The picked place's snapshot strings for the submitted input: the
  // tapped row's name and the details response's formatted address.
  // Seeded from the draft on edit so an untouched place resends its
  // own snapshot; a live pick sets the name at once and the address
  // when details land; the typed row clears both, which clears the
  // snapshot on the server with the pair.
  const [placeName, setPlaceName] = useState<string | null>(
    initial?.placeName ?? null,
  );
  const [placeAddress, setPlaceAddress] = useState<string | null>(
    initial?.placeAddress ?? null,
  );
  // The live lookup's coordinates for the picked place, when there is
  // one. Seeded from the draft on edit so an untouched place keeps its
  // coordinates; cleared the moment the place is re-picked or typed,
  // so no coordinate outlives the place it belonged to.
  const [coords, setCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(() =>
    typeof initial?.locationLat === "number" &&
    typeof initial?.locationLon === "number"
      ? { lat: initial.locationLat, lon: initial.locationLon }
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
  const placeOptions = useMemo(
    () =>
      placePickerRows({
        suggestions,
        query: search,
        isFetching: suggestionsFetching,
        isError: suggestionsFailed,
      }).rows,
    [suggestions, search, suggestionsFetching, suggestionsFailed],
  );

  // Details resolve the event's coordinates and its formatted address
  // — never the label, which is the tapped row's own (and closes the
  // input session). A place with no live details submits bare.
  useEffect(() => {
    if (!selectedPlaceId) return;
    if (details.data?.placeId === selectedPlaceId) {
      setCoords(
        Number.isFinite(details.data.lat) &&
          Number.isFinite(details.data.lon)
          ? { lat: details.data.lat, lon: details.data.lon }
          : null,
      );
      setPlaceAddress(details.data.address);
    }
    if (details.data?.placeId === selectedPlaceId || details.isError) {
      rotateSessionToken();
    }
  }, [details.data, details.isError, selectedPlaceId, rotateSessionToken]);

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
    type: eventType,
    // The picked place's snapshot: the tapped row's name and the
    // details response's formatted address (null until details land,
    // or when the place was typed, which clears the snapshot).
    placeName,
    placeAddress,
    // The picked suggestion's id, or null for typed prose — which is
    // what clears a previous link on edit rather than keeping it over.
    placeId,
    // Present only when a live lookup resolved them: typed prose and
    // static picks submit bare, and nothing defaults to 0.
    ...(coords
      ? { locationLat: coords.lat, locationLon: coords.lon }
      : null),
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
      pending={pending}
      dangerTitle={onDelete ? "Delete event" : undefined}
      onDanger={onDelete}
      dismissHref={dismissHref}
    >
      <Stack.Screen options={{ presentation: "modal" }} />
      <Text className="font-body text-sm text-ink">{trip.title}</Text>

      {serverError ? <InlineError message={serverError} /> : null}

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
        options={placeOptions}
        liveOptions
        attribution
        value={place}
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
            setPlace(pick.place);
            // A live pick commits the tapped row's name at once; the
            // formatted address arrives with the details lookup, and
            // the pick carries none of the previous place's until then.
            setPlaceName(hit.shortName);
            setPlaceAddress(null);
            setEventType(pick.type);
            // The coordinates arrive with the details lookup; until
            // then the pick carries none, not the previous place's.
            setCoords(null);
          } else {
            setSelectedPlaceId(null);
            setPlaceId(null);
            setPlaceName(null);
            setPlaceAddress(null);
            setPlace(pick.place);
            // Typed prose carries no types: the derived type goes
            // back to unclassified with the cleared place id.
            setEventType(pick.type);
            setCoords(null);
            rotateSessionToken();
          }
        }}
        placeholder="Search for a place…"
        error={errors.place}
        freeText
      />

      {/* Both halves of the pick: the Place field carries only the
          name, so the formatted address would otherwise be invisible
          here. */}
      {placeId ? (
        <PickedPlace name={placeName} address={placeAddress} />
      ) : null}

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
        {day ? (
          <Text className="font-body text-sm text-ink">
            {dayLabel(day, today)}
          </Text>
        ) : null}
        <FieldError message={errors.day} />
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
