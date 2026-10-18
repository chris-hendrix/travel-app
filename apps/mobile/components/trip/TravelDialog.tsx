import { useCallback, useEffect, useRef, useState } from "react";
import { Stack } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { TRANSPORT_MODES, type TransportMode } from "@journiful/shared/utils";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { TravelWhereField } from "@/components/trip/TravelWhereField";
import { DayStrip } from "@/components/ui/DayStrip";
import { Segmented } from "@/components/ui/Segmented";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { QuietAction } from "@/components/ui/QuietAction";
import { FieldError } from "@/components/ui/FieldError";
import { TimeField } from "@/components/ui/TimeField";
import { InlineError } from "@/components/ui/InlineError";
import { joinFacts, NOT_SHARED } from "@/lib/wording";
import { formatClock, isClockTime } from "@/lib/time";
import {
  NUMBER_MAX_LENGTH,
  endLabel,
  endNoun,
  farEndWord,
  hasLookup,
  hasNumberField,
  modeLabel,
  numberLabel,
  numberPlaceholder,
  switchLegMode,
  whereLabel,
  type TravelSide,
} from "@/lib/transportMode";
import type { PickerEntry } from "@/lib/dropdown";
import {
  formatFlightNumber,
  isFlightNumber,
  lookupFlight,
} from "@/lib/flights";
import { travelDays } from "@/lib/travelDays";
import {
  duplicateReplaces,
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
   * The local half of the `Where` field's rows: this trip's own wheres,
   * the trip's destination, then the caller's other-trip wheres, ranked
   * and deduped (`travelWhere`). Live Places results lead them in the
   * field itself (`TravelWhereField`), which is why this is the half the
   * screen hands over: the trip's own vocabulary, which no lookup can
   * supply, and which is all there is when the lookup is unavailable.
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
  // One rule for what the fields hold, in a duplicate and out of one
  // (`legsForMember`): a direction the seed holds is the leg being
  // duplicated, whichever record the picked member happens to have, and
  // every other direction is that member's own record or nothing. The
  // fields are *about* this member, so a `Who` change re-derives them
  // instead of leaving the previous person's leg behind — which filed one
  // person's times under another's name.
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
  // Which directions this duplicate is about to replace rather than file
  // (`duplicateReplaces`), and the member it is about to do it to. Read
  // per render from the same pair the fields were derived from, so the
  // sentence and the fields can never disagree about what is going where.
  const replacing = duplicateReplaces(records, seed, memberId);
  const pickedName =
    members.find((member) => member.id === memberId)?.name ??
    lockedMember?.name ??
    "";

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
          // A picker, not a search box. The roster is already here, so
          // the field shows who is chosen and opens the list on press —
          // and nothing can be typed into it that is not a member, which
          // is what a menu that keeps uncommitted text gets wrong: the
          // field read "Bob" while the form still held Alice, and the
          // save went to Alice.
          searchable={false}
        />
      ) : (
        <Text className="font-body-bold text-base text-ink">
          {lockedMember?.name ?? ""}
        </Text>
      )}

      {/* A duplicate's one consequence that its own button does not say:
          the leg is going onto a member who already has one in that
          direction, so saving replaces theirs instead of adding beside
          it — the API upserts on the member and the direction, which is
          the pair the record is (see `duplicateReplaces`). The sentence
          sits under the picker that made it true, in the quiet ink every
          reason this app states before a press uses, and it names the
          directions rather than saying "their travel": a duplicate
          carries both ends of a leg, and which of the two lands on
          something is the whole of what the reader has to decide about.
          It names the member the way the picker above it does, and it
          says nothing at all while nobody is picked, because nothing is
          going anywhere yet. The one case it names the *reader* is a
          traveler's own leg: the picker is not rendered for them (they
          are the answer), so a duplicate URL opened by a traveler — a
          deep link, since the button that builds it is the organizer's —
          reads "Replaces the arrival Alice filed" about Alice, who is
          reading. Said with the name rather than the app's own "You"
          (`ExpenseDetail`) because that word needs the reader's member id
          and this dialog is only handed it for a traveler; an organizer
          picking themselves is the other way into the same sentence, and
          there the name is what every other line about them says too. */}
      {replacing.length > 0 ? (
        <Text className="font-body text-sm text-ink opacity-60">
          {`Replaces the ${replacing.join(" and ")} ${pickedName} filed.`}
        </Text>
      ) : null}

      {/* The whole form's complaint, above both panels because no single
          field is at fault when none of them has been answered. */}
      <FieldError
        message={
          blank
            ? "Add a day or a time to the arrival or the departure."
            : undefined
        }
      />

      {/* The two directions, as one choice *above* the fields rather than
          a pair of panels around them.

          Both were visible before only by accident: the panels were
          siblings, so the open one rendered its fields inside its own
          wrapper and the other direction's header sat a whole screenful
          below them. Filing an arrival and a departure meant scrolling
          past everything to discover the second one existed. A segmented
          pair puts the choice where the eye already is, and the fields
          under it belong to whichever cell is filled — which is the same
          relationship `Segmented` already carries everywhere else: a
          choice among visible options, ink on the chosen one.

          The readout stays, because it was never about the control. It
          is the chosen direction's own answer in the words the board's
          row uses — the day, the clock and where — so a form that has
          not been touched still says what this member has filed, and an
          unfilled direction says so rather than reading as a screen
          nobody has visited. */}
      <View className="gap-2">
        <Segmented
          options={DIRECTIONS.map((panel) => ({
            value: panel.value,
            label: panel.heading,
          }))}
          value={direction}
          onChange={setDirection}
          // Two short labels: filling a 960px column would put a canyon
          // between them, and this is the prop's own example.
          width="content"
        />
        <Text className="font-body text-sm text-ink">
          {legSummary(legs[direction], direction) || NOT_SHARED}
        </Text>
      </View>

      {/* Keyed on the direction **and** the member, so the panel's own
          state is about one leg: whether a lookup is in flight, its
          complaint, whether the far end was opened, and the `Where`
          field's live query are facts about the row you are looking at.
          With only the direction in the key they followed you to the
          other direction and opened its far pair on the strength of the
          last leg's press; across a `Who` change they followed you to
          another person, which is D5's own leak one level down — the
          rows ranked for the member you left would sit under the member
          you picked. */}
      <LegFields
        key={`${memberId}:${direction}`}
        direction={direction}
        leg={legs[direction]}
        onChange={setLeg}
        trip={trip}
        timeZone={timeZone}
        whereEntries={whereEntries}
        errors={submitted ? errors[direction] : undefined}
      />
    </FullscreenDialog>
  );
}

/**
 * One direction's questions, all of them, in the order they are
 * answered: how, then the day, then the number the times can come from,
 * then the two ends — filled in by a lookup or by hand.
 *
 * The order is the form's rather than the record's. The day leads because
 * the lookup needs it, and the number sits directly under the day so
 * nothing scrolls between the two; that adjacency is also the answer to
 * "why will Autofill not press" that the old hidden-field version never
 * gave. The direction's own end comes next, and the leg's other end after
 * it, behind a word — it is optional, and it costs the panel two fields and
 * ~150pt at 390 on every leg that does not use it (D4). The own end is
 * drawn first in every mode and both directions: it is the end the row is
 * about and the only one the validator asks for, so it reads before the end
 * behind the trigger. A hire used to be the exception — its own end was the
 * pickup, so a hire was read pickup-first whichever row it was on — and it
 * stopped being one when a hire's own end became the plan at the trip.
 *
 * Every word and every field here follows the mode: which field exists,
 * what it is called, and what it reads are all `lib/transportMode.ts`'
 * answers, so a hire and a flight are the same form saying different
 * things rather than two forms.
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
  // Whether the far end is open. `null` is "nobody has said yet", and a
  // leg that already holds a far end is its own answer: what a lookup
  // wrote is on screen when the panel opens rather than mentioned by a
  // line above it. A press says more, either way — the line keeps reading
  // the fact once it is shut, which is what makes shutting it safe.
  const [farOpened, setFarOpened] = useState<boolean | null>(null);

  const mode = leg.transportMode;
  const arrival = direction === "arrival";
  // The end this row is about, and the leg's other end. The direction
  // names the side the record files and the side the validator requires
  // (`pertinentTimeRefine`); the far end is the side it does not, in every
  // mode and both directions. Which of the two a hire calls its counter is
  // the table's answer and not this screen's (`lib/transportMode.ts`).
  const farSide: TravelSide = arrival ? "departure" : "arrival";
  const farTime = arrival ? leg.departureTime : leg.arrivalTime;
  // The far end's day, said back under the field that owns it. Null when
  // the leg does not cross midnight, where "the same day" would be noise
  // the chosen day already covers.
  const farNote = farEndNote(leg, direction);
  const farHolds = farTime.trim() !== "" || leg.otherLocation.trim() !== "";
  const farOpen = farOpened ?? farHolds;
  // The far end in one line, for the word that opens it and reads it back:
  // its own word, then its clock and its place, joined the way the board's
  // row and the panel's readout join them. The word comes from the table,
  // so the line and the label under it cannot disagree — a hire reads
  // `Pickup` behind an arrival and `Dropoff` behind a departure, where the
  // journey's own word would be `Departs` or `Arrives`.
  //
  // With nothing to read, the line names the end the pair would fill,
  // and it names it in the mode's own noun: a hire's arrival row is asked
  // to add *the pickup*, under a pair that reads `Arrives at` / `Pickup
  // at`, where the side's word would have said "the departure" over it.
  // See `endNoun`.
  const farLine = farHolds
    ? joinFacts(
        farEndWord(mode, direction),
        isClockTime(farTime.trim()) ? formatClock(farTime.trim()) : "",
        leg.otherLocation.trim(),
      )
    : `Add the ${endNoun(mode, farSide, true)}`;
  // The number the mode keeps, where it keeps one. The gate below asks
  // `hasNumberField` itself — the rule's own name for the decision — and
  // the label is the same table's answer, `numberLabel` being null exactly
  // where it is false, so the field's presence and its words cannot drift
  // apart. The `?? ""` never renders: a mode with no number has no field
  // at all rather than an empty one.
  const number = numberLabel(mode) ?? "";
  const numberHint = numberPlaceholder(mode) ?? "";

  // The lookup flies on the leg's own day: one date, one number, and the
  // time and the where fill themselves in. The flight alone has one
  // (`hasLookup`), which is also the mode whose number `formatFlightNumber`
  // may touch.
  const canLookup =
    !lookingUp &&
    hasLookup(mode) &&
    isFlightNumber(leg.flightNumber) &&
    /^\d{4}-\d{2}-\d{2}$/.test(leg.day);

  /** Cleared by any edit in either end: the complaint was about the last
   *  lookup, not about the leg the member is now fixing. */
  function clearLookupError() {
    setLookupError(null);
  }

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

  // The leg's two ends, each built once and read in the order `leadingPair`
  // answers: the row's own pair — the end its direction names, and the only
  // one the validator asks for — and the far one, behind its own trigger.
  // Which of them leads is not the order they are written in here.
  //
  // This row's own end: the pair the row is *about*. Its two labels are the
  // end's own words, read from the mode's table by the side.
  const ownPair = (
    <EndPair
      mode={mode}
      side={direction}
      leg={leg}
      onChange={onChange}
      trip={trip}
      whereEntries={whereEntries}
      errors={errors}
      onEdit={clearLookupError}
    />
  );

  // The far end, behind its own value. Shut, this is one quiet line that
  // either asks for the end or reads the fact back — the panel header's own
  // idiom one level down, and the reason hiding a filed end loses nothing.
  // Open, it is the same two fields in the mode's other word.
  //
  // Opened when it holds a value or the member opened it: a lookup that
  // fills the takeoff opens the pair rather than leaving it a line, and a
  // press shuts it again with the fact still on screen.
  //
  // No block rule over the pair, though the mockup draws one. The rule's
  // home is `RuledBlock`, and `design-lint.mjs` check 9 counts every such
  // site against a ratchet that sits exactly at its cap (44) — adding one is
  // a deliberate raise of that constant with its own recorded reason, not
  // something this phase can spend. The line above is the boundary either
  // way: a word on its own, then the pair it names.
  const farPair = (
    <View className="gap-4">
      <QuietAction label={farLine} onPress={() => setFarOpened(!farOpen)} />
      {farOpen ? (
        <EndPair
          mode={mode}
          side={farSide}
          leg={leg}
          onChange={onChange}
          trip={trip}
          whereEntries={whereEntries}
          errors={errors}
          onEdit={clearLookupError}
          far
          note={farNote}
        />
      ) : null}
    </View>
  );

  return (
    <View className="gap-4">
      {/* How: the six ways, as chips, under the direction they belong to.
          Every word here is a choice among visible options rather than a
          gate — the same six labels are the whole menu — so the group
          says it with `role="radiogroup"` and each chip with
          `role="radio"`, which is what `Segmented` draws for the same
          kind of choice and what the report panel draws when the labels
          wrap. Chips rather than a six-cell `Segmented`: its row does not
          wrap, and six cells at 390 are 390px of content before borders.

          `flight` is preselected because `emptyLeg` starts there and the
          column defaults there, which is the same answer the API gives to
          a leg nobody has set. */}
      <View
        className="flex-row flex-wrap gap-2"
        role="radiogroup"
        aria-label="How"
      >
        {TRANSPORT_MODES.map((value) => (
          <ChipToggle
            key={value}
            role="radio"
            label={modeLabel(value)}
            selected={mode === value}
            onPress={() => onChange(switchLegMode(leg, value))}
          />
        ))}
      </View>

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

      {/* The number, where the mode keeps one: flight, train and bus. The
          label, the placeholder and the Autofill all follow the mode, and
          a mode with no number has no field at all rather than an empty
          one — a driver's form has nothing to put in it. */}
      {hasNumberField(mode) ? (
        <View className="gap-1">
          <TextField
            label={number}
            value={leg.flightNumber}
            onChangeText={(flightNumber) => {
              setLookupError(null);
              // Formatted as it is typed only where the mode has a lookup:
              // a flight's number is written the way a flight's is — the
              // code, a space, the number — because that is the shape the
              // placeholder promises and the form the lookup reads. A
              // coach's service number is the member's own words, and
              // `formatFlightNumber("FlixBus 42")` is `FLI XBUS42`.
              onChange({
                ...leg,
                flightNumber: hasLookup(mode)
                  ? formatFlightNumber(flightNumber)
                  : flightNumber,
              });
            }}
            placeholder={numberHint}
            maxLength={NUMBER_MAX_LENGTH}
            suffix={
              // The lookup is the flight's, and only the flight's: the
              // times it answers with are a flight's times, and the
              // endpoint is asked about a flight number.
              hasLookup(mode) ? (
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
              ) : undefined
            }
          />
          {lookupError ? (
            <Text className="font-body text-sm text-ink">{lookupError}</Text>
          ) : null}
        </View>
      ) : null}

      {/* The leg's two ends, the own end first: it is the end the row is
          about and the only one the validator asks for (D4), so it reads
          before the optional pair behind the trigger — the mockup's
          `Lands at` above `Leaves from`. The own pair is the first one in
          every mode and both directions; a hire's departure row used to
          be the exception, and is not one any more. */}
      {ownPair}
      {farPair}

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

/**
 * One end of a leg: where you are at it, and when.
 *
 * Both labels come from the mode's own word for this **side** and this
 * half of the row (`lib/transportMode.ts`): `Lands at` and `Lands` for a
 * flight's arrival, `Arrives at` and `Arrives` for a bus's, and for a hire
 * `Arrives at`/`Arrives` at its own end — the plan at the trip — with
 * `Pickup at` and `Dropoff at` on its far one. `far` is what tells the two
 * halves apart, and it is all this component knows about which pair it is
 * drawing: the words, and which of them is the counter, are the table's
 * answer, which is what lets the pair the row is about and the pair behind
 * the trigger render from one component without the screen holding a
 * second table of words.
 *
 * Side by side from md up and stacked below it, the way the event form
 * puts Starts and Ends: two facts about one end are read together, and on
 * a phone each of them still takes the whole column.
 *
 * The words are the person's, not the transport's — `Takeoff`/`Landing`
 * was considered and rejected, because `Leaves 7:00 AM` and `Lands
 * 8:40 PM` read as a sentence about somebody, which is whose travel this
 * is. That argument is why `endLabel` holds what it holds, and
 * `lib/transportMode.ts` is the only place any of these words is written.
 *
 * `far` is the whole of the difference between the two renderings. The
 * leg's other end is the optional one — the direction's own end is what
 * the validator requires, in every mode — so it is the only field here
 * that offers a none row; and nothing checks its where, because
 * `validateLeg` asks for the row's own one.
 */
function EndPair({
  mode,
  side,
  leg,
  onChange,
  trip,
  whereEntries,
  errors,
  onEdit,
  far = false,
  note,
}: {
  mode: TransportMode;
  side: TravelSide;
  leg: TravelLeg;
  onChange: (leg: TravelLeg) => void;
  /** The trip the leg belongs to; the `Where` field's bias and floor. */
  trip: Trip;
  whereEntries: PickerEntry[];
  errors: LegErrors | undefined;
  /** The lookup's complaint, cleared the moment a field here is edited. */
  onEdit: () => void;
  /** Whether this is the leg's other end. */
  far?: boolean;
  /** What this end's day is, when the leg crosses midnight. */
  note?: string | null;
}) {
  const arrival = side === "arrival";
  const time = arrival ? leg.arrivalTime : leg.departureTime;
  const place = far ? leg.otherLocation : leg.location;

  return (
    <View className="gap-4 md:flex-row">
      <View className="gap-1 md:flex-1">
        <TravelWhereField
          label={whereLabel(mode, side, far)}
          trip={trip}
          whereEntries={whereEntries}
          value={place || null}
          onChange={(value) => {
            onEdit();
            onChange(
              far
                ? { ...leg, otherLocation: value }
                : { ...leg, location: value },
            );
          }}
          placeholder={WHERE_PLACEHOLDER}
          error={far ? undefined : errors?.location}
        />
      </View>
      <View className="gap-1 md:flex-1">
        <TimeField
          label={endLabel(mode, side, far)}
          value={time || null}
          onChange={(value) =>
            onChange(
              arrival
                ? { ...leg, arrivalTime: value ?? "" }
                : { ...leg, departureTime: value ?? "" },
            )
          }
          error={errors?.[arrival ? "arrivalTime" : "departureTime"]}
          // The far end is the optional half, in every mode: a member
          // often does not know when they left, and the direction's own
          // end is the question this row exists to answer.
          optional={far}
          noneLabel={`No ${endNoun(mode, side, far)} time`}
        />
        {/* The far end's day, said back under the field that owns it. A
            readout, not a control: what the two times already mean, so it
            cannot disagree with them. */}
        {note ? (
          <Text className="font-body text-sm text-ink opacity-60">{note}</Text>
        ) : null}
      </View>
    </View>
  );
}
