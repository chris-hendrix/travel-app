import { useState } from "react";
import { Stack } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimeField } from "@/components/ui/TimeField";
import type { Selection } from "@/lib/calendar";
import { dayLabel } from "@/lib/itinerary";
import { toIso } from "@/lib/dateRange";
import { isFlightNumber, lookupFlight } from "@/lib/flights";
import {
  emptySection,
  sectionFromLookup,
  validateNewTravel,
  type NewTravelInput,
  type TravelSectionInput,
} from "@/lib/newTravel";
import type { Trip } from "@/components/trip/TripCard";
import type { Member } from "@/lib/members";

/**
 * The travel form, in one place because there is one of it: one member,
 * both directions, and only the verb changes between adding and
 * editing. Two copies of these fields would be two things to keep in
 * step for no gain.
 *
 * Who comes first — a picker for the organizer, a locked line for a
 * traveler filing their own. Then each direction in the web's order:
 * where first, because that is the question everyone can answer; the
 * flight number with its Autofill as the option for those who flew;
 * day and time, filled by hand or by the lookup.
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
  /** The organizer files for anyone; a traveler is locked to self. */
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
        arrival: Partial<TravelSectionInput> | undefined;
        departure: Partial<TravelSectionInput> | undefined;
      }
    | undefined;
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
  const [memberId, setMemberId] = useState(
    initial?.memberId ?? lockedMember?.id ?? "",
  );
  const [arrival, setArrival] = useState<TravelSectionInput>({
    ...emptySection(),
    ...initial?.arrival,
  });
  const [departure, setDeparture] = useState<TravelSectionInput>({
    ...emptySection(),
    ...initial?.departure,
  });
  const [submitted, setSubmitted] = useState(false);

  const input: NewTravelInput = { memberId, arrival, departure };
  const errors = submitted ? validateNewTravel(input) : {};

  function submit() {
    setSubmitted(true);
    if (Object.keys(validateNewTravel(input)).length > 0) return;
    onSubmit(input);
  }

  const timeZone = trip.preferredTimezone ?? null;

  return (
    <FullscreenDialog
      title={title}
      primaryTitle={primaryTitle}
      onPrimary={submit}
      dismissHref={dismissHref}
    >
      <Stack.Screen options={{ presentation: "modal" }} />
      <Text className="font-body text-sm text-ink">{trip.title}</Text>

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

      <TravelSection
        heading="Arriving"
        direction="arrival"
        trip={trip}
        section={arrival}
        onChange={setArrival}
        whereSuggestions={whereSuggestions}
        timeZone={timeZone}
        errors={errors.arrival}
        submitted={submitted}
      />

      <TravelSection
        heading="Departing"
        direction="departure"
        trip={trip}
        section={departure}
        onChange={setDeparture}
        whereSuggestions={whereSuggestions}
        timeZone={timeZone}
        errors={errors.departure}
        submitted={submitted}
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

function TravelSection({
  heading,
  direction,
  trip,
  section,
  onChange,
  whereSuggestions,
  timeZone,
  errors,
  submitted,
}: {
  heading: string;
  direction: "arrival" | "departure";
  trip: Trip;
  section: TravelSectionInput;
  onChange: (section: TravelSectionInput) => void;
  whereSuggestions: string[];
  timeZone: string | null;
  errors: Partial<Record<"day" | "time" | "location", string>> | undefined;
  submitted: boolean;
}) {
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const today = toIso(new Date());
  const day = section.day;

  // The lookup flies on the section's own day: one date, one number,
  // and the rest fills itself in.
  const canLookup =
    !lookingUp &&
    isFlightNumber(section.flightNumber) &&
    /^\d{4}-\d{2}-\d{2}$/.test(section.day);

  async function autofill() {
    setLookingUp(true);
    setLookupError(null);
    const result = await lookupFlight(section.flightNumber, section.day);
    setLookingUp(false);
    if (!result) {
      setLookupError("Flight not found for this date.");
      return;
    }
    onChange(
      sectionFromLookup(
        section,
        direction,
        result,
        section.flightNumber.trim(),
        timeZone,
      ),
    );
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <Text className="font-display text-3xl uppercase text-ink">
          {heading}
        </Text>
        <ChipToggle
          label={section.enabled ? "Included" : "Add"}
          selected={section.enabled}
          onPress={() =>
            onChange({ ...section, enabled: !section.enabled })
          }
        />
      </View>

      {section.enabled ? (
        <View className="gap-4">
          {/* Where first: everyone knows where, not everyone flew. */}
          <Dropdown
            label="Where"
            options={whereSuggestions}
            value={section.location || null}
            onChange={(location) => {
              setLookupError(null);
              onChange({ ...section, location });
            }}
            placeholder="BCN T2"
            error={submitted ? errors?.location : undefined}
            freeText
          />

          {/* The option for those who flew: a number and a day, and the
              time and the where fill themselves in. */}
          <View className="gap-1">
            <View className="flex-row items-end gap-2">
              <View className="flex-1">
                <TextField
                  label="Flight number"
                  value={section.flightNumber}
                  onChangeText={(flightNumber) => {
                    setLookupError(null);
                    onChange({ ...section, flightNumber });
                  }}
                  placeholder="UA 1842"
                />
              </View>
              <View className="pb-1">
                {lookingUp ? (
                  <View className="border border-ink bg-transparent p-4">
                    <ActivityIndicator color="#000000" />
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canLookup}
                    onPress={autofill}
                    className={`items-center border border-ink bg-transparent p-4 ${canLookup ? "" : "opacity-40"}`}
                  >
                    <Text className="font-body-bold text-sm text-ink">
                      Autofill
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
            <Text className="font-body text-sm text-ink opacity-60">
              Optional — a date below and a number fills the rest.
            </Text>
            {lookupError ? (
              <Text className="font-body text-sm text-ink">
                {lookupError}
              </Text>
            ) : null}
          </View>

          <View className="gap-2">
            <Text className="font-body-bold text-sm text-ink">Day</Text>
            <DatePicker
              selection={{ start: section.day || null, end: section.day || null }}
              onChange={(dates: Selection) =>
                onChange({
                  ...section,
                  day: dates.start ?? "",
                })
              }
              single
              min={trip.startDate}
              max={trip.endDate}
            />
            <Text className="font-body text-sm text-ink">
              {day ? dayLabel(day, today) : "Pick the day it happens."}
            </Text>
            {submitted && errors?.day ? (
              <Text className="font-body text-sm text-ink">
                {errors.day}
              </Text>
            ) : null}
          </View>

          <TimeField
            label="Time"
            value={section.time || null}
            onChange={(time) => onChange({ ...section, time: time ?? "" })}
            error={submitted ? errors?.time : undefined}
          />

          <TextField
            label="Details"
            value={section.details}
            onChangeText={(details) => onChange({ ...section, details })}
            placeholder="Bags take twenty minutes."
            multiline
            numberOfLines={2}
          />
        </View>
      ) : null}
    </View>
  );
}
