import { useState } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { Segmented } from "@/components/ui/Segmented";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimeField } from "@/components/ui/TimeField";
import { dayLabel } from "@/lib/itinerary";
import { toIso } from "@/lib/dateRange";
import { isFlightNumber, lookupFlight } from "@/lib/flights";
import {
  emptyLeg,
  legFromLookup,
  legIsFiled,
  validateNewTravel,
  type NewTravelInput,
  type TravelDirection,
  type TravelLeg,
} from "@/lib/newTravel";
import type { Trip } from "@/components/trip/TripCard";
import type { Member } from "@/lib/members";

const DIRECTIONS: Array<{ value: TravelDirection; label: string }> = [
  { value: "arrival", label: "Arriving" },
  { value: "departure", label: "Departing" },
];

/**
 * The travel form, in one place because there is one of it: one member,
 * both directions behind a tab each, and only the verb changes between
 * adding and editing.
 *
 * One dialog for everyone. The organizer gets the Who picker at the top;
 * a traveler is that member already, so the picker is simply absent —
 * the same form with one field fewer, not a second form.
 *
 * The tabs are the API's two directions, named the way the board's own
 * sections are named, so the word you press and the heading you land on
 * are the same word. Each tab asks the same four things: where, the
 * flight number for those who flew, the day, and the time.
 *
 * The calendar is bounded by the trip, which cannot express the morning
 * after the last day — the red-eye home. Next day is that morning, and
 * nothing else.
 */
export function TravelDialog({
  title,
  primaryTitle,
  trip,
  members,
  viewerIsOrganizer,
  lockedMember,
  whereSuggestions,
  initial,
  filed,
  dismissHref,
  onSubmit,
  onDelete,
}: {
  title: string;
  /** The dialog's one verb: "Add travel" or "Save changes". */
  primaryTitle: string;
  trip: Trip;
  /** Who travel can belong to — the trip's going members. */
  members: Member[];
  /** The organizer files for anyone; a traveler is the member already. */
  viewerIsOrganizer: boolean;
  /** The signed-in traveler, when the viewer is not the organizer. */
  lockedMember: Member | null;
  /** Past wheres, so the field autocompletes instead of guessing. */
  whereSuggestions: string[];
  dismissHref: string;
  /** Prefill, for editing. Nothing means a blank form. */
  initial:
    | {
        memberId: string;
        arrival: TravelLeg | undefined;
        departure: TravelLeg | undefined;
        /** Which tab to open on — the direction that was tapped. */
        direction: TravelDirection;
      }
    | undefined;
  /** Which directions already have a record, so Delete knows its scope. */
  filed: { arrival: boolean; departure: boolean };
  /** Handed an input that has already passed validation. */
  onSubmit: (input: NewTravelInput) => void;
  /** Deleting is per direction: the tab you are on is what goes. */
  onDelete: ((direction: TravelDirection) => void) | undefined;
}) {
  const [memberId, setMemberId] = useState(
    initial?.memberId ?? lockedMember?.id ?? "",
  );
  const [direction, setDirection] = useState<TravelDirection>(
    initial?.direction ?? "arrival",
  );
  const [legs, setLegs] = useState<Record<TravelDirection, TravelLeg>>({
    arrival: initial?.arrival ?? emptyLeg(),
    departure: initial?.departure ?? emptyLeg(),
  });
  const [submitted, setSubmitted] = useState(false);

  const input: NewTravelInput = {
    memberId,
    arrival: legs.arrival,
    departure: legs.departure,
  };
  const errors = submitted ? validateNewTravel(input) : {};
  const shown = legs[direction];

  function setLeg(next: TravelLeg) {
    setLegs((current) => ({ ...current, [direction]: next }));
  }

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

      {/* Who: the organizer's field, and only theirs. A traveler is
          already the answer, so the question is not asked. */}
      {viewerIsOrganizer ? (
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
      ) : (
        <Text className="font-body-bold text-base text-ink">
          {lockedMember?.name ?? ""}
        </Text>
      )}

      {/* The two directions, one at a time. A tab that has been filled in
          says so, or the other direction would hide silently. */}
      <Segmented
        options={DIRECTIONS.map((option) => ({
          value: option.value,
          label: legIsFiled(legs[option.value])
            ? `${option.label} ·`
            : option.label,
        }))}
        value={direction}
        onChange={setDirection}
      />

      <LegFields
        direction={direction}
        leg={shown}
        onChange={setLeg}
        trip={trip}
        whereSuggestions={whereSuggestions}
        errors={submitted ? errors[direction] : undefined}
      />

      {onDelete && filed[direction] ? (
        <View className="border-t border-ink pt-6">
          <Button
            title={`Delete ${direction === "arrival" ? "arrival" : "departure"}`}
            variant="danger"
            fullWidth
            onPress={() => onDelete(direction)}
          />
        </View>
      ) : null}
    </FullscreenDialog>
  );
}

/**
 * One direction's four questions. Where first, because it is the one
 * everyone can answer; the flight number is the shortcut for those who
 * flew, and it is the only thing that needs a button.
 */
function LegFields({
  direction,
  leg,
  onChange,
  trip,
  whereSuggestions,
  errors,
}: {
  direction: TravelDirection;
  leg: TravelLeg;
  onChange: (leg: TravelLeg) => void;
  trip: Trip;
  whereSuggestions: string[];
  errors: Partial<Record<"day" | "time" | "location", string>> | undefined;
}) {
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const today = toIso(new Date());
  const timeZone = trip.preferredTimezone ?? null;
  const arrival = direction === "arrival";
  const label = arrival ? "Arrival time" : "Departure time";

  // The lookup flies on the leg's own day: one date, one number, and
  // the time and the where fill themselves in.
  const canLookup =
    !lookingUp &&
    isFlightNumber(leg.flightNumber) &&
    /^\d{4}-\d{2}-\d{2}$/.test(leg.day);

  async function autofill() {
    setLookingUp(true);
    setLookupError(null);
    const result = await lookupFlight(leg.flightNumber, leg.day);
    setLookingUp(false);
    if (!result) {
      setLookupError("Flight not found for this date.");
      return;
    }
    onChange(
      legFromLookup(
        leg,
        direction,
        result,
        leg.flightNumber.trim(),
        timeZone,
      ),
    );
  }

  return (
    <View className="gap-4">
      <Dropdown
        label="Where"
        options={whereSuggestions}
        value={leg.location || null}
        onChange={(location) => {
          setLookupError(null);
          onChange({ ...leg, location });
        }}
        placeholder={arrival ? "BCN T2" : "Sants station"}
        error={errors?.location}
        freeText
      />

      {/* A number and a day, and the rest fills itself in — the option
          for those who flew, never a requirement. The button shares the
          field's baseline rather than its box: both are bottom-aligned,
          so the label above never pushes it out of line. */}
      <View className="gap-1">
        <View className="flex-row items-end gap-2">
          <View className="flex-1">
            <TextField
              label="Flight number"
              value={leg.flightNumber}
              onChangeText={(flightNumber) => {
                setLookupError(null);
                onChange({ ...leg, flightNumber });
              }}
              placeholder="UA 1842"
            />
          </View>
          <Button
            title={lookingUp ? "Looking up…" : "Autofill"}
            variant="secondary"
            // "end" rather than the default "start": inside a row that
            // puts `self-start` on it, which vertically top-aligns the
            // button against a field that has a label above it.
            align="end"
            disabled={!canLookup}
            onPress={autofill}
          />
        </View>
        <Text className="font-body text-sm text-ink opacity-60">
          Optional — a day below and a number fills the rest.
        </Text>
        {lookupError ? (
          <Text className="font-body text-sm text-ink">{lookupError}</Text>
        ) : null}
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-4">
          <Text className="font-body-bold text-sm text-ink">
            {arrival ? "Day you land" : "Day you leave"}
          </Text>
          {/* The morning the calendar cannot reach: the last day is its
              edge, and a red-eye home lands past it. */}
          <ChipToggle
            label="Next day"
            selected={leg.nextDay}
            onPress={() => onChange({ ...leg, nextDay: !leg.nextDay })}
          />
        </View>
        <DatePicker
          selection={{ start: leg.day || null, end: leg.day || null }}
          onChange={(dates) => onChange({ ...leg, day: dates.start ?? "" })}
          single
          min={trip.startDate}
          max={trip.endDate}
        />
        <Text className="font-body text-sm text-ink">
          {leg.day
            ? leg.nextDay
              ? `${dayLabel(leg.day, today)} + 1 day`
              : dayLabel(leg.day, today)
            : "Pick the day."}
        </Text>
        {errors?.day ? (
          <Text className="font-body text-sm text-ink">{errors.day}</Text>
        ) : null}
      </View>

      <TimeField
        label={label}
        value={leg.time || null}
        onChange={(time) => onChange({ ...leg, time: time ?? "" })}
        error={errors?.time}
      />

      <TextField
        label="Details"
        value={leg.details}
        onChangeText={(details) => onChange({ ...leg, details })}
        placeholder={
          arrival ? "Bags take twenty minutes." : "Can drop bags at the flat."
        }
        multiline
        numberOfLines={2}
      />
    </View>
  );
}
