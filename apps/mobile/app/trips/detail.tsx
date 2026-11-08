import { useMemo, useState } from "react";
import { Linking, Pressable, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "@/components/ui/Image";
import { Screen } from "@/components/ui/Screen";
import { Badge } from "@/components/ui/Badge";
import { PhotoCredit } from "@/components/ui/PhotoCredit";
import { QuietAction } from "@/components/ui/QuietAction";
import { InlineAction } from "@/components/ui/InlineAction";
import { LinkedText } from "@/components/ui/LinkedText";
import { PlaceLink } from "@/components/ui/PlaceLink";
import { nextEvent } from "@/lib/itinerary";
import { RsvpControl } from "@/components/trip/RsvpControl";
import { Itinerary } from "@/components/trip/Itinerary";
import { RunLocked } from "@/components/trip/RunLocked";
import { TripActions } from "@/components/trip/TripActions";
import { linkedRuns, truncateRuns } from "@/lib/linkify";
import { tripCountdown } from "@/lib/countdown";
import { formatDateRange } from "@/lib/dateRange";
import { todayIn } from "@/lib/timezone";
import { weatherAvailable } from "@/lib/weather";
import type { RsvpStatus } from "@/lib/rsvp";
import { useTrip } from "@/lib/tripsStore";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateTripPeople, useMembers } from "@/lib/queries/members";
import { setRsvpOptions } from "@/lib/queries/rsvp";
import { TripGate } from "@/components/trip/TripGate";
import { useTravel } from "@/lib/travelStore";
import { useTravel as useTravelSection } from "@/lib/queries/travel";
import NotFound from "@/app/+not-found";
import { useStays } from "@/lib/staysStore";
import { currentStay } from "@/lib/stays";
// The events read is shared with the run: the detail screen's live
// line and the itinerary both read the same query, and react-query
// dedupes it — the header carries no new request of its own.
import { useEvents as useEventsSection } from "@/lib/queries/events";
import { useAuth } from "@/lib/authStore";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { viewerOf, goingMembers } from "@/lib/members";
import { anyTravelOwed } from "@/lib/travelBoard";

import { boxForWidth } from "@/lib/place-images";
import { PlaceholderImage } from "@/components/ui/PlaceholderImage";
import type { PlaceholderKind } from "@/lib/placeholder";
import { getPertinentTime } from "@journiful/shared/utils";
import { Band } from "@/components/ui/Band";
import { useMotion } from "@/hooks/useMotion";
import { Column } from "@/components/ui/Column";

/**
 * Trip detail, header only — the itinerary comes after this lands.
 *
 * The facts read exactly like the card they were tapped from: countdown
 * on the cover, then the date, the name, and the place. The only thing
 * the detail adds is who is coming and what you are going to do about
 * it, so the card to detail move adds rather than re-teaches.
 *
 * There is no invited state. There was one, with an Accept invitation
 * button standing in for the RSVP control and the itinerary hidden
 * until it was pressed, and it modelled something the server never
 * produces: a membership is created when the invited number signs in
 * (`processPendingInvitations`), so by the time a traveler can see this
 * screen they are already on the trip. What the server does produce is
 * a member who has not answered yet — and that member does not get the
 * run: the API reads full trip data to whoever answered Going, and to
 * the organizers whatever they answered (`canViewFullTrip`). So the
 * unanswered state is the RSVP control's own empty state *and* the
 * run's locked state, which is the one place this screen's copy says
 * no; the answer is one tap away, above it, and the roster refetch on
 * success is what turns the run back on.
 *
 * Underneath sits the itinerary, a placeholder for now.
 *
 * Two columns once there is room, and the same two stacked on a
 * phone — no reordering, so there is nothing to keep in sync:
 *
 *   cover      │ facts
 *   action     │ description
 *
 * The action sits under the cover in both, which is where the invite
 * belongs: you see the trip, then you answer, then you read.
 *
 * It is one block, and TripActions is where its two halves are argued:
 * the ask and the actions. Only the ask changes with who you are, which
 * is the PRD's rule — trip-level things are the organizer's, person-level
 * things are your own:
 *
 *   organizer  the trip is authored, so the ask is bringing people in
 *   traveler   the trip is not yours, so the ask is your own RSVP
 *
 * The actions are one trigger rather than a stack of boxes. It holds the
 * trip's own verbs and your settings both, with your settings last, which
 * is where the two kinds are told apart — a rule between them was tried
 * and taken out. It is in the same place for every member: only what is
 * inside it is keyed by role.
 *
 * The facts column used to close with Edit trip and Trip settings as
 * words. They are in the trigger now, which is the one place on the page
 * that says what the page can be asked to do.
 *
 * The itinerary below used to carry Add event and Add stay in its own
 * head, on the argument that the surface holding a list holds the way
 * onto it. It lost them to this block: the page's verbs belong in one
 * place, and the itinerary is the one block here that answers with
 * content rather than with an action.
 *
 * Who you are comes from the server: your own roster row, matched by
 * account, carries your role.
 */
export default function TripDetail({
  /**
   * The kind of photo the hero falls back to when the trip has no cover.
   *
   * `"trip"` is right for every real trip: a trip with no cover photo has
   * no more specific kind to offer, so the generic travel shot is the
   * honest answer. The demo is the one caller that has one, and it needs
   * it — its three trips each wear an occasion photo, the shelf card that
   * opened the page showed that same photo, and without this the reader
   * presses a beach and lands on a generic landscape. That reads as a bug
   * in the app rather than as a demo. `app/demo.tsx` is the only caller
   * that passes it; see `TripCard`'s `coverKind` for the same seam on the
   * card side.
   */
  coverKind = "trip",
}: { coverKind?: PlaceholderKind }) {
  return (
    <TripGate label="Getting your trip">
      <TripDetailScreen coverKind={coverKind} />
    </TripGate>
  );
}

function TripDetailScreen({ coverKind }: { coverKind: PlaceholderKind }) {
  const motion = useMotion();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tripId = typeof id === "string" ? id : undefined;
  // The header read is the screen gate: the trip comes from the
  // detail query, suspended above. The events section reads the live
  // query under the rendered header (its own loading/error states);
  // stays and travel read their live queries the same way.
  const { trip } = useTrip(tripId);
  const { user } = useAuth();
  const router = useRouter();
  // TODO(BE): updateRsvpSchema accepts only `going|not_going|maybe`; `no_response` is expressed as absence. Documented in code, not a bug.
  // The RSVP answer is server state (POST /trips/:tripId/rsvp), painted
  // optimistically and rolled back on failure — the update-mutation flow
  // shape. `no_response` is the control's unselected state (no row yet):
  // it is never sent (setRsvp refuses it), only read from the roster.
  const [rsvpOverride, setRsvpOverride] = useState<RsvpStatus | null>(null);
  const queryClient = useQueryClient();
  const rsvpMutation = useMutation({ ...setRsvpOptions() });

  // An address can name a trip that is gone, or none at all, and then
  // this screen answers with the not-found state rather than another
  // trip. A 404 from the query lands there too, via the gate above.
  // All of these are read before the guard: a hook called after a
  // return is a hook called a different number of times.
  // Warms the travel list the action block reads — its Add travel shows
  // only while its viewer owes a time — so a cold detail still knows
  // whether you owe times once the list lands.
  useTravelSection(trip?.id);
  const { staysForTrip } = useStays();
  const { for: settingsFor } = useTripSettings();
  const { travelForTrip } = useTravel();
  // The roster is server state now, suspended under the same gate as
  // the trip above — the header never renders without it, and the
  // viewer stand-in below reads the roster, never a mock.
  const { members } = useMembers(trip?.id);
  // Who you are comes from the server: your own roster row, matched by
  // account, carries your role — never a query param. Read this early
  // because the events read below is gated on it: the run's rule is
  // “nothing unreachable is fetched”, and a header sharing the run's
  // query must keep that rule — who has not answered Going fires
  // neither read.
  const viewer = viewerOf(members, user?.id);
  // The events read, hoisted for the mid-trip live line: the same
  // query the run mounts its own section over, so one read serves
  // both and the header waits for nothing the run already loads —
  // and waits for nothing the run would refuse, either: held instead
  // of fired when the member cannot read it.
  const mightReadRun = Boolean(
    trip && (viewer?.isOrganizer || viewer?.status === "going"),
  );
  const { events } = useEventsSection(trip?.id, mightReadRun);
  // The hero asks for the large box on wide layouts: a place photo URL
  // carries its `?size=` segment, so the box swaps there; uploads and
  // placeholders carry none and render unchanged.
  const heroBox = boxForWidth(useWindowDimensions().width);
  const heroImage = (uri: string | null) =>
    uri?.replace(/([?&])size=(card|hero)/, `$1size=${heroBox}`);

  // The roof the trip page knows about, so its fact row can open the
  // one screen that holds the wifi, the code and the address. The run
  // owns the content; this is the door to it from the top, and it is the
  // live stay — tonight's, or the next to begin — which is the only
  // instance a door called Stay has to stand for.
  const now = new Date();
  const { clock } = trip
    ? settingsFor(trip)
    : { clock: "trip" as const };
  const timeZone = clock === "trip" ? (trip?.preferredTimezone ?? null) : null;
  const today = todayIn(timeZone);
  const stay = trip
    ? currentStay(staysForTrip(trip), today, timeZone)
    : undefined;

  // The live line's own calendar: it exists only while the trip is
  // walkable — no "current" facts about a trip that has not started
  // and none about one that is over, which is when the reader is
  // reading a record rather than the now. `startDate` and `endDate`
  // are required on the trip, so the range is the truth and the
  // guards are hygiene.
  const duringTrip = Boolean(
    trip?.startDate &&
      (!trip.endDate || trip.endDate >= today) &&
      trip.startDate <= today,
  );

  if (!trip) {
    return <NotFound />;
  }

  const countdown = tripCountdown(trip.startDate, trip.endDate);

  const organizer = viewer?.isOrganizer ?? false;
  // Who may read the run at all. The server reads full trip data to the
  // members who said they are going, and to an organizer whatever they
  // answered; everybody else gets the state that says so rather than a
  // section that fails. Nothing unreachable is fetched either, because
  // the run's own reads live inside the run — the component is not
  // mounted for them, so there is no request to refuse.
  const canReadRun =
    organizer || viewer?.status === "going";

  // "What is next": the same liveEvents path the run takes, condensed
  // to one row. Below the door chrome, never instead of it — and it
  // needs the run's own gate, because who has not answered Going does
  // not read events at all.
  const next =
    duringTrip ? nextEvent(events, timeZone, now) : null;

  // Your own travel, filed or not. Filed means a time is on it: a
  // row without one is still owed.
  const records = travelForTrip(trip);
  const filed = records.filter((record) => getPertinentTime(record));
  const viewerTravel = viewer
    ? filed.filter((record) => record.memberId === viewer.id)
    : [];
  const viewerOwesTravel =
    !viewerTravel.some((record) => record.travelType === "arrival") ||
    !viewerTravel.some((record) => record.travelType === "departure");
  // Whose times the nudge is about depends on who is looking. Yours, for
  // a traveler — it is your own row. Everybody's, for the organizer, who
  // is the one who files on behalf of the people who have not: it stays
  // while any of the travelling roster still owes a direction, which is
  // the whole job of it, and not while the viewer alone happens to be
  // filed. The set is the travel board's own (`goingMembers`), so the
  // button and the board agree about whose travel the trip is waiting
  // on.
  const travelOwed = organizer
    ? anyTravelOwed(records, goingMembers(members))
    : viewerOwesTravel;

  // The control's value: what you just tapped while it flies, else the
  // roster's answer for the viewer, else unreplied (no row yet).
  const response: RsvpStatus = rsvpOverride ?? viewer?.status ?? "no_response";
  // A write in flight quiets the control: the mutation holds the paint
  // until the roster refetch lands, so a second answer while it flies
  // would paint over a value the server has not confirmed yet. The
  // quiet is a real disable — announced on both platforms — with the
  // dimmed look the screen already had, and the early return below
  // keeps the single send even where a press gets through.
  const rsvpBusy = rsvpMutation.isPending;
  const answerRsvp = (status: RsvpStatus) => {
    // Unreachable through the control (RSVP_ANSWERS never offers
    // no_response), but the type carries all four states: absence is
    // read, never sent.
    if (status === "no_response") return;
    if (rsvpMutation.isPending) return;
    const tripId = trip.id;
    setRsvpOverride(status);
    rsvpMutation.mutate(
      { tripId, status },
      {
        onError: () => setRsvpOverride(null),
        onSuccess: () => setRsvpOverride(null),
        onSettled: () => {
          // An answer moves more than the roll call: `going` decides who
          // shares a scoped expense (`all_going`), so the same settle that
          // refreshes the roster refreshes the expenses and both balance
          // reads (`invalidateTripPeople` carries the money keys, `D7`).
          void invalidateTripPeople(queryClient, tripId);
        },
      },
    );
  };

  // The one block of verbs on this screen, in two tiers. The RSVP control
  // arrives as a node rather than as props, because the answer is this
  // screen's state — off the roster, painted optimistically and rolled
  // back on failure — and not the block's:
  //
  //   organizer  Invite people, then the trigger: Add event, Add stay,
  //              Add travel while somebody owes a time, Edit trip, then
  //              Trip settings
  //   traveler   their own RSVP, then the trigger: Add travel while they
  //              owe a time, then Trip settings
  //
  // Both roles end on the same trigger in the same place, holding the
  // same last word.
  const action = (
    <TripActions
      tripId={trip.id}
      organizer={organizer}
      travelOwed={travelOwed}
      memberId={viewer?.id}
      ask={
        <View
          aria-busy={rsvpBusy}
          style={rsvpBusy ? { opacity: 0.6 } : undefined}
        >
          <RsvpControl
            value={response}
            onChange={answerRsvp}
            disabled={rsvpBusy}
          />
        </View>
      }
    />
  );

  return (
    <Screen>
      {/* The trip's own block is the band: the cover, the dates, the name,
          the place and the verbs are one thing, and they are what the reader
          came for. Two bands on this screen, which the plan argued against
          and this one earns: the hero's, and the stays table's directly under
          it. They touch, with no sand between, because the division has a
          reason — the trip, then where you sleep — and the seam lands on the
          stays heading rather than above it.

          **The adjacency guard cannot see this.** `design-lint.mjs` check 5
          works per file, and these two bands live in different ones, so the
          only band-against-band in the app is also the only one it cannot
          catch. That is a known gap, not a pass. */}
      <Band tone="lilac">
        <Column>
        <View className="gap-y-6 md:flex-row md:gap-12">
          {/* Two columns of equal width. flex-1, not w-1/2: react-native
              does not shrink flex items, so two halves plus the gutter
              would overflow the content box by exactly the gutter and
              every rule in the right column would end past the page's. */}
          <View className="gap-6 md:flex-1">
            {/* The cover and its credit are one block, not two siblings. The
                credit is the photo's caption, and a caption is not a peer of
                what it captions: as a sibling it took this column's own 24pt
                block gap, which floated a line of 12pt type a photo's height
                away from the photo it is owed to. The event and stay sheets
                already have this right — no gap on their columns at all, so
                the credit's own `pt-1` is the whole of the space — and this
                is that shape. The 24pt still separates the cover from the
                verbs under it. */}
            <View>
              <View className="relative overflow-hidden">
                {heroImage(trip.image) ? (
                  trip.photoSourceUri ? (
                    <Pressable
                      onPress={() => void Linking.openURL(trip.photoSourceUri!)}
                      aria-label="View photo source on Google Maps"
                      className={motion.pressDim}
                    >
                      <Image
                        source={{ uri: heroImage(trip.image)! }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        className="w-full aspect-[2/1]"
                      />
                    </Pressable>
                  ) : (
                    <Image
                      source={{ uri: heroImage(trip.image)! }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      className="w-full aspect-[2/1]"
                    />
                  )
                ) : (
                  <View className="w-full aspect-[2/1]">
                    <PlaceholderImage kind={coverKind} />
                  </View>
                )}
                {countdown ? (
                  <View className="absolute left-3 top-3">
                    <Badge label={countdown} variant="club" />
                  </View>
                ) : null}
              </View>
              <PhotoCredit
                credit={trip.photoCredit ?? null}
                sourceUri={trip.photoSourceUri ?? null}
              />
            </View>

            {action}
          </View>

          {/* Right: the card's own order — date, name, place — then who is
              coming, then the description. */}
          <View className="gap-6 md:flex-1">
            <View className="gap-2">
              <Text className="font-body-bold text-lg text-ink">
                {formatDateRange(trip.startDate, trip.endDate)}
              </Text>
              <Text className="font-display-extrabold text-display-md-wide uppercase text-ink md:text-display-lg">
                {trip.title}
              </Text>
              {/* Where the trip is, and the one fact on this screen the
                  app has nothing to add to: Maps has the map. */}
              <PlaceLink label={trip.location} placeId={trip.placeId ?? null} />
              {/* Who is coming, and when: the roll call and the travel
                  board are two doors to two questions, side by side.

                  Spacing carries the run — the system's middle dot joins
                  values, and a run of doors wearing them is a sentence
                  that wraps mid-word, which is how a door called Weather
                  came to look like a word stranded on its own line. The
                  underline is the only affordance a door needs, and a
                  door that drops to a second line now drops the way an
                  underlined word does, honestly ragged. The words run
                  `tight` — the line is the target, the deviation
                  `QuietAction`'s own prop note carries — because a
                  44pt box under every door is what stood a full blank
                  row between the two lines of a wrapped run, and
                  `gap-y-1` gives the rows the same small break the
                  fact lines below take. The row is the trip's chrome:
                  the same doors, in the same order, whatever the
                  calendar knows.

                  Stay is not here. The live line below is the stay door
                  now — the same target, wearing tonight's name instead of
                  a category — and the rest of the roofs live where they
                  always did, at the head of the run. */}
              <View className="flex-row flex-wrap items-start gap-x-4 gap-y-1">
                <QuietAction
                  tight
                  label={`${trip.going} going`}
                  onPress={() =>
                    router.push(`/trips/members?id=${trip.id}`)
                  }
                />
                <QuietAction
                  tight
                  label="Travel"
                  onPress={() =>
                    router.push(`/trips/travel?id=${trip.id}`)
                  }
                />
                {/* Money: the third question of the same weight as the
                    roll call and the travel board, and it is asked by
                    the same trip. It carries no condition on purpose —
                    not on your role, not on whether there is a balance
                    to read. Every member of a trip may look at its
                    ledger, and a door that appears only once you owe
                    something would be a door nobody could find when
                    they came to record the dinner that made them owe it. */}
                <QuietAction
                  tight
                  label="Settle"
                  onPress={() => router.push(`/trips/settle?id=${trip.id}`)}
                />
                <QuietAction
                  tight
                  label="Places"
                  onPress={() => router.push(`/trips/places?id=${trip.id}`)}
                />
                {/* The last door, and a reading one: the sky is a fact
                    about the trip, not a thing anyone writes, so the door
                    opens a screen to look through rather than a ledger to
                    settle. It carries no role on purpose — every member may
                    read the same sky — only the forecast's own condition:
                    coordinates on the trip and dates the window reaches. */}
                {weatherAvailable(
                  {
                    destinationLat: trip.destinationLat ?? null,
                    destinationLon: trip.destinationLon ?? null,
                    startDate: trip.startDate,
                    endDate: trip.endDate,
                  },
                  today,
                ) ? (
                  <QuietAction
                    tight
                    label="Weather"
                    onPress={() =>
                      router.push(`/trips/weather?id=${trip.id}`)
                    }
                  />
                ) : null}
              </View>

              {/* The trip's now, while the trip has one: where you are
                  sleeping tonight (or the next roof to begin) and what
                  is next on the schedule — the run's own top, condensed
                  to two lines a reader can take in at once.

                  Each line presses whole — label and value are one door
                  with two halves of one name — wearing the run's own
                  marks and its own size (`text-sm`, inherited from the
                  wrapping Text), bold and underlined, no box
                  (`InlineAction`'s documented deviation: the line the
                  word sits in is the target). A 44pt box around each
                  line is what stacked two blank lines of padding into
                  the middle of what reads as one block, so the pair is
                  boxless and tight with its own small internal break;
                  `mt-4` is the block's own gap — the larger break that
                  says these two lines follow the doors rather than
                  belonging to them, a paragraph under a heading more
                  than a continuation of the run. Gate with the run
                  — who has not answered Going reads neither events nor
                  stays — and on the calendar: the pair exists while the
                  trip is walkable and goes silent otherwise, no
                  placeholder where a line would be. */}
              {canReadRun && duringTrip && (stay || next) ? (
                <View className="mt-4 gap-1">
                  {stay ? (
                    <Text className="font-body text-sm text-ink">
                      <InlineAction
                        label={`Current stay — ${stay.name}`}
                        onPress={() =>
                          router.push(
                            `/trips/stay/detail?id=${trip.id}&stay=${stay.id}`,
                          )
                        }
                      />
                    </Text>
                  ) : null}
                  {next ? (
                    <Text className="font-body text-sm text-ink">
                      <InlineAction
                        label={`Next event — ${next.event.name}, ${next.dayLabel}${next.time ? ` ${next.time}` : ""}`}
                        onPress={() =>
                          router.push(
                            `/trips/events/detail?id=${trip.id}&event=${next.event.id}`,
                          )
                        }
                      />
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>

            {trip.description ? <Description text={trip.description} /> : null}
          </View>
        </View>

        </Column>
      </Band>

      {/* The seam between the two halves of the page used to be a full-width
          hairline here. The band's lower edge does the same job and does it
          better: it closes both columns *and* changes the ground, so a rule
          on top of it would be a second mark saying one thing. That is why
          the hairline form is gone from this screen, and why the run below
          still brings no rule of its own (components/trip/Itinerary.tsx) —
          its rows are read down, which is a list, and a list has no rank. */}
      {/* The run owns its own columns, because its first table is a
          full-bleed band and a band cannot exist inside a constrained column.
          Nothing wraps it, which is what lets that band meet the hero's with
          no sand between them. */}
      {canReadRun ? (
        <Itinerary trip={trip} organizer={organizer} />
      ) : (
        <Column>
          {/* The run, or the state that says why it is not here: an
              unanswered RSVP withholds it, because the server reads full
              trip data to the people who are going. The description above
              is what you decide on, which is what you get for saying yes. */}
          <View className="gap-6 md:gap-8">
            <RunLocked />
          </View>
        </Column>
      )}
    </Screen>
  );
}

/** How much of a description reads before the cut. */
const LIMIT = 160;

/**
 * The description as prose, not a disclosure: short ones read whole,
 * long ones clamp at a few lines behind Read more. Character count
 * rather than measured lines — predictable in the lab, and close
 * enough on a phone.
 *
 * The cut is run-aware rather than a slice of the string, because a
 * description can carry an address: half an address is worse than no
 * address at all — a press that goes nowhere, or a label that lies about
 * where it goes. `truncateRuns` demotes whatever the cut lands inside
 * back to prose and appends the mark itself, so this file names the
 * number once and never types an ellipsis.
 *
 * `truncated` is a fact about the whole description, never about what is
 * on screen. Derived from the visible text it would go false the moment
 * the reader expanded, taking `Show less` away under the press that
 * asked for it.
 */
function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // Split once per description rather than per render: this screen
  // settles a query at a time, and neither call is free.
  const runs = useMemo(() => linkedRuns(text), [text]);
  const cut = useMemo(() => truncateRuns(runs, LIMIT), [runs]);
  const truncated = cut.truncated;

  return (
    <View className="gap-1">
      <LinkedText runs={expanded ? runs : cut.runs} />
      {truncated ? (
        <QuietAction
          label={expanded ? "Show less" : "Read more"}
          onPress={() => setExpanded(!expanded)}
        />
      ) : null}
    </View>
  );
}
