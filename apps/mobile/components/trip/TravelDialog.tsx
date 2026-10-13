import { useCallback, useEffect, useRef, useState } from "react";
import { Stack } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { DayStrip } from "@/components/ui/DayStrip";
import { Triangle } from "@/components/ui/DisclosureButton";
import { FieldError } from "@/components/ui/FieldError";
import { TimeField } from "@/components/ui/TimeField";
import { InlineError } from "@/components/ui/InlineError";
import { NOT_SHARED } from "@/lib/wording";
import type { PickerEntry } from "@/lib/dropdown";
import {
  formatFlightNumber,
  isFlightNumber,
  lookupFlight,
} from "@/lib/flights";
import { travelDays } from "@/lib/travelDays";
import {
  farEndNote,
  legFromLookup,
  legFromRecord,
  legIsFiled,
  legsForMember,
  legSummary,
  validateNewTravel,
  type LegErrors,
  type LegSeed,
  type NewTravelInput,
  type TravelDirection,
  type TravelLeg,
} from "@/lib/newTravel";
import type { Trip } from "@/components/trip/TripCard";
import type { MockTravel } from "@/mocks/travel";
import { useMotion } from "@/hooks/useMotion";
import type { Member } from "@/lib/members";

const DIRECTIONS: Array<{ value: TravelDirection; heading: string }> = [
  { value: "arrival", heading: "Arriving" },
  { value: "departure", heading: "Departing" },
];

/** What a field says when there is nothing to say with a place name. */
const WHERE_PLACEHOLDER = "Airport, station, address";

/**
 * The travel form, in one place because there is one of it: one member,
 * both directions, and only the verb changes between adding and
 * editing.
 *
 * One dialog for everyone. The organizer gets the Who picker at the top;
 * a traveler is that member already, so the picker is simply absent —
 * the same form with one field fewer, not a second form.
 *
 * The two directions are two panels, not two toggles. Each panel's own
 * ink-filled header *is* the control and the readout at once: filling a
 * row with ink already means "this is the one you are on" everywhere
 * else in this system, and the same row can carry the answer — "Fri Sep
 * 18 · 3:40 PM · BCN T2" under one direction and "Not shared yet" under
 * the other reads the whole record without opening anything. That is one
 * mark where there used to be four signals that could disagree: a
 * direction toggle, a tick or a dash per cell, a floating "Not shared
 * yet" line, and a summary line, all saying overlapping things about the
 * same two facts.
 *
 * There is no way to ask for times *instead of* a flight number, because
 * there is nothing to ask: every field of a direction is on screen at
 * once. The toggle that used to hide the where and both times behind it
 * was the same primitive at the same size as the direction toggle above
 * it, and it answered a question nobody had — a blank form opened on the
 * flight number and showed one field beside a dead button.
 *
 * The day is the trip's own days (`DayStrip`), because a leg's day is
 * bounded by the trip. A month grid bounded by a trip offers 31 days to
 * choose one of nine and draws the legal ninth — the morning after the
 * trip ends, where the red-eye home lands — as an unmarked grey cell.
 */
export function TravelDialog({
  title,
  primaryTitle,
  trip,
  timeZone,
  members,
  viewerIsOrganizer,
  lockedMember,
  memberId,
  onMemberChange,
  records,
  seed,
  openDirection,
  whereEntries,
  filed,
  dismissHref,
  serverError,
  onSubmit,
  onDelete,
  pending = false,
}: {
  title: string;
  /** The dialog's one verb: "Add travel" or "Save changes". */
  primaryTitle: string;
  trip: Trip;
  /**
   * The zone the trip is being read in. Not shown anywhere here: it is
   * what a flight lookup's instants are read back into the fields
   * through, so that a looked-up 18:30Z lands as the wall clock the
   * member will see.
   */
  timeZone: string | null;
  /** Who travel can belong to — the going roster plus the record holders. */
  members: Member[];
  /** The organizer files for anyone; a traveler is the member already. */
  viewerIsOrganizer: boolean;
  /** The signed-in traveler, when the viewer is not the organizer. */
  lockedMember: Member | null;
  /**
   * The picked member, owned by the screen rather than by this dialog:
   * both the delete target and the save target are decided up there, and
   * both of them read it. A traveler is already the answer, so the
   * picker is simply not rendered for them.
   */
  memberId: string;
  onMemberChange: (memberId: string) => void;
  /** The trip's live rows, so the picked member's legs can be read. */
  records: MockTravel[];
  /**
   * Legs a duplicate arrived with, before a recipient was picked: the
   * middle term of D5's one rule. Absent for every other way in.
   */
  seed?: LegSeed | undefined;
  /** Which direction opens — the one that was tapped. */
  openDirection: TravelDirection;
  /**
   * The `Where` field's rows: this trip's own wheres, the trip's
   * destination, then the caller's other-trip wheres, ranked and deduped
   * (`travelWhere`). A local list, which is why the field opens on press
   * and why it needs no attribution.
   */
  whereEntries: PickerEntry[];
  dismissHref: string;
  /** The last save's or delete's failure: the dialog stays open on it. */
  serverError?: string | null;
  /** Which directions already have a record, so Delete knows its scope. */
  filed: { arrival: boolean; departure: boolean };
  /** Handed an input that has already passed validation. */
  onSubmit: (input: NewTravelInput) => void;
  /** Deleting is per direction: the panel you are in is what goes. */
  onDelete: ((direction: TravelDirection) => void) | undefined;
  /** A write is in flight: the dialog's own two buttons stop. */
  pending?: boolean;
}) {
  const motion = useMotion();
  // One rule for what the fields hold: the picked member's record for
  // that direction, else the seed a duplicate arrived with, else nothing
  // (`legsForMember`). The fields are *about* this member, so a `Who`
  // change re-derives them instead of leaving the previous person's leg
  // behind — which filed one person's times under another's name.
  const readLeg = useCallback(
    (record: MockTravel, direction: TravelDirection) =>
      legFromRecord(record, direction, timeZone, trip.startDate, trip.endDate),
    [timeZone, trip.startDate, trip.endDate],
  );
  const [legs, setLegs] = useState<Record<TravelDirection, TravelLeg>>(() =>
    legsForMember(records, seed, memberId, readLeg),
  );
  // Which panel is open: the one that was tapped if there was one, the
  // arrival otherwise — arrival is what a trip is waiting on.
  const [direction, setDirection] = useState<TravelDirection>(openDirection);
  const [submitted, setSubmitted] = useState(false);
  // Neither direction has anything in it. That is not the same as a
  // direction left unshared, which is a real answer: a form sent with
  // both blank would close having written nothing, which reads exactly
  // like having written something.
  const [blank, setBlank] = useState(false);

  // Keyed on the member alone, and that is the whole point. Re-deriving
  // whenever `records` changes would wipe the field you are typing in the
  // moment a save invalidates the list, and a seed that did not survive
  // the first pick would make the duplicate need its own exception. The
  // ref carries the latest read without joining the dependency list, so
  // the effect says what it means: this runs when the member changes.
  const latest = useRef({ readLeg, records, seed });
  latest.current = { readLeg, records, seed };
  useEffect(() => {
    setLegs(
      legsForMember(
        latest.current.records,
        latest.current.seed,
        memberId,
        latest.current.readLeg,
      ),
    );
    // A clean slate per member: the last one's "nothing was filled in"
    // complaint has no business following you to this one.
    setSubmitted(false);
    setBlank(false);
  }, [memberId]);

  const input: NewTravelInput = {
    memberId,
    arrival: legs.arrival,
    departure: legs.departure,
  };
  const errors = submitted ? validateNewTravel(input) : {};

  function setLeg(next: TravelLeg) {
    setBlank(false);
    setLegs((current) => ({ ...current, [direction]: next }));
  }

  function submit() {
    setSubmitted(true);
    // Nothing in either direction: the dialog would dismiss on an empty
    // save. Saying so is the whole of the fix — `legIsFiled` is what the
    // validator already uses to tell "unshared" from "not filled in yet",
    // and it says an untouched direction is not an error, which is true
    // of one direction and not of two.
    if (
      !legIsFiled(legs.arrival, "arrival") &&
      !legIsFiled(legs.departure, "departure")
    ) {
      setBlank(true);
      return;
    }
    const found = validateNewTravel(input);
    if (Object.keys(found).length > 0) {
      // The fault may be in the panel you are not looking at: open it
      // rather than failing behind a header you cannot see into.
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
      pending={pending}
      // The footer is the scaffold's, and the label is the one thing the
      // form still owns: this dialog deletes a direction rather than a
      // record, so which one it is belongs in the title — and it is
      // absent while no direction is filed.
      dangerTitle={
        onDelete && filed[direction]
          ? `Delete ${direction === "arrival" ? "arrival" : "departure"}`
          : undefined
      }
      onDanger={onDelete ? () => onDelete(direction) : undefined}
      dismissHref={dismissHref}
    >
      <Stack.Screen options={{ presentation: "modal" }} />
      {serverError ? <InlineError message={serverError} /> : null}
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
          onChange={onMemberChange}
          placeholder="Pick who this is for…"
          error={errors.memberId}
          // The roster is already here, so entering the field is the
          // question: showing nothing until a keystroke was how "Who"
          // looked empty on a form that had everyone in it.
          openOnPress
        />
      ) : (
        <Text className="font-body-bold text-base text-ink">
          {lockedMember?.name ?? ""}
        </Text>
      )}

      {/* The whole form's complaint, above both panels because no single
          field is at fault when none of them has been answered. */}
      <FieldError
        message={
          blank
            ? "Add a day or a time to the arrival or the departure."
            : undefined
        }
      />

      {/* Two panels in fixed order, arrival first. Each header is a
          radio: the chosen one is filled with ink and pressing it does
          nothing, the other is paper and opens its panel. `radiogroup`
          because it is a choice among visible options — the same role
          pair the toggle it replaces carried. */}
      <View role="radiogroup" className="gap-2">
        {DIRECTIONS.map((panel) => {
          const open = panel.value === direction;
          const leg = legs[panel.value];
          return (
            <View key={panel.value} className="gap-2">
              <Pressable
                role="radio"
                aria-selected={open}
                onPress={() => setDirection(panel.value)}
                className={`flex-row items-center gap-3 border border-ink px-3 py-3 ${
                  open ? "bg-ink" : motion.pressDim
                }`}
              >
                <View className="flex-1">
                  <Text
                    className={`font-display-semibold text-heading-lg uppercase ${
                      open ? "text-sand" : "text-ink"
                    }`}
                  >
                    {panel.heading}
                  </Text>
                  {/* The panel's own answer, in the same words the board's
                      row uses: the day, the clock, and where. An unfilled
                      direction says so here rather than reading as a
                      screen you have not visited. */}
                  <Text
                    className={`font-body text-sm ${
                      open ? "text-sand" : "text-ink"
                    }`}
                  >
                    {legSummary(leg, panel.value) || NOT_SHARED}
                  </Text>
                </View>

                {/* The shut panel's mark, and the answer to the question a
                    shut panel raises: does this do anything? It reveals
                    its fields in place, which is `DisclosureButton`'s
                    shape exactly — a heading, its readout, and its
                    content opening directly under it at the same width —
                    so it wears that component's triangle rather than a
                    mark of its own. The open panel carries none: the ink
                    fill already says which one is chosen, and a second
                    answer to one question is what this form has been
                    getting rid of.

                    The ground is the other half of it. A shut panel used
                    to sit on `paper`, which is the ground a *field* wears
                    (`TextField` is `border-ink bg-paper`), so a panel
                    heading and a text input were the same white box with
                    an ink border. Transparent is what the system's other
                    borderless-fill control wears (`Button secondary`), and
                    paper now means a field again. */}
                {open ? null : <Triangle open={false} />}
              </Pressable>

              {open ? (
                <LegFields
                  direction={panel.value}
                  leg={leg}
                  onChange={setLeg}
                  trip={trip}
                  timeZone={timeZone}
                  whereEntries={whereEntries}
                  errors={submitted ? errors[panel.value] : undefined}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </FullscreenDialog>
  );
}

/**
 * One direction's questions, all of them, in the order they are
 * answered: the day, then the number the times can come from, then
 * where and the two times — filled in by a lookup or by hand.
 *
 * Every field is always rendered. The day leads because the lookup needs
 * it, and the number sits directly under the day so nothing scrolls
 * between the two; that adjacency is also the answer to "why will
 * Autofill not press" that the old hidden-field version never gave.
 */
function LegFields({
  direction,
  leg,
  onChange,
  trip,
  timeZone,
  whereEntries,
  errors,
}: {
  direction: TravelDirection;
  leg: TravelLeg;
  onChange: (leg: TravelLeg) => void;
  trip: Trip;
  /** See the dialog: for reading a lookup back into the fields, nothing
   *  more. The pickers and the readout say the time and nothing else. */
  timeZone: string | null;
  whereEntries: PickerEntry[];
  errors: LegErrors | undefined;
}) {
  const motion = useMotion();
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const arrival = direction === "arrival";
  // The far end's day, said back under the field that owns it — the
  // arrival's departure, or the departure's arrival. Null when the leg
  // does not cross midnight, where "the same day" would be noise the
  // chosen day already covers.
  const farNote = farEndNote(leg, direction);

  // The lookup flies on the leg's own day: one date, one number, and the
  // time and the where fill themselves in.
  const canLookup =
    !lookingUp &&
    isFlightNumber(leg.flightNumber) &&
    /^\d{4}-\d{2}-\d{2}$/.test(leg.day);

  async function autofill() {
    setLookingUp(true);
    setLookupError(null);
    try {
      const result = await lookupFlight(leg.flightNumber, leg.day);
      if (!result) {
        // No dead end: the times are right there, so a lookup that finds
        // nothing leaves you typing them instead of stuck.
        setLookupError("Flight not found for this date. Fill in the times.");
        return;
      }
      onChange(
        legFromLookup(leg, direction, result, leg.flightNumber.trim(), timeZone),
      );
    } catch {
      // lookupFlight propagates transport and timeout failures by design
      // (lib/flights.ts): a down API is not "no such flight", but the
      // field-level answer is the same — the times by hand. The flag
      // always clears so the spinner cannot stick.
      setLookupError("Flight lookup failed. Fill in the times.");
    } finally {
      setLookingUp(false);
    }
  }

  return (
    <View className="gap-4">
      {/* The trip's own days, and the morning after it ends. No label
          above it: the cells carry their own weekday and number, and the
          panel header above read the chosen day back in full. */}
      <View className="gap-1">
        <DayStrip
          days={travelDays(trip)}
          value={leg.day || null}
          onChange={(day) => onChange({ ...leg, day })}
        />
        <FieldError message={errors?.day} />
      </View>

      <View className="gap-1">
        <TextField
          label="Flight number"
          value={leg.flightNumber}
          onChangeText={(flightNumber) => {
            setLookupError(null);
            // Formatted as it is typed, so the field always shows the
            // shape the placeholder promises: the code, a space, the
            // number. A space typed by hand is accepted rather than
            // fought — it is stripped and put back in the right place.
            onChange({ ...leg, flightNumber: formatFlightNumber(flightNumber) });
          }}
          placeholder="UA 1842"
          suffix={
            <Pressable
              accessibilityRole="button"
              disabled={!canLookup}
              onPress={autofill}
              className={`justify-center border-l border-ink px-4 ${
                canLookup ? "" : "opacity-40"
              } ${motion.press}`}
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

      <Dropdown
        label="Where"
        options={whereEntries}
        value={leg.location || null}
        onChange={(location) => {
          setLookupError(null);
          onChange({ ...leg, location });
        }}
        placeholder={WHERE_PLACEHOLDER}
        error={errors?.location}
        freeText
        openOnPress
      />

      {/* Both ends, the way a flight has both, side by side the way the
          event form puts Starts and Ends: two times being compared are
          easier to compare next to each other.

          The two labels are the subject's own words — what you do at
          each end of a leg, in the order it happens — rather than the
          transport's: "Leaves 7:00 AM" and "Lands 8:40 PM" read as a
          sentence about the person, which is whose travel this is.

          Only the direction's own end is asked for; the far one is
          optional and says so. Filing an arrival is answering "when do
          you land", and the departure time is a thing the member often
          does not have — the same rule the stay form carries for two
          times that are often unknown. A blank there used to read as a
          field nobody had filled in yet.

          A leg that crosses midnight says so under the field that owns
          the far end. It is a readout, not a control: what the two times
          already mean, said back, so it cannot disagree with them. */}
      <View className="gap-4 md:flex-row">
        <View className="gap-1 md:flex-1">
          <TimeField
            label="Leaves"
            value={leg.departureTime || null}
            onChange={(time) => onChange({ ...leg, departureTime: time ?? "" })}
            error={errors?.departureTime}
            optional={arrival}
            noneLabel="No departure time"
          />
          {arrival && farNote ? (
            <Text className="font-body text-sm text-ink opacity-60">
              {farNote}
            </Text>
          ) : null}
        </View>
        <View className="gap-1 md:flex-1">
          <TimeField
            label="Lands"
            value={leg.arrivalTime || null}
            onChange={(time) => onChange({ ...leg, arrivalTime: time ?? "" })}
            error={errors?.arrivalTime}
            optional={!arrival}
            noneLabel="No arrival time"
          />
          {!arrival && farNote ? (
            <Text className="font-body text-sm text-ink opacity-60">
              {farNote}
            </Text>
          ) : null}
        </View>
      </View>

      <TextField
        label="Details"
        value={leg.details}
        onChangeText={(details) => onChange({ ...leg, details })}
        placeholder="Anything the others should know."
        multiline
        numberOfLines={2}
      />
    </View>
  );
}
