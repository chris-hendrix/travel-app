/* global __DEV__ */
import { useState, type ReactNode } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Link, Redirect } from "expo-router";
import { AppHeader } from "@/components/ui/AppHeader";
import { ActionBar } from "@/components/ui/ActionBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TextField } from "@/components/ui/TextField";
import { ChipToggle } from "@/components/ui/ChipToggle";import { RsvpControl } from "@/components/trip/RsvpControl";
import { Segmented } from "@/components/ui/Segmented";
import { Dropdown } from "@/components/ui/Dropdown";
import { Accordion, AccordionItem } from "@/components/ui/Accordion";
import { Checkbox, CheckboxLabel } from "@/components/ui/Checkbox";
import { ActionRow } from "@/components/ui/ActionRow";
import { QuietAction } from "@/components/ui/QuietAction";
import { PhoneField } from "@/components/ui/PhoneField";
import { toE164 } from "@/lib/phone";
import { Screen } from "@/components/ui/Screen";
// Aliased: this file's own `Section` is the lab's documentation frame, and
// the product's is the ruled block the frame documents.
import { Section as RuledSection } from "@/components/ui/Section";
import { FieldError } from "@/components/ui/FieldError";
import { InlineAction } from "@/components/ui/InlineAction";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimeField } from "@/components/ui/TimeField";
import type { Selection } from "@/lib/calendar";
import { RSVP_LABEL, type RsvpStatus } from "@/lib/rsvp";
import { formatDateRange } from "@/lib/dateRange";
import { TripCard } from "@/components/trip/TripCard";
import { TripActions } from "@/components/trip/TripActions";
import { RunLocked } from "@/components/trip/RunLocked";
import { InviteCard } from "@/components/trip/InviteCard";
import { EventCard } from "@/components/trip/EventCard";
import { Grid } from "@/components/ui/Grid";
import { PhotoCard } from "@/components/ui/PhotoCard";
import { NotificationRow } from "@/components/notification/NotificationRow";
import { TRIPS } from "@/mocks/trips";
import { eventsFor } from "@/mocks/events";
import { staysFor } from "@/mocks/stays";
import { NOTIFICATIONS } from "@/mocks/notifications";
import { INVITATIONS } from "@/mocks/invitations";
import { tripFor } from "@/lib/notifications";
import { emailSchema } from "@journiful/shared/schemas";
import { legalDocument } from "@journiful/shared/legal";
import type { LegalDocument } from "@journiful/shared/legal";
import { Prose } from "@/components/ui/Prose";

/** Metro resolving a bare package import and a font actually being the
 *  font are the two things a bundle can fail at silently, and neither
 *  shows up in a test: this is the proof a person can see. */
const SHARED_IMPORT = emailSchema.safeParse("test@example.com").success
  ? "resolved"
  : "failed";

const PRIVACY = legalDocument("privacy");

/**
 * The real document, cut to its opening: preamble, first heading, the
 * list under it. The specimen is here to show the component, not to make
 * anyone scroll a policy inside a page about components — the whole
 * document is one link away, and the copy is never invented for a demo.
 */
/**
 * The sample trip's first event and first stay, for the links below.
 *
 * Derived rather than written down. The mocks lay their dates out
 * relative to today, so an id like `picos-2026-09-19-2` is right on the
 * day it is written and wrong the next one, and a lab link that lands on
 * "that event is not on this trip any more" teaches nobody anything.
 */
const SAMPLE_TRIP = TRIPS[0]!;
const SAMPLE_EVENT = eventsFor(SAMPLE_TRIP)[0]!;
const SAMPLE_STAY = staysFor(SAMPLE_TRIP)[0]!;

const PROSE_SAMPLE: LegalDocument = {
  ...PRIVACY,
  body: (() => {
    const sections = PRIVACY.body.split(/^\s*## /m);
    return `${sections[0] ?? ""}\n## ${sections[1] ?? ""}`;
  })(),
};

const COLORS: Array<[name: string, token: string, hex: string, swatch: string]> = [
  ["Chrome", "ink", "#000000", "bg-ink"],
  ["Background", "sand", "#f5eacc", "bg-sand"],
  ["Muted", "gravel", "#e2ded5", "bg-gravel"],
  ["Surface", "paper", "#ffffff", "bg-paper"],
  ["Primary", "seafoam", "#42d177", "bg-seafoam"],
  ["Secondary", "watermelon", "#ef8ad4", "bg-watermelon"],
  ["Accent", "strawberry", "#ff6352", "bg-strawberry"],
  ["Alert", "strawberry-deep", "#b8271a", "bg-strawberry-deep"],
  ["Info", "ocean", "#4281ff", "bg-ocean"],
  ["Highlight", "acid", "#cbfb6a", "bg-acid"],
];

const TYPE: Array<
  [role: string, family: string, token: string, use: string, face: string]
> = [
  ["Display", "Handjet ExtraBold", "font-display", "Headlines. Short strings only.", "font-display"],
  ["Wordmark", "Bungee Shade", "font-wordmark", "Journiful. Nowhere else.", "font-wordmark"],
  ["Body", "Space Mono", "font-body", "Default text, dates, labels.", "font-body"],
  ["Strong", "Space Mono Bold", "font-body-bold", "Emphasis, buttons, badges.", "font-body-bold"],
  ["Aside", "Space Mono Italic", "font-body-italic", "Quotes, secondary info.", "font-body-italic"],
];

const VENUES = ["The Hall", "Zone One", "The Rooftop", "The Loft", "Full Venue"];




function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="font-body-bold text-sm uppercase tracking-widest text-ink">
        {title}
      </Text>
      {children}
    </View>
  );
}

function TokenRow({
  name,
  token,
  detail,
  right,
}: {
  name: string;
  token: string;
  detail: string;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3 border-b border-gravel py-2">
      {right}
      <View className="flex-1 gap-0">
        <Text className="font-body-bold text-base text-ink">{name}</Text>
        <Text className="font-body text-sm text-ink">{detail}</Text>
      </View>
      <Text className="font-body text-sm text-ink">{token}</Text>
    </View>
  );
}

function TypeRow({
  role,
  family,
  token,
  use,
  face,
}: {
  role: string;
  family: string;
  token: string;
  use: string;
  face: string;
}) {
  return (
    <View className="flex-row items-center gap-3 border-b border-gravel py-3">
      <Text className={`${face} w-28 text-2xl text-ink`}>Ag</Text>
      <View className="flex-1">
        <Text className="font-body-bold text-base text-ink">{role}</Text>
        <Text className="font-body text-sm text-ink">{family}</Text>
        <Text className="font-body text-sm text-ink">{use}</Text>
      </View>
      <Text className="font-body text-sm text-ink">{token}</Text>
    </View>
  );
}

/** Exhibit frame: the live component, its contract, and its variants. */
function Specimen({
  name,
  contract,
  note,
  children,
}: {
  name: string;
  contract: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <View className="border border-ink bg-paper">
      <View className="gap-0 border-b border-ink p-4">
        <Text className="font-body-bold text-base text-ink">{name}</Text>
        <Text className="font-body text-sm text-ink">{contract}</Text>
        <Text className="font-body text-sm text-ink">{note}</Text>
      </View>
      <View className="gap-3 p-4">{children}</View>
    </View>
  );
}

/**
 * The lab, which exists only in development. In a release build or in the
 * exported web app it answers with the same nothing a mistyped address
 * gets, which is why this is a wrapper rather than a check inside the
 * screen: the screen's hooks must run unconditionally, and the guard
 * needs nothing else. `__DEV__` is compile-time on both targets, so
 * there is no runtime config to forget and no conditional in the layout.
 */
export default function DesignSystem() {
  if (!__DEV__) return <Redirect href="/+not-found" />;
  return <DesignSystemScreen />;
}

function DesignSystemScreen() {
  const [formName, setFormName] = useState("");
  const [venue, setVenue] = useState<string | null>(null);
  const [rsvp, setRsvp] = useState<RsvpStatus | null>(null);
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [pastEvents, setPastEvents] = useState(false);
  const [range, setRange] = useState<Selection>({
    start: null,
    end: null,
  });
  const [singleDay, setSingleDay] = useState<Selection>({
    start: null,
    end: null,
  });
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [log, setLog] = useState("No interaction yet.");
  const [consent, setConsent] = useState(false);
  const [labPhone, setLabPhone] = useState("");
  const { width } = useWindowDimensions();

  return (
    <Screen>
      <View className="gap-8">
        <View className="gap-1">
          <Text className="font-display text-4xl leading-tight text-ink">
            Design System
          </Text>
          <Text className="font-body text-base text-ink">
            v1 — tokens, primitives, and patterns. Everything below is the
            real component, rendered live.
          </Text>
        </View>

        <Section title="Color">
          <View>
            {COLORS.map(([name, token, hex, swatch]) => (
              <TokenRow
                key={token}
                name={name}
                token={token}
                detail={hex}
                right={<View className={`h-8 w-8 ${swatch}`} />}
              />
            ))}
          </View>
        </Section>

        <Section title="Type">
          <View>
            {TYPE.map(([role, family, token, use, face]) => (
              <TypeRow
                key={token}
                role={role}
                family={family}
                token={token}
                use={use}
                face={face}
              />
            ))}
          </View>
          <Text className="font-body text-sm text-ink">
            All three families are open licensed (SIL OFL) through Google
            Fonts.
          </Text>
        </Section>


        <Section title="Primitives">
          <View className="gap-4">
            <Specimen
              name="AppHeader"
              contract="title? · onClose? · action? · variant?"
              note="Title mode, shown here. Wordmark mode is the same component with no title, rendered globally above this page. Landing mode is the wordmark alone — no bell, no avatar, no clock, because nobody has signed in yet — and the wordmark stops being a link, because on the landing you are already where it points. The clock beside the title is the ZoneToken, and it is the one control in the band that is sometimes not a control: underlined and pressable while the two clocks read differently, a plain readout the moment they agree, because its only effect is to change the reading and a tap that changes nothing is worse than no tap. It registers itself with the surface that shows the times (lib/displayZone.tsx), which stacks registrations, so covering a screen and coming back restores its zone rather than losing it."
            >
              <AppHeader
                title="Notification settings"
                onClose={() => setLog("AppHeader onClose fired")}
              />
            </Specimen>

            <Specimen
              name="FullscreenDialog"
              contract="title · primaryTitle? · onPrimary? · dangerTitle? · onDanger? · children"
              note="Composes AppHeader and ActionBar into a route. Omit primaryTitle on a read-only dialog — a bar with nothing worth pressing is chrome for its own sake. The destructive action belongs to the scaffold rather than to the form, because its position is the point: the foot of the body, under a rule, as far from the primary button as the dialog allows. It fills the screen by definition, so it cannot be previewed in a frame: open one."
            >
              <Link
                href="/notifications"
                className="font-body-bold text-base text-ink underline"
              >
                Open the notifications dialog
              </Link>
            </Specimen>

            <Specimen
              name="DatePicker"
              contract="selection · onChange · single? · min? · max?"
              note="Range by default: two taps make a trip, endpoints invert to ink, the days between fill seafoam. single picks one day, which is what an event needs and what a leg of travel needs. min/max bound the days that make sense — a trip's own dates for an event inside it, a day past the end for the flight home, since a stay is booked through its last night. Days outside them go gravel and stop responding. Never a nested dialog. The line a caller draws under it is a readout of what is chosen, never an instruction to choose: the calendar already inverts the days that are picked, so `Tap the first day, then the last.` under it was the control repeating itself — and, set in the same black as the error that appears when you submit without one, the reason an empty form read as though it had said nothing at all."
            >
              <DatePicker selection={range} onChange={setRange} />
              {range.start ? (
                <Text className="font-body text-sm text-ink">
                  {formatDateRange(range.start, range.end ?? range.start)}
                </Text>
              ) : null}
              <DatePicker
                selection={singleDay}
                onChange={setSingleDay}
                single
                min={TRIPS[0]!.startDate}
                max={TRIPS[0]!.endDate}
              />
              {singleDay.start ? (
                <Text className="font-body text-sm text-ink">
                  {`Single: ${singleDay.start}`}
                </Text>
              ) : null}
            </Specimen>

            <Specimen
              name="TimeField"
              contract="label · value · onChange · optional? · noneLabel? · error?"
              note="One row shut — the time and a disclosure — opening the column of slots it has always been, already scrolled to where you are, and closing on the choice. A form with two times is two rows instead of two columns of ninety-six slots. Fifteen-minute steps across the whole day, because a red-eye is as much an event as a dinner. optional puts a No end row at the top, so an event that simply starts is a choice rather than an empty field. Rows read twelve-hour, exactly as the itinerary prints them. The label names the zone the slots are read in, because a field whose meaning depends on a setting says which setting is on."
            >
              <View className="gap-4 md:flex-row">
                <View className="md:flex-1">
                  <TimeField
                    label="Starts"
                    value={startsAt}
                    onChange={setStartsAt}
                  />
                </View>
                <View className="md:flex-1">
                  <TimeField
                    label="Ends"
                    value={endsAt}
                    onChange={setEndsAt}
                    optional
                  />
                </View>
              </View>
            </Specimen>

            <Specimen
              name="Screen"
              contract="children · lead?"
              note="The ground for every screen. Navigation containers paint their own background, so a screen must paint its own sand or it renders grey. `lead` is for the screens that open on a display heading rather than on content, the landing, the way in and the invitation: they want air above the first line that a list of rows does not."
            >
              <Screen>
                <Text className="font-body text-base text-ink">
                  Screen content sits on the sand ground.
                </Text>
              </Screen>
            </Specimen>

            <Specimen
              name="Section"
              contract="title · children?"
              note="A titled block, ruled off from the one above it. The rule sits on top of the block rather than under it, so a stack of them shares its rules instead of doubling them at every boundary. It replaced four local copies that had already drifted apart on gap and heading size. The landing's sections are deliberately not this: they are tables of rows closed by a rule underneath, at the hero's own scale."
            >
              <RuledSection title="What goes in the trip">
                <Text className="font-body text-base text-ink">
                  Ruled off from whatever sits above it.
                </Text>
              </RuledSection>
            </Specimen>

            <Specimen
              name="FieldError"
              contract="message?"
              note="What a field says about what it is missing: under its field, where the field's own helper line sits, and the one line down there that is not ink. That is the whole component. A complaint set in the same black, at the same size, in the same face as the helper sentence above it does not read as a complaint — it reads as a second sentence of the help, which is how a form came to look like it had said nothing. The colour is `strawberry-deep` rather than `strawberry`: the alert at the weight text can be read in. On the dialog's own ground the accent measures 2.19:1, under half of what 14px needs, and this is 4.7:1 in the same hue. Nothing else marks an error, no icon and no border on the field, because a field is wrong in one place and this is it. It also registers itself with the dialog, which scrolls to the first one to appear: the primary button is pinned to the foot and the fields are in the body above it, so a form submitted from a scrolled position put two of its three errors above the viewport with nothing moving to them. No message means no line and no registration, so a caller hands it a validator's `string | undefined` straight through. A field's own complaint, not a request's: a save that failed is a sentence about the request and stays ink, in InlineError below."
            >
              <View className="gap-1">
                <Text className="font-body text-sm text-ink">
                  A field's own helper line, still ink.
                </Text>
                <FieldError message="And its complaint under it, in the alert." />
              </View>
              {/* No message, no line — and no registration either. */}
              <FieldError message={undefined} />
            </Specimen>

            <Specimen
              name="InlineError"
              contract="message · retryTitle? · onRetry?"
              note="A request that failed, where its content would have been. The message is the caller's sentence about what is missing, not the error's: what the fetch threw is for the console. With a way to ask again, because a failure with nowhere to go is a dead end."
            >
              <InlineError
                message="The itinerary could not be loaded."
                onRetry={() => setLog("InlineError asked again")}
              />
            </Specimen>

            <Specimen
              name="LoadingBlock"
              contract="label"
              note="A screen that is getting there says so where its content will be. A plain line, not a spinner and not a skeleton: there is no motion language here, and a skeleton promises a shape the request has not returned yet. The label is what is arriving, in the product's own voice — the person's verb and the actual thing. Never a bare Loading on its own (a screen that will not say what is late), and never a category noun: Trip details reads as a broken heading while it loads, where Getting your trip reads as waiting."
            >
              <LoadingBlock label="Getting the run." />
            </Specimen>

            <Specimen
              name="OfflineBlock"
              contract="message? · retryTitle? · onRetry?"
              note="No connection, where the connection's content would have been. Not a banner at the top of the screen, which would be a second header: it sits inside the block that asked, like the error does."
            >
              <OfflineBlock onRetry={() => setLog("OfflineBlock asked again")} />
            </Specimen>

            <Specimen
              name="ActionBar"
              contract="primaryTitle · onPrimary"
              note="One primary action, no Back: dismissal is the header close control and the platform gesture. Fills the width on a phone, hugs right on wide."
            >
              <ActionBar
                primaryTitle="Save changes"
                onPrimary={() => setLog("ActionBar onPrimary fired")}
              />
            </Specimen>

            <Specimen
              name="Button"
              contract="title · variant? · onPress? · fullWidth? · align? · size? · disabled?"
              note="Fills the width on a phone; from md up it hugs the edge it is aligned to. disabled keeps it in place rather than hiding it: a control that vanishes leaves nothing to aim at. Inside a row, align='end' is what lines a button up with the field beside it — the default hugs the start of the cross axis and sits high. size='sm' is a cell of a row of equal cells, where three of them have to fit across a phone: the sides and the label step down, the height does not."
            >
              <Button
                title="Create trip"
                variant="primary"
                onPress={() => setLog("Button primary fired")}
              />
              <Button
                title="Skip for now"
                variant="secondary"
                onPress={() => setLog("Button secondary fired")}
              />
              <Button
                title="Add to club night"
                variant="accent"
                onPress={() => setLog("Button accent fired")}
              />
              <Button
                title="Autofill"
                variant="secondary"
                disabled
                onPress={() => setLog("unreachable")}
              />
            </Specimen>

            <Specimen
              name="Badge"
              contract="label · variant · size?"
              note="Event type and status. Venue renders as plain text beside the pills. Category is the neutral one, for classifying a thing rather than reporting its state — it shares ink with soldOut on purpose: roles differ, tones may not. Two sizes: md in the content, where a chip is read, and sm hanging off a name in a list, where it is glanced at."
            >
              <View className="flex-row flex-wrap items-center gap-2">
                <Badge label="club" variant="club" />
                <Badge label="live" variant="live" />
                <Badge label="sold out" variant="soldOut" />
                <Badge label="Food" variant="category" />
                <Badge label="The Rooftop" variant="venue" />
              </View>
              <View className="flex-row flex-wrap items-center gap-2">
                <Badge label="Venmo" variant="category" size="sm" />
                <Badge label="Insta" variant="category" size="sm" />
                <Badge label="Outdoors" variant="category" size="sm" />
              </View>
            </Specimen>

            <Specimen
              name="PhotoCard"
              contract="image · overlay? · meta · title · footnote? · onPress?"
              note="The floating tile every card is built from: a 2:1 photo with an optional overlay, then a bold line, a display title, and a bold line. No fill, no border, no shadow, and no reserved height — which is why a card can drop its last line without the grid going wonky."
            >
              <Grid>
                <PhotoCard
                  image={TRIPS[0]!.image}
                  meta="Sep 24 – Oct 1, 2026"
                  title={TRIPS[0]!.title}
                  footnote={TRIPS[0]!.location}
                  onPress={() => setLog("PhotoCard fired")}
                />
                <PhotoCard
                  image={eventsFor(TRIPS[0]!)[0]!.image}
                  meta="8:30 AM – 9:45 AM"
                  title={eventsFor(TRIPS[0]!)[0]!.name}
                  footnote={eventsFor(TRIPS[0]!)[0]!.place}
                />
              </Grid>
            </Specimen>

            <Specimen
              name="ChipToggle"
              contract="label · selected? · onPress"
              note="A filter you can press: a box, filled ink when on and outlined when off. For switches you turn on and off (past events), never for a choice among options — that is `Segmented`, whose cells are joined and which holds one value out of a few. A row holding a filter and a choice puts them at the two edges rather than shoulder to shoulder, so they never read as one set. The run's head is the only place the two meet, and the filter is offered only while a trip is under way — before it starts there is nothing behind you, and after it ends the whole run is, so a finished run is always whole and the chip is not there to hide it."
            >
              <View className="flex-row items-center gap-3">
                <ChipToggle
                  label="Past events"
                  selected={pastEvents}
                  onPress={() => {
                    setPastEvents(!pastEvents);
                    setLog(`ChipToggle "Past events" ${!pastEvents ? "on" : "off"}`);
                  }}
                />
                <ChipToggle
                  label="Nearby"
                  onPress={() => setLog("ChipToggle \"Nearby\" pressed")}
                />
              </View>
            </Specimen>

            <Specimen
              name="Segmented"
              contract="options (value · label · tone? · mark?) · value (nullable) · onChange · size?"
              note="One choice out of a few, all of them visible. Bordered cells in a row rather than bare words: a word with no box and no underline is a label, not something a thumb can be asked to press, and every control in this system is a box. The cells are button-sized — the same p-4 and text-sm as a button, so a row of these sits in a stack of buttons without a step — and ink rather than a colour, because choosing a direction is not an action: the calendar and the time column already invert what is chosen, and two coloured toggles left the form's one real button looking like one of them. tone is for answers that carry a meaning of their own, which the RSVP has; mark is a short mark after the label, drawn in the label's own colour, for a choice with something to say about itself (travel puts a tick against a direction already filed). value is nullable because having chosen nothing yet is a real state rather than an error — and an always-set value wears the same cells (the profile's temperature, the run's list or grid), because a control that looks different depending on whether a value has been chosen yet would be two controls for one idea."
            >
              <RsvpControl
                value={rsvp ?? "no_response"}
                onChange={(status) => {
                  setRsvp(status);
                  setLog(`RSVP "${RSVP_LABEL[status]}"`);
                }}
              />
              {/* size="sm": a chrome row's switch, the same box as a chip. */}
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Segmented
                    size="sm"
                    options={[
                      { value: "list", label: "List" },
                      { value: "grid", label: "Grid" },
                    ]}
                    value={layout}
                    onChange={(next) => {
                      setLayout(next);
                      setLog(`Segmented "${next}"`);
                    }}
                  />
                </View>
                <ChipToggle
                  label="Past events"
                  selected={pastEvents}
                  onPress={() => {
                    setPastEvents(!pastEvents);
                    setLog(`ChipToggle "Past events" ${!pastEvents ? "on" : "off"}`);
                  }}
                />
              </View>
            </Specimen>

            <Specimen
              name="TextField"
              contract="label · value · onChangeText · placeholder? · error? · multiline? · numberOfLines? · suffix? · keyboardType? · centered? · autoFocus? · maxLength? · autoComplete? · textContentType?"
              note="Every dialog that collects input uses this. Errors sit under the field, never in a toast, and they are FieldError's — the alert, not ink. suffix draws a control that acts on the field inside the field's own box — the Autofill button on a flight number is one — because two separately padded controls only line up until a font metric moves; stretching them inside one box cannot drift. centered is the one-short-value shape: six digits of a code, centred and tracked, which is not a size but a shape. autoComplete and textContentType are the platform's own fill, a phone number or a code that just arrived by text, and they are worth more than any styling here because typing six digits correctly is the one thing a thumb is bad at. autoFocus is for the one field the reader came to fill in."
            >
              <TextField
                label="Display name"
                value={formName}
                onChangeText={setFormName}
                placeholder="Ada Lovelace"
              />
              <TextField
                label="Phone"
                value="+1 555"
                onChangeText={() => setLog("TextField onChangeText fired")}
                error="Enter the full 10-digit number."
              />
              <TextField
                label="Flight number"
                value={formName}
                onChangeText={setFormName}
                placeholder="UA 1842"
                suffix={
                  <Pressable
                    className="justify-center border-l border-ink px-4"
                    onPress={() => setLog("suffix pressed")}
                  >
                    <Text className="font-body-bold text-sm text-ink">
                      Autofill
                    </Text>
                  </Pressable>
                }
              />
            </Specimen>

            <Specimen
              name="PhoneField"
              contract="value · onChangeText · error? · autoFocus?"
              note="A number, parsed properly: the metadata is every country, so a leading + overrides the home country and the app takes the same numbers the web does. Type anything here and watch the E.164 underneath. One field for the whole app now: the invite dialog and the sign-in screen both use it, which they did not before, and a number that can sign up can therefore also be invited."
            >
              <PhoneField value={labPhone} onChangeText={setLabPhone} />
              <Text className="font-body text-sm text-ink">
                {toE164(labPhone) ?? "Not a number yet"}
              </Text>
            </Specimen>

            <Specimen
              name="Checkbox"
              contract="checked · onToggle · disabled? · children"
              note="Consent, which is not a filter: ChipToggle says show me these ones, this says I have read this. The whole row is the target rather than the box, since a twenty-pixel square is not something a thumb can be asked to hit, and the tick is drawn rather than implied by the fill, because an inked square on its own reads as a badge. It gates the sign-in button: a control rather than a sentence, because the carriers ask for one, and Twilio rejects a campaign whose form has no separate consent control (30925)."
            >
              <Checkbox
                checked={consent}
                onToggle={() => {
                  setConsent(!consent);
                  setLog(`Consent ${!consent ? "given" : "withdrawn"}`);
                }}
              >
                <CheckboxLabel>
                  I agree to receive text messages from Journiful, including
                  trip updates and verification codes. Message and data rates
                  may apply. Reply STOP to opt out.
                </CheckboxLabel>
              </Checkbox>
            </Specimen>

            <Specimen
              name="ActionRow"
              contract="children"
              note="The foot of a form: its one button, and the quiet words that go with it. Stacked on a phone, one row from md up. The button comes first, which is the opposite of the desktop habit of putting the secondary action on the left, because a content button hugs the start edge to line up with the fields above it and anything sharing its row has to come after it. Not ActionBar, which is a dialog's pinned bar and holds one action only."
            >
              <ActionRow>
                <Button
                  title="Save changes"
                  onPress={() => setLog("ActionRow button fired")}
                />
                <QuietAction
                  label="Back"
                  align="center"
                  onPress={() => setLog("ActionRow quiet action fired")}
                />
              </ActionRow>
            </Specimen>

            <Specimen
              name="Dropdown"
              contract="label · options · value · onChange · placeholder? · freeText? · error?"
              note="Single-select with autocomplete. The list expands inline — never a nested dialog. Stands in for Google Places. An option is a string when its value reads well and a value-and-label pair when it does not, so a day can say Today · Fri Sep 19 while committing an ISO date. With freeText, typing is itself an answer: a suggestion machine rather than a menu, which is how a place gets entered when Places has never heard of it."
            >
              <Dropdown
                label="Venue"
                options={VENUES}
                value={venue}
                onChange={(v) => {
                  setVenue(v);
                  setLog(`Dropdown committed "${v}"`);
                }}
                placeholder="Type to filter venues…"
              />
            </Specimen>

            <Specimen
              name="Accordion"
              contract="title · defaultOpen? · children"
              note="Disclosure for detail that would otherwise be a nested screen. Rules only — no card, no fill."
            >
              <Accordion>
                <AccordionItem title="Event description" defaultOpen>
                  <Text className="font-body text-base text-ink">
                    21+. Doors at 8, last entry 11.
                  </Text>
                </AccordionItem>
                <AccordionItem title="Who's coming">
                  <Text className="font-body text-base text-ink">
                    Dana, Rahul, and 2 unconfirmed.
                  </Text>
                </AccordionItem>
                <AccordionItem title="Getting there">
                  <Text className="font-body text-base text-ink">
                    12 min walk from the apartment.
                  </Text>
                </AccordionItem>
              </Accordion>
            </Specimen>

            <View className="border border-ink bg-paper p-4">
              <Text className="font-body-bold text-base text-ink">Events</Text>
              <Text className="font-body text-sm text-ink">{log}</Text>
            </View>

            <Specimen
              name="InlineAction"
              contract="label · onPress"
              note="One action as a word inside a sentence: pressed, not followed. Inline by necessity — an empty state says what is missing in a sentence, and the way out of that state belongs in the same sentence; lifted into a row of controls it becomes the toolbar the sentence replaced, and a row of underlined words is a toolbar. Bold and underlined, `QuietAction`'s two marks, because both are words the system asks a thumb to press and neither has a box to say so; no colour, because a colour in this palette is a role and a word mid-sentence is doing neither job. The target is the line it sits in rather than a 44pt box — inside a 16pt paragraph padding would push the line apart — which is a deliberate deviation from the target-size rule, and the reason labels want to stay to two words. `Prose`'s links are this component; the weight had drifted between the two callers and nothing had said they should."
            >
              <Text className="font-body text-base text-ink">
                Nothing planned yet. Add{" "}
                <InlineAction
                  label="a stay"
                  onPress={() => setLog("InlineAction a stay pressed")}
                />{" "}
                or{" "}
                <InlineAction
                  label="an event"
                  onPress={() => setLog("InlineAction an event pressed")}
                />{" "}
                to get started.
              </Text>
            </Specimen>

            <Specimen
              name="Prose"
              contract="document: LegalDocument · onLink?"
              note="Long-form copy. The documents are stored as Markdown — the thing a person reads, edits and proofs against the published page — and this is the only component in the system that turns it into type. Headings take the display face, because a heading is a short string; the body takes the body face at a size that survives a screenful of it; links are `InlineAction`, so they carry the same two marks as every other pressable word with no box to say so, and stay in ink because colour here is a role. The excerpt below is the real Privacy Policy, cut to its opening."
            >
              <Prose
                document={PROSE_SAMPLE}
                onLink={(href) => setLog(`Prose link "${href}" pressed`)}
              />
              <Link
                href="/privacy"
                className="font-body-bold text-base text-ink underline"
              >
                Open the Privacy Policy
              </Link>
            </Specimen>
          </View>
        </Section>

        <Section title="Patterns">
          <Text className="font-body text-base text-ink">
            Product-level compositions built from primitives. One folder per
            domain.
          </Text>
          <View className="gap-4">
            <Specimen
              name="TripCard"
              contract="trip: { title, startDate, endDate, location, image } · onPress? · today?"
              note="Upcoming trips carry a countdown on the photo; finished trips say nothing. Locations hug the title. Hover the first card on a wide screen: photo and text both zoom."
            >
              <Grid>
                {TRIPS.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    onPress={() => setLog(`TripCard "${trip.title}" fired`)}
                  />
                ))}
              </Grid>
            </Specimen>

            <Specimen
              name="TripActions"
              contract="tripId · organizer · owesTravel · memberId? · ask?"
              note="The trip page's verbs in one block, in two tiers: the ask and the adds. One loud control and only one — the organizer is asked to bring people in, everyone else answers their own RSVP, which is why ask arrives as a node. The adds put Add travel first and on a line of its own, because it is the one that is a question rather than a standing verb (it is there while somebody still owes a time, and the screen decides whose), with Add event and Add stay as a pair of halves under it. The trip's maintenance — Edit trip, Trip settings — is not here: it sits at the foot of the trip's own column on the page, under the description it edits, with the rule that opens the run under it. First the organizer's block, then a traveler's."
            >
              <TripActions
                tripId={SAMPLE_TRIP.id}
                organizer
                travelOwed
                memberId="member-1"
              />
              <TripActions
                tripId={SAMPLE_TRIP.id}
                organizer={false}
                travelOwed
                ask={
                  <RsvpControl
                    value={rsvp ?? "no_response"}
                    onChange={(status) => {
                      setRsvp(status);
                      setLog(`RSVP "${RSVP_LABEL[status]}"`);
                    }}
                  />
                }
              />
            </Specimen>

            <Specimen
              name="RunLocked"
              contract="(no props)"
              note="The run, for a member the server will not read it to: full trip data needs a Going answer (`canViewFullTrip` in the API's event controller), so the trip page renders this in place of the run rather than a section that 403s, and the run's own reads are never fetched. It states the rule and points at the RSVP control above, in that control's own word, because a run that is simply absent reads as a trip with nothing in it."
            >
              <RunLocked />
            </Specimen>

            <Specimen
              name="InviteCard"
              contract="inviterName · tripName · destination · startDate · endDate"
              note="The trip as somebody who has not signed in reads it: the four facts the invitation preview returns, in the same order the trip page's own column uses, because this is that page seen through a keyhole. No itinerary, no roll call, no cover: those are what joining is for, and the endpoint does not send them."
            >
              <InviteCard
                inviterName={INVITATIONS[0]!.inviterName}
                tripName={TRIPS[0]!.title}
                destination={TRIPS[0]!.location}
                startDate={TRIPS[0]!.startDate}
                endDate={TRIPS[0]!.endDate}
              />
            </Specimen>

            <Specimen
              name="NotificationRow"
              contract="notification: { type, title, body, tripId, data, readAt, createdAt } · trip? · onPress?"
              note="Everything the row shows comes off the wire: the server's title is the eyebrow, its body is the message, and the cover is the client's lookup from the API's bare tripId. Unread is weight plus a strawberry edge, never a faded row. Rules, not cards."
            >
              <View className="border-t border-ink">
                {NOTIFICATIONS.slice(0, 4).map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    trip={tripFor(TRIPS, notification)}
                    onPress={() =>
                      setLog(`NotificationRow "${notification.body}" fired`)
                    }
                  />
                ))}
              </View>
            </Specimen>
            <Specimen
              name="EventCard"
              contract="event: { name, type, startTime, endTime, place, image } · onPress?"
              note="The trip card's twin — same photo, same two bold lines — except the line above the title is the time, because the day it sits under is the date. Place photos come from Google Places through the API's photo proxy."
            >
              <Grid>
                {eventsFor(TRIPS[0]!).slice(0, 2).map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onPress={() => setLog(`EventCard "${event.name}" fired`)}
                  />
                ))}
              </Grid>
            </Specimen>
          </View>
        </Section>

        <Section title="Feedback">
          <Text className="font-body text-base text-ink">
            There is no toast, and no component for one. A message that
            disappears is not a record: anything a person might need twice
            belongs in the state of the screen rather than in a line that
            fades. The web app fires toasts from its mutation hooks because a
            corner of a large screen is free; on a phone the top is the band
            and the bottom is the keyboard and the form's button, so a
            transient message has nowhere to sit that is not over something.
          </Text>
          <Text className="font-body text-base text-ink">
            What each kind of feedback is instead. An answer inverts the
            control that gave it, which is the RSVP. An authored thing appears
            in the list you were already reading, which is a trip, an event and
            a stay. An endpoint with three outcomes states all three where the
            send happened, which is the invite dialog. A failure belongs at the
            field that caused it, which is `FieldError` — the one line under a
            field that is not ink — and a request that fails belongs where its
            content would have been, with a way to ask again, which is
            `InlineError`.
          </Text>
          <Text className="font-body text-base text-ink">
            The one case that earns a transient message is a destructive action
            with no way back, and even there it is second best: the API
            soft-deletes and restores, so the answer is the Deleted items
            screen. If one is ever added it carries an action, appears alone,
            never auto-dismisses under five seconds, and never covers the
            form's button or the keyboard. Screen readers announce
            auto-dismissing content inconsistently on both platforms, which is
            the strongest argument against it here.
          </Text>
        </Section>

        <Section title="Screens">
          <Text className="font-body text-base text-ink">
            Full screens under construction, composed from the tokens,
            primitives, and patterns above.
          </Text>
          <Link href="/trips" className="font-body-bold text-base text-ink underline">
            Trips
          </Link>
          <Link href="/trips/detail?id=picos" className="font-body-bold text-base text-ink underline">
            Trip detail
          </Link>
          <Link
            href="/trips/members?id=picos&as=organizer"
            className="font-body-bold text-base text-ink underline"
          >
            Who's coming · organizer
          </Link>
          <Link
            href="/trips/members?id=picos&as=traveler"
            className="font-body-bold text-base text-ink underline"
          >
            Who's coming · traveler
          </Link>
          <Link href="/trips/settings?id=picos" className="font-body-bold text-base text-ink underline">
            Trip settings
          </Link>
          <Link href="/trips/edit?id=picos" className="font-body-bold text-base text-ink underline">
            Edit trip
          </Link>
          <Link href="/trips/events/new?id=picos" className="font-body-bold text-base text-ink underline">
            Add event
          </Link>
          <Link
            href={`/trips/events/detail?id=picos&event=${SAMPLE_EVENT.id}&as=organizer`}
            className="font-body-bold text-base text-ink underline"
          >
            Event detail · organizer
          </Link>
          <Link
            href={`/trips/events/detail?id=picos&event=${SAMPLE_EVENT.id}&as=traveler`}
            className="font-body-bold text-base text-ink underline"
          >
            Event detail · traveler
          </Link>
          <Link
            href="/trips/invite?id=picos"
            className="font-body-bold text-base text-ink underline"
          >
            Invite people
          </Link>
          <Link href="/trips/stay/new?id=picos" className="font-body-bold text-base text-ink underline">
            Add stay
          </Link>
          <Link
            href={`/trips/stay/detail?id=picos&stay=${SAMPLE_STAY.id}&as=organizer`}
            className="font-body-bold text-base text-ink underline"
          >
            Stay detail · organizer
          </Link>
          <Link
            href={`/trips/stay/detail?id=picos&stay=${SAMPLE_STAY.id}&as=traveler`}
            className="font-body-bold text-base text-ink underline"
          >
            Stay detail · traveler
          </Link>
          <Link href="/invite?id=invite-pending" className="font-body-bold text-base text-ink underline">
            Invitation
          </Link>
          <Link href="/invite?id=invite-gone" className="font-body-bold text-base text-ink underline">
            Invitation · gone
          </Link>
          <Link href="/notifications" className="font-body-bold text-base text-ink underline">
            Notifications
          </Link>
          <Link href="/profile" className="font-body-bold text-base text-ink underline">
            Profile
          </Link>
          <Link href="/terms" className="font-body-bold text-base text-ink underline">
            Terms of Service
          </Link>
          <Link href="/privacy" className="font-body-bold text-base text-ink underline">
            Privacy Policy
          </Link>
          <Link href="/sms-terms" className="font-body-bold text-base text-ink underline">
            SMS Terms
          </Link>
          <Text className="font-body text-base text-ink">
            The landing is not under /design: it is the app's front door, so
            it lives at / and renders the wordmark band without the person
            chrome. Same for /trips — the app's home, a re-export of the
            trips screen. The invitation is that case in reverse: it is the
            one screen a stranger reaches first, and the address a friend's
            text points at, so it lives at /invite and wears the bare band.
          </Text>
          <Link href="/" className="font-body-bold text-base text-ink underline">
            Landing
          </Link>
          <Link href="/login" className="font-body-bold text-base text-ink underline">
            Sign in
          </Link>
          <Text className="font-body text-base text-ink">
            The code and profile screens sit behind the sign-in and are
            deliberately not linked from here: each redirects back to it
            without a number or a session between them. The mock takes any
            valid number with the code 123456, and decides whether the
            profile screen is needed from whether it knows the number.
            Nothing else in the app runs those steps: an invitation hands a
            friend to this sign-in rather than repeating it.
          </Text>
        </Section>

        <Section title="Plumbing">
          <Text className="font-body text-base text-ink">
            What a mockup cannot prove by looking at it: that the bundle
            resolved a workspace import, and that the fonts loaded. The
            first is the thing Metro has historically got wrong.
          </Text>
          <TokenRow
            name="@journiful/shared"
            token={SHARED_IMPORT}
            detail="A bare package import, resolved through the exports map"
          />
          <TokenRow
            name="Viewport"
            token={width >= 768 ? "wide" : "phone"}
            detail="One layout above 768px, not a second design"
          />
        </Section>

        <Section title="Parking lot">
          <Text className="font-body text-base text-ink">
            Discover · deleted items · delete account · session storage, since
            the sign-in is a mock and nothing survives a reload. Each lands
            here as a pattern first, then in a screen.
          </Text>
          <Text className="font-body text-base text-ink">
            Delete account is the one with a backend behind it rather than
            beside it, and it is not a route: an admin can ban an account and
            nothing anywhere can remove one, and `users` has no `deleted_at`
            where every other deletable thing in the schema has one. Two
            decisions come before any screen. `payments` and
            `payment_participants` have to outlive the person they name, so
            deleting the account cannot mean deleting the rows. And the phone
            number is the account, so the row that lets somebody sign up again
            must not be reachable from the row that was deleted.
          </Text>
        </Section>
      </View>
    </Screen>
  );
}
