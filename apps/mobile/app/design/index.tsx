import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { Link } from "expo-router";
import { AppHeader } from "@/components/ui/AppHeader";
import { ActionBar } from "@/components/ui/ActionBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TextField } from "@/components/ui/TextField";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { RsvpControl } from "@/components/trip/RsvpControl";
import { Dropdown } from "@/components/ui/Dropdown";
import { Accordion, AccordionItem } from "@/components/ui/Accordion";
import { Screen } from "@/components/ui/Screen";
import { DatePicker } from "@/components/ui/DatePicker";
import { DayStrip } from "@/components/ui/DayStrip";
import { TimeField } from "@/components/ui/TimeField";
import type { Selection } from "@/lib/calendar";
import { RSVP_LABEL, type RsvpStatus } from "@/lib/rsvp";
import { formatDateRange } from "@/lib/dateRange";
import { TripCard } from "@/components/trip/TripCard";
import { EventCard } from "@/components/trip/EventCard";
import { Grid } from "@/components/ui/Grid";
import { PhotoCard } from "@/components/ui/PhotoCard";
import { NotificationRow } from "@/components/notification/NotificationRow";
import { TRIPS } from "@/mocks/trips";
import { eventsFor } from "@/mocks/events";
import { NOTIFICATIONS } from "@/mocks/notifications";
import { tripFor } from "@/lib/notifications";

const COLORS: Array<[name: string, token: string, hex: string, swatch: string]> = [
  ["Chrome", "ink", "#000000", "bg-ink"],
  ["Background", "sand", "#f5eacc", "bg-sand"],
  ["Muted", "gravel", "#e2ded5", "bg-gravel"],
  ["Surface", "paper", "#ffffff", "bg-paper"],
  ["Primary", "seafoam", "#42d177", "bg-seafoam"],
  ["Secondary", "watermelon", "#ef8ad4", "bg-watermelon"],
  ["Accent", "strawberry", "#ff6352", "bg-strawberry"],
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

export default function DesignSystem() {
  const [formName, setFormName] = useState("");
  const [venue, setVenue] = useState<string | null>(null);
  const [rsvp, setRsvp] = useState<RsvpStatus | null>(null);
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
              contract="title? · onClose? · action?"
              note="Title mode, shown here. Wordmark mode is the same component with no title, rendered globally above this page."
            >
              <AppHeader
                title="Notification settings"
                onClose={() => setLog("AppHeader onClose fired")}
              />
            </Specimen>

            <Specimen
              name="FullscreenDialog"
              contract="title · primaryTitle? · onPrimary? · children"
              note="Composes AppHeader and ActionBar into a route. Omit primaryTitle on a read-only dialog — a bar with nothing worth pressing is chrome for its own sake. It fills the screen by definition, so it cannot be previewed in a frame: open one."
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
              contract="selection · onChange"
              note="A range, and only a range: two taps make a trip, endpoints invert to ink, the days between fill seafoam. It stopped asking for single days when the DayStrip below took that job — a calendar offered the whole month to answer a question whose every valid answer was already known. Never a nested dialog."
            >
              <DatePicker selection={range} onChange={setRange} />
              <Text className="font-body text-sm text-ink">
                {range.start
                  ? formatDateRange(
                      range.start,
                      range.end ?? range.start,
                    )
                  : "Tap the first day, then the last."}
              </Text>
            </Specimen>

            <Specimen
              name="DayStrip"
              contract="startDate · endDate · value · onChange"
              note="One day inside a trip, which is every day that can be chosen and nothing else. A calendar here would draw four dead weeks to offer eight days, so the days are the control: seven across a phone, wrapping for a fortnight, weekday over number. A month heading appears only when a trip crosses one. Use this wherever a day inside a trip is picked; DatePicker is for the trip's own range."
            >
              <DayStrip
                startDate={TRIPS[0]!.startDate}
                endDate={TRIPS[0]!.endDate}
                value={singleDay.start ?? ""}
                onChange={(day) => setSingleDay({ start: day, end: day })}
              />
              <Text className="font-body text-sm text-ink">
                {singleDay.start
                  ? `Chosen: ${singleDay.start}`
                  : "Tap a day in the trip."}
              </Text>
            </Specimen>

            <Specimen
              name="TimeField"
              contract="label · value · onChange · optional? · error?"
              note="A time off a column of slots, the chosen one inverted — a picker without a second dialog. Fifteen-minute steps across the whole day, because a red-eye is as much an event as a dinner. optional puts a No end row at the top, so an event that simply starts is a choice rather than an empty field. Rows read twelve-hour, exactly as the itinerary prints them."
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
              contract="children"
              note="The ground for every screen. Navigation containers paint their own background, so a screen must paint its own sand or it renders grey."
            >
              <Screen>
                <Text className="font-body text-base text-ink">
                  Screen content sits on the sand ground.
                </Text>
              </Screen>
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
              contract="title · variant? · onPress? · fullWidth? · align?"
              note="Fills the width on a phone; from md up it hugs the edge it is aligned to."
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
              note="A filter you can press: filled ink when on, outlined when off. Used for independent filters (past events) and for exclusive choices (trip time / your time) alike, with a plain label above when the row needs one."
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
              contract="options (value · label · tone?) · value (nullable) · onChange"
              note="One choice out of a few, all of them visible. Bordered cells, the chosen one filled with its tone — the same p-4 and text-sm as a button, so a row of these sits in a stack of buttons without a step. value is nullable because this was built for an RSVP, where having chosen nothing yet is a real state rather than an error."
            >
              <RsvpControl
                value={rsvp ?? "no_response"}
                onChange={(status) => {
                  setRsvp(status);
                  setLog(`RSVP "${RSVP_LABEL[status]}"`);
                }}
              />
            </Specimen>

            <Specimen
              name="TextField"
              contract="label · value · onChangeText · placeholder? · error?"
              note="Every dialog that collects input uses this. Errors sit under the field, never in a toast."
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

        <Section title="Screens">
          <Text className="font-body text-base text-ink">
            Full screens under construction, composed from the tokens,
            primitives, and patterns above.
          </Text>
          <Link href="/design/trips" className="font-body-bold text-base text-ink underline">
            Trips
          </Link>
          <Link href="/design/trips/detail?id=picos" className="font-body-bold text-base text-ink underline">
            Trip detail
          </Link>
          <Link
            href="/design/trips/members?id=picos&as=organizer"
            className="font-body-bold text-base text-ink underline"
          >
            Who's coming · organizer
          </Link>
          <Link
            href="/design/trips/members?id=picos&as=traveler"
            className="font-body-bold text-base text-ink underline"
          >
            Who's coming · traveler
          </Link>
          <Link href="/design/trips/settings?id=picos" className="font-body-bold text-base text-ink underline">
            Trip settings
          </Link>
          <Link href="/design/trips/edit?id=picos" className="font-body-bold text-base text-ink underline">
            Edit trip
          </Link>
          <Link href="/design/trips/events/new?id=picos" className="font-body-bold text-base text-ink underline">
            Add event
          </Link>
          <Link
            href="/design/trips/events/detail?id=picos&event=picos-2026-09-19-2&as=organizer"
            className="font-body-bold text-base text-ink underline"
          >
            Event detail · organizer
          </Link>
          <Link
            href="/design/trips/events/detail?id=picos&event=picos-2026-09-19-2&as=traveler"
            className="font-body-bold text-base text-ink underline"
          >
            Event detail · traveler
          </Link>
          <Link href="/notifications" className="font-body-bold text-base text-ink underline">
            Notifications
          </Link>
          <Link href="/design/profile" className="font-body-bold text-base text-ink underline">
            Profile
          </Link>
        </Section>

        <Section title="Parking lot">
          <Text className="font-body text-base text-ink">
            Travel cards · invite flow · Discover · deleted items — not yet
            designed. Each lands here as a pattern first, then in a screen.
          </Text>
        </Section>
      </View>
    </Screen>
  );
}
