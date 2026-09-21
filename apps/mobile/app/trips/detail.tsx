import { useState } from "react";
import { Image, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { Badge } from "@/components/ui/Badge";
import { QuietAction } from "@/components/ui/QuietAction";
import { PlaceLink } from "@/components/ui/PlaceLink";
import { RsvpControl } from "@/components/trip/RsvpControl";
import { Itinerary } from "@/components/trip/Itinerary";
import { RunLocked } from "@/components/trip/RunLocked";
import { TripActions } from "@/components/trip/TripActions";
import { tripCountdown } from "@/lib/countdown";
import { formatDateRange } from "@/lib/dateRange";
import { todayIn } from "@/lib/timezone";
import type { RsvpStatus } from "@/lib/rsvp";
import { useTrip } from "@/lib/tripsStore";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { memberKeys, useMembers } from "@/lib/queries/members";
import { setRsvpOptions } from "@/lib/queries/rsvp";
import { TripGate } from "@/components/trip/TripGate";
import { useTravel } from "@/lib/travelStore";
import { useTravel as useTravelSection } from "@/lib/queries/travel";
import NotFound from "@/app/+not-found";
import { useStays } from "@/lib/staysStore";
import { currentStay } from "@/lib/stays";
import { useAuth } from "@/lib/authStore";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { viewerOf, goingMembers } from "@/lib/members";
import { anyTravelOwed } from "@/lib/travelBoard";

import { getPertinentTime } from "@journiful/shared/utils";

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
 * It is one block, and TripActions is where its two tiers are argued:
 * the ask and the adds. Only the ask changes with who you are, which is
 * the PRD's rule — trip-level things are the organizer's, person-level
 * things are your own:
 *
 *   organizer  the trip is authored, so the ask is bringing people in
 *   traveler   the trip is not yours, so the ask is your own RSVP
 *
 * The trip's own maintenance is not in it: Edit trip and Trip settings
 * close the facts column instead, under the description, with the rule
 * that opens the run under them.
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
export default function TripDetail() {
  return (
    <TripGate label="Getting your trip">
      <TripDetailScreen />
    </TripGate>
  );
}

function TripDetailScreen() {
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

  // The roof the trip page knows about, so its fact row can open the
  // one screen that holds the wifi, the code and the address. The run
  // owns the content; this is the door to it from the top, and it is the
  // live stay — tonight's, or the next to begin — which is the only
  // instance a door called Stay has to stand for.
  const { clock } = trip
    ? settingsFor(trip, new Date())
    : { clock: "trip" as const };
  const timeZone = clock === "trip" ? (trip?.preferredTimezone ?? null) : null;
  const stay = trip
    ? currentStay(staysForTrip(trip), todayIn(timeZone), timeZone)
    : undefined;

  if (!trip) {
    return <NotFound />;
  }

  const countdown = tripCountdown(trip.startDate, trip.endDate);

  // Who you are comes from the server: your own roster row, matched
  // by account, carries your role — never a query param.
  const viewer = viewerOf(members, user?.id);
  const organizer = viewer?.isOrganizer ?? false;
  // Who may read the run at all. The server reads full trip data to the
  // members who said they are going, and to an organizer whatever they
  // answered; everybody else gets the state that says so rather than a
  // section that fails. Nothing unreachable is fetched either, because
  // the run's own reads live inside the run — the component is not
  // mounted for them, so there is no request to refuse.
  const canReadRun =
    organizer || viewer?.status === "going";

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
  const answerRsvp = (status: RsvpStatus) => {
    // Unreachable through the control (RSVP_ANSWERS never offers
    // no_response), but the type carries all four states: absence is
    // read, never sent.
    if (status === "no_response") return;
    const tripId = trip.id;
    setRsvpOverride(status);
    rsvpMutation.mutate(
      { tripId, status },
      {
        onError: () => setRsvpOverride(null),
        onSuccess: () => setRsvpOverride(null),
        onSettled: () => {
          queryClient.invalidateQueries({
            queryKey: memberKeys.list(tripId),
          });
        },
      },
    );
  };

  // The one block of verbs on this screen, in its three tiers. The RSVP
  // control arrives as a node rather than as props, because the answer
  // is this screen's state — off the roster, painted optimistically and
  // rolled back on failure — and not the block's:
  //
  //   organizer  Invite people · Add travel, then Add event and Add stay
  //   traveler   their own RSVP · Add travel while they owe a time
  //
  // Both roles end on the same two words: Edit trip, Trip settings.
  const action = (
    <TripActions
      tripId={trip.id}
      organizer={organizer}
      travelOwed={travelOwed}
      memberId={viewer?.id}
      ask={<RsvpControl value={response} onChange={answerRsvp} />}
    />
  );

  return (
    <Screen>
      <View className="gap-6 md:gap-8">
        <View className="gap-y-6 md:flex-row md:gap-12">
          {/* Two columns of equal width. flex-1, not w-1/2: react-native
              does not shrink flex items, so two halves plus the gutter
              would overflow the content box by exactly the gutter and
              every rule in the right column would end past the page's. */}
          <View className="gap-6 md:flex-1">
            <View className="relative overflow-hidden">
              <Image
                source={{ uri: trip.image }}
                resizeMode="cover"
                className="w-full aspect-[2/1]"
              />
              {countdown ? (
                <View className="absolute left-3 top-3">
                  <Badge label={countdown} variant="club" />
                </View>
              ) : null}
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
              <Text className="font-display text-5xl uppercase leading-[0.95] text-ink md:text-6xl">
                {trip.title}
              </Text>
              {/* Where the trip is, and the one fact on this screen the
                  app has nothing to add to: Maps has the map. */}
              <PlaceLink label={trip.location} />
              {/* Who is coming, and when: the roll call and the travel
                  board are two doors to two questions, side by side. */}
              <View className="flex-row items-center gap-2">
                <QuietAction
                  label={`${trip.going} going`}
                  onPress={() =>
                    router.push(`/trips/members?id=${trip.id}`)
                  }
                />
                <Text className="font-body text-sm text-ink">·</Text>
                <QuietAction
                  label="Travel"
                  onPress={() =>
                    router.push(`/trips/travel?id=${trip.id}`)
                  }
                />
                {/* The third door, and deliberately the categorical
                    one: Stay, not a name. A name is only clear to
                    somebody who already knows which roof is which, and
                    on a five-hut traverse it is a word you have to
                    decode before you can use it. What the door opens
                    is nonetheless one particular stay — whichever you
                    are in tonight, or the next to begin — and that is
                    the only stay the label needs to be true about:
                    there is one answer to where am I sleeping tonight.
                    The rest are at the head of the itinerary, with the
                    wifi and the code behind this one. */}
                {stay ? (
                  <>
                    <Text className="font-body text-sm text-ink">·</Text>
                    <QuietAction
                      label="Stay"
                      onPress={() =>
                        router.push(
                          `/trips/stay/detail?id=${trip.id}&stay=${stay.id}`,
                        )
                      }
                    />
                  </>
                ) : null}
              </View>
            </View>

            {trip.description ? <Description text={trip.description} /> : null}

            {/* The trip's own maintenance, under the facts it edits: what
                the trip is (its name, dates, place, cover) and how its
                run behaves (the itinerary, notifications, privacy,
                calendar) are the two screens a member opens least often,
                so they are words at the foot of this column rather than
                a tier of the action block — nothing here adds anything,
                and last place in a column of boxes read as a thing to
                do. Every member has Trip settings; only the organizer
                has Edit trip.

                The rule that closes them is the page's own seam, drawn
                below both columns, and the run's controls sit under it.

                The pair is sent to the bottom of this column from md up
                (`mt-auto`), because the column is as tall as the cover and
                the action block beside it and its own content is shorter:
                left to flow, the words sat high above the seam and the
                trip's own line did not line up with the foot of the
                column it belongs to. */}
            <View className="gap-6 md:mt-auto">
              <View className="flex-row flex-wrap items-center gap-2">
                {organizer ? (
                  <>
                    <QuietAction
                      label="Edit trip"
                      onPress={() => router.push(`/trips/edit?id=${trip.id}`)}
                    />
                    <Text className="font-body text-sm text-ink">·</Text>
                  </>
                ) : null}
                <QuietAction
                  label="Trip settings"
                  onPress={() => router.push(`/trips/settings?id=${trip.id}`)}
                />
              </View>
            </View>
          </View>
        </View>

        {/* The seam between the two halves of the page: the trip above —
            cover, verbs, facts, description, its own two words at the
            foot of the column — and the run below, whose own controls sit
            under this line. It is the page's rule rather than the run's,
            because only the page can draw one that closes both columns
            and opens what comes under them; the run's first block
            therefore brings no rule of its own
            (components/trip/Itinerary.tsx). */}
        <View className="h-px w-full bg-ink" />

        {/* The run, or the state that says why it is not here: an
            unanswered RSVP withholds it, because the server reads full
            trip data to the people who are going. The description above
            is what you decide on, which is what you get for saying yes. */}
        {canReadRun ? <Itinerary trip={trip} organizer={organizer} /> : <RunLocked />}
      </View>
    </Screen>
  );
}

/**
 * The description as prose, not a disclosure: short ones read whole,
 * long ones clamp at a few lines behind Read more. Character count
 * rather than measured lines — predictable in the lab, and close
 * enough on a phone.
 */
function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 160;
  const shown =
    expanded || !long ? text : `${text.slice(0, 160).trimEnd()}…`;

  return (
    <View className="gap-1">
      <Text className="font-body text-base leading-relaxed text-ink">
        {shown}
      </Text>
      {long ? (
        <QuietAction
          label={expanded ? "Show less" : "Read more"}
          onPress={() => setExpanded(!expanded)}
        />
      ) : null}
    </View>
  );
}
