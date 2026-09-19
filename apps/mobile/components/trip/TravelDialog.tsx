import { useState } from "react";
import { Stack } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { Segmented } from "@/components/ui/Segmented";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimeField } from "@/components/ui/TimeField";
import { dayLabel } from "@/lib/itinerary";
import { addDays, toIso } from "@/lib/dateRange";
import { isFlightNumber, lookupFlight } from "@/lib/flights";
import {
  emptyLeg,
  farEndNote,
  legFromLookup,
  legIsFiled,
  legSummary,
  validateNewTravel,
  type LegErrors,
  type NewTravelInput,
  type TravelDirection,
  type TravelLeg,
} from "@/lib/newTravel";
import type { Trip } from "@/components/trip/TripCard";
import type { Member } from "@/lib/members";

const DIRECTIONS: Array<{ value: TravelDirection; heading: string }> = [
  { value: "arrival", heading: "Arriving" },
  { value: "departure", heading: "Departing" },
];

const NOT_SHARED = "Not shared yet";

/** How the times are being given: off a flight number, or typed. */
type TravelMode = "flight" | "times";

const MODES: Array<{ value: TravelMode; label: string }> = [
  { value: "flight", label: "Flight number" },
  { value: "times", label: "Enter times" },
];

/**
 * The travel form, in one place because there is one of it: one member,
 * both directions, and only the verb changes between adding and
 * editing.
 *
 * One dialog for everyone. The organizer gets the Who picker at the top;
 * a traveler is that member already, so the picker is simply absent —
 * the same form with one field fewer, not a second form.
 *
 * The two directions are a disclosure each, not a pair of tabs. They are
 * not alternatives — most people have both, and both usually arrive in
 * the same conversation — so the form shows the state of each at once
 * and opens one at a time. Both headings carry their own answer, which
 * is the thing a row of tabs cannot do: "Arriving — Fri Sep 18 · 3:40 PM
 * · BCN T2" beside "Departing — Not shared yet" reads the whole record
 * without opening anything, and an unfilled direction is visibly a state
 * rather than a screen you have not visited.
 *
 * One panel open at a time is also the practical answer to bulk: a month
 * of days and a column of times is most of a screen, and rendering two
 * of each would be a scroll, not a form.
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
        /** Which direction to open on — the one that was tapped. */
        direction: TravelDirection;
      }
    | undefined;
  /** Which directions already have a record, so Delete knows its scope. */
  filed: { arrival: boolean; departure: boolean };
  /** Handed an input that has already passed validation. */
  onSubmit: (input: NewTravelInput) => void;
  /** Deleting is per direction: the panel you are in is what goes. */
  onDelete: ((direction: TravelDirection) => void) | undefined;
}) {
  const [memberId, setMemberId] = useState(
    initial?.memberId ?? lockedMember?.id ?? "",
  );
  const [legs, setLegs] = useState<Record<TravelDirection, TravelLeg>>({
    arrival: initial?.arrival ?? emptyLeg(),
    departure: initial?.departure ?? emptyLeg(),
  });
  // How each direction's times are being given: off a flight number, or
  // typed. A record that already holds a number opens on the flight it
  // came from, because that is how it was answered the first time.
  const [modes, setModes] = useState<Record<TravelDirection, TravelMode>>({
    arrival: initial?.arrival?.flightNumber ? "flight" : "times",
    departure: initial?.departure?.flightNumber ? "flight" : "times",
  });
  // Which direction is on screen: the one that was tapped if there was
  // one, the arrival otherwise — arrival is what a trip is waiting on.
  const [direction, setDirection] = useState<TravelDirection>(
    initial?.direction ?? "arrival",
  );
  const [submitted, setSubmitted] = useState(false);

  const input: NewTravelInput = {
    memberId,
    arrival: legs.arrival,
    departure: legs.departure,
  };
  const errors = submitted ? validateNewTravel(input) : {};

  function setLeg(next: TravelLeg) {
    setLegs((current) => ({ ...current, [direction]: next }));
  }

  const shown = legs[direction];

  function submit() {
    setSubmitted(true);
    const found = validateNewTravel(input);
    if (Object.keys(found).length > 0) {
      // The fault may be in the direction you are not looking at: switch
      // to it rather than failing behind a screen you cannot see.
      if (found.arrival) setDirection("arrival");
      else if (found.departure) setDirection("departure");
      return;
    }
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

      {/* Which end of the trip you are filing. A toggle rather than a
          disclosure: it is the first question and it is a choice, and one
          control that says so is clearer than two panels that each imply
          the other.
          
          Each cell carries its own state: a tick once the direction
          holds times, a dash while it does not. Two glyphs rather than
          "Not shared yet" in each cell, because that phrase is a third
          of a phone's half-width cell — the words appear in the line
          below when you select the empty one. What matters is that
          neither state is the absence of the other: an unfilled
          direction reads as empty, not as unvisited. */}
      <Segmented
        options={DIRECTIONS.map((option) => ({
          value: option.value,
          label: option.heading,
          // A tick once the direction holds times, a dash while it does
          // not: two marks, so an unfilled direction reads as empty
          // rather than as unvisited.
          mark: legIsFiled(legs[option.value], option.value) ? "✓" : "–",
        }))}
        value={direction}
        onChange={setDirection}
      />

      {/* The line under the toggle is the selection: what this direction
          already holds, in the same words its row uses on the board. */}
      <Text className="font-body text-base text-ink">
        {legSummary(shown, direction) || NOT_SHARED}
      </Text>

      <LegFields
        direction={direction}
        leg={shown}
        onChange={setLeg}
        mode={modes[direction]}
        onModeChange={(mode) =>
          setModes((current) => ({ ...current, [direction]: mode }))
        }
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
  mode,
  onModeChange,
  trip,
  whereSuggestions,
  errors,
}: {
  direction: TravelDirection;
  leg: TravelLeg;
  onChange: (leg: TravelLeg) => void;
  mode: TravelMode;
  onModeChange: (mode: TravelMode) => void;
  trip: Trip;
  whereSuggestions: string[];
  errors: LegErrors | undefined;
}) {
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const today = toIso(new Date());
  const timeZone = trip.preferredTimezone ?? null;
  const arrival = direction === "arrival";
  // The other end's day, said back under the field that owns it. Null
  // when the leg does not cross midnight, where "the same day" would be
  // noise the day line above already covers.
  const departureNote = farEndNote(leg, direction);
  const arrivalNote = farEndNote(leg, direction);
  const hasTimes = Boolean(leg.departureTime.trim() || leg.arrivalTime.trim());
  const hasWhere = Boolean(leg.location.trim());
  // Where and the times are what a flight number answers, so in flight
  // mode they wait until there is an answer to show — and then they stay,
  // because a looked-up value is a starting point rather than a verdict
  // and hiding it would leave nothing to correct. An error opens them
  // too: a complaint about a field nobody can see is not a complaint.
  const showWhere =
    mode === "times" || hasWhere || Boolean(errors?.location);
  const showTimes =
    mode === "times" ||
    hasTimes ||
    Boolean(errors?.departureTime || errors?.arrivalTime);

  // The lookup flies on the leg's own day: one date, one number, and the
  // time and the where fill themselves in.
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
      // No dead end: the times are right below, so a lookup that finds
      // nothing leaves you typing them instead of stuck.
      setLookupError("Flight not found for this date — enter the times below.");
      onModeChange("times");
      return;
    }
    onChange(
      legFromLookup(leg, direction, result, leg.flightNumber.trim(), timeZone),
    );
  }

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Text className="font-body-bold text-sm text-ink">
          {arrival ? "Day you land" : "Day you leave"}
        </Text>
        {/* Bounded by the trip, and one day past its end: a stay is
            booked through its last night, so check-out and the flight
            home are the morning after the last day. */}
        <DatePicker
          selection={{ start: leg.day || null, end: leg.day || null }}
          onChange={(dates) => onChange({ ...leg, day: dates.start ?? "" })}
          single
          min={trip.startDate}
          max={addDays(trip.endDate, 1)}
        />
        <Text className="font-body text-sm text-ink">
          {leg.day ? dayLabel(leg.day, today) : "Pick the day."}
        </Text>
        {errors?.day ? (
          <Text className="font-body text-sm text-ink">{errors.day}</Text>
        ) : null}
      </View>

      {/* How the times are being given, sitting with the number it
          governs: below the day, above the field. The day is the leg's
          first question; this one is about the field under it. */}
      <Segmented options={MODES} value={mode} onChange={onModeChange} />

      {/* The shortcut, and only in the mode that asks for it. Directly
          under the day because the day is what the lookup needs: type a
          number, press once, and the where and the times below fill in
          without a scroll between them. */}
      {mode === "flight" ? (
      <View className="gap-1">
        <TextField
          label="Flight number"
          value={leg.flightNumber}
          onChangeText={(flightNumber) => {
            setLookupError(null);
            onChange({ ...leg, flightNumber });
          }}
          placeholder="UA 1842"
          suffix={
            <Pressable
              accessibilityRole="button"
              disabled={!canLookup}
              onPress={autofill}
              className={`justify-center border-l border-ink px-4 ${
                canLookup ? "" : "opacity-40"
              }`}
            >
              <Text className="font-body-bold text-sm text-ink">
                {lookingUp ? "Looking up…" : "Autofill"}
              </Text>
            </Pressable>
          }
        />
        {lookupError ? (
          <Text className="font-body text-sm text-ink">{lookupError}</Text>
        ) : null}
      </View>
      ) : null}

      {showWhere ? (
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
      ) : null}

      {showTimes ? (
      <>
      {/* Both ends, the way a flight has both, side by side the way the
          event form puts Starts and Ends: two times being compared are
          easier to compare next to each other.

          A leg that crosses midnight says so under the field that owns
          the far end — "Left Thu Sep 18" under a departure, "Lands Sat
          Sep 26" under an arrival. It is a readout, not a control: what
          the two times already mean, said back, so it cannot disagree
          with them. */}
      <View className="gap-4 md:flex-row">
        <View className="gap-1 md:flex-1">
          <TimeField
            label="Departure time"
            value={leg.departureTime || null}
            onChange={(time) => onChange({ ...leg, departureTime: time ?? "" })}
            error={errors?.departureTime}
          />
          {arrival && departureNote ? (
            <Text className="font-body text-sm text-ink opacity-60">
              {departureNote}
            </Text>
          ) : null}
        </View>
        <View className="gap-1 md:flex-1">
          <TimeField
            label="Arrival time"
            value={leg.arrivalTime || null}
            onChange={(time) => onChange({ ...leg, arrivalTime: time ?? "" })}
            error={errors?.arrivalTime}
          />
          {!arrival && arrivalNote ? (
            <Text className="font-body text-sm text-ink opacity-60">
              {arrivalNote}
            </Text>
          ) : null}
        </View>
      </View>
      </>
      ) : null}

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
