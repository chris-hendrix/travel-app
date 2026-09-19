import { useState } from "react";
import { Stack } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimeField } from "@/components/ui/TimeField";
import { dayLabel } from "@/lib/itinerary";
import { toIso } from "@/lib/dateRange";
import { isFlightNumber, lookupFlight } from "@/lib/flights";
import {
  emptyLeg,
  legFromLookup,
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
  // Which direction the member already owes: the one that was tapped if
  // there was one, the arrival otherwise — arrival is what a trip is
  // waiting on.
  const [open, setOpen] = useState<TravelDirection | null>(
    initial?.direction ?? "arrival",
  );
  const [submitted, setSubmitted] = useState(false);

  const input: NewTravelInput = {
    memberId,
    arrival: legs.arrival,
    departure: legs.departure,
  };
  const errors = submitted ? validateNewTravel(input) : {};

  function setLeg(direction: TravelDirection, next: TravelLeg) {
    setLegs((current) => ({ ...current, [direction]: next }));
  }

  function submit() {
    setSubmitted(true);
    const found = validateNewTravel(input);
    if (Object.keys(found).length > 0) {
      // The fault may be in the closed direction: open it rather than
      // failing silently behind a collapsed header.
      if (found.arrival) setOpen("arrival");
      else if (found.departure) setOpen("departure");
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

      <View className="border-t border-ink">
        {DIRECTIONS.map((option) => (
          <DirectionPanel
            key={option.value}
            heading={option.heading}
            direction={option.value}
            leg={legs[option.value]}
            open={open === option.value}
            onToggle={() =>
              setOpen((current) =>
                current === option.value ? null : option.value,
              )
            }
            onChange={(next) => setLeg(option.value, next)}
            trip={trip}
            whereSuggestions={whereSuggestions}
            errors={submitted ? errors[option.value] : undefined}
            onDelete={
              onDelete && filed[option.value]
                ? () => onDelete(option.value)
                : undefined
            }
          />
        ))}
      </View>
    </FullscreenDialog>
  );
}

/**
 * One direction: a header that states its answer, and the fields behind
 * it. Collapsed, the header is the whole record — when it is, where it
 * is, and which flight — which is why the summary is worth computing
 * rather than being a count of empty fields.
 */
function DirectionPanel({
  heading,
  direction,
  leg,
  open,
  onToggle,
  onChange,
  trip,
  whereSuggestions,
  errors,
  onDelete,
}: {
  heading: string;
  direction: TravelDirection;
  leg: TravelLeg;
  open: boolean;
  onToggle: () => void;
  onChange: (leg: TravelLeg) => void;
  trip: Trip;
  whereSuggestions: string[];
  errors: LegErrors | undefined;
  onDelete: (() => void) | undefined;
}) {
  const Icon = open ? ArrowUp : ArrowDown;
  const summary = legSummary(leg, direction);

  return (
    <View className="border-b border-b-ink">
      <Pressable
        accessibilityRole="button"
        aria-expanded={open}
        onPress={onToggle}
        className="flex-row items-center justify-between gap-4 py-4"
      >
        <View className="flex-1 gap-0.5">
          <Text className="font-body-bold text-base text-ink">{heading}</Text>
          {/* The answer, or that there isn't one yet. A direction left
              empty is a fact about the trip, so it is said rather than
              left blank. */}
          <Text className="font-body text-sm text-ink">
            {summary || NOT_SHARED}
          </Text>
        </View>
        <Icon color="#000000" size={20} />
      </Pressable>

      {open ? (
        <View className="gap-4 pb-5">
          <LegFields
            direction={direction}
            leg={leg}
            onChange={onChange}
            trip={trip}
            whereSuggestions={whereSuggestions}
            errors={errors}
          />
          {onDelete ? (
            <Button
              title={`Delete ${direction === "arrival" ? "arrival" : "departure"}`}
              variant="danger"
              fullWidth
              onPress={onDelete}
            />
          ) : null}
        </View>
      ) : null}
    </View>
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
  errors: LegErrors | undefined;
}) {
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const today = toIso(new Date());
  const timeZone = trip.preferredTimezone ?? null;
  const arrival = direction === "arrival";

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
      setLookupError("Flight not found for this date.");
      return;
    }
    onChange(
      legFromLookup(leg, direction, result, leg.flightNumber.trim(), timeZone),
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
        <Text className="font-body-bold text-sm text-ink">
          {arrival ? "Day you land" : "Day you leave"}
        </Text>
        <DatePicker
          selection={{ start: leg.day || null, end: leg.day || null }}
          onChange={(dates) => onChange({ ...leg, day: dates.start ?? "" })}
          single
          min={trip.startDate}
          max={trip.endDate}
        />
        <Text className="font-body text-sm text-ink">
          {leg.day ? dayLabel(leg.day, today) : "Pick the day."}
        </Text>
        {errors?.day ? (
          <Text className="font-body text-sm text-ink">{errors.day}</Text>
        ) : null}
      </View>

      {/* Both ends, the way a flight has both. The calendar cannot say
          that a red-eye lands past its last day or that an arrival left
          the evening before, so the far end carries the chip that does:
          it belongs to the time it moves, not to the leg. */}
      <TimeField
        label="Departure time"
        value={leg.departureTime || null}
        onChange={(time) => onChange({ ...leg, departureTime: time ?? "" })}
        error={errors?.departureTime}
        accessory={
          arrival ? (
            <ChipToggle
              label="Day before"
              selected={leg.farDay}
              onPress={() => onChange({ ...leg, farDay: !leg.farDay })}
            />
          ) : undefined
        }
      />

      <TimeField
        label="Arrival time"
        value={leg.arrivalTime || null}
        onChange={(time) => onChange({ ...leg, arrivalTime: time ?? "" })}
        error={errors?.arrivalTime}
        accessory={
          arrival ? undefined : (
            <ChipToggle
              label="Next day"
              selected={leg.farDay}
              onPress={() => onChange({ ...leg, farDay: !leg.farDay })}
            />
          )
        }
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
