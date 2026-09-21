import { useState } from "react";
import { Image, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { QuietAction } from "@/components/ui/QuietAction";
import { PlaceLink } from "@/components/ui/PlaceLink";
import { RsvpControl } from "@/components/trip/RsvpControl";
import { Itinerary } from "@/components/trip/Itinerary";
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
import { useEvents as useEventsSection } from "@/lib/queries/events";
import { useStays } from "@/lib/staysStore";
import { currentStay } from "@/lib/stays";
import { useAuth } from "@/lib/authStore";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { viewerOf } from "@/lib/members";

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
 * a member who has not answered yet, and that is the RSVP control's own
 * empty state, not a state of the screen. The consequence is that the
 * itinerary is readable before anybody answers, which is the rule:
 * trip-level things are the organizer's to author and everyone's to
 * read.
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
 * The action itself is the one thing that changes with who you are,
 * which is the PRD's rule — trip-level things are the organizer's,
 * person-level things are your own:
 *
 *   organizer  the trip is authored, so the action is bringing people in
 *   traveler   the trip is not yours, so the action is your own RSVP
 *
 * Who you are comes from the server: your own roster row, matched by
 * account, carries your role.
 */
export default function TripDetail() {
  return (
    <TripGate label="Trip details">
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
  // stays and travel still read their mocks, so those sections below
  // stay as-is.
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
  // The empty-plan nudge reads the live events and stays sections
  // (same queries the itinerary below renders — one cache each, no
  // second source).
  const { events } = useEventsSection(trip?.id);
  // Warms the travel list the nudge below reads, so a cold detail
  // still knows whether you owe times once it lands.
  useTravelSection(trip?.id);
  const { staysForTrip } = useStays();
  const { for: settingsFor } = useTripSettings();
  const { travelForTrip } = useTravel();
  // The roster is server state now, suspended under the same gate as
  // the trip above — the header never renders without it, and the
  // viewer stand-in below reads the roster, never a mock.
  const { members } = useMembers(trip?.id);

  // Nothing on the itinerary yet. That is the one case its own head
  // cannot help with: the itinerary sits below the fold, and the empty
  // block that carries the same two verbs is under it. So the stack
  // keeps a nudge only while there is nothing to look at — the same
  // bargain the travel nudge makes while you owe times.
  const planIsEmpty = trip
    ? events.length === 0 && staysForTrip(trip).length === 0
    : false;
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

  // Your own travel, filed or not. Filed means a time is on it: a
  // row without one is still owed.
  const filed = travelForTrip(trip).filter((record) =>
    getPertinentTime(record),
  );
  const viewerTravel = viewer
    ? filed.filter((record) => record.memberId === viewer.id)
    : [];
  const owesTravel =
    !viewerTravel.some((record) => record.travelType === "arrival") ||
    !viewerTravel.some((record) => record.travelType === "departure");

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

  // The nudge onto the trip screen, and only while you owe times: the
  // board keeps its own Add travel either way. Same words as the board's
  // button, because it is the same act.
  const travelCta = owesTravel ? (
    <Button
      title="Add travel"
      // Coloured like the other asks on this screen: while you owe times
      // it is the one thing here that is yours to do.
      variant="accent"
      fullWidth
      onPress={() =>
        router.push(
          `/trips/travel/form?id=${trip.id}&member=${viewer?.id ?? ""}`,
        )
      }
    />
  ) : null;

  // Both variants end their action group with the same button: the
  // organizer's is the fourth in the stack, the traveler's sits directly
  // under the RSVP.
  const settingsButton = (
    <Button
      title="Trip settings"
      variant="secondary"
      fullWidth
      onPress={() => router.push(`/trips/settings?id=${trip.id}`)}
    />
  );

  const action = organizer ? (
    // One tight group: gap-2, so the four read as a single block rather
    // than four separate calls.
    <View className="gap-2">
      <Button
        title="Invite people"
        variant="accent"
        fullWidth
        onPress={() => router.push(`/trips/invite?id=${trip.id}`)}
      />
      {/* Authoring used to sit here, and moved down to the list it
          fills: Add event and Add stay are at the head of the itinerary
          now, which is one scroll away and changes what is directly
          under them. What stays is the nudge, and only while the
          itinerary is empty — a button that vanishes once you have used
          it is a nudge, and a button that never leaves is a fixture. */}
      {planIsEmpty ? (
        <Button
          title="Add the first event"
          variant="primary"
          fullWidth
          onPress={() => router.push(`/trips/events/new?id=${trip.id}`)}
        />
      ) : null}
      {/* The trip's own maintenance, outlined under the coloured two. */}
      <Button
        title="Edit trip"
        variant="secondary"
        fullWidth
        onPress={() => router.push(`/trips/edit?id=${trip.id}`)}
      />
      {settingsButton}
      {travelCta}
    </View>
  ) : (
    <View className="gap-2">
      {/* All three answers, always visible and always reachable — an
          RSVP you cannot take back is a worse RSVP. */}
      <RsvpControl value={response} onChange={answerRsvp} />
      {travelCta}
      {settingsButton}
    </View>
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
          </View>
        </View>

        {/* The itinerary is the only thing an unanswered invitation
            withholds: the description is what you decide on, it is what
            you get for saying yes. */}
        <Itinerary trip={trip} organizer={organizer} />
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
