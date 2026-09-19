import { Suspense, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { QuietAction } from "@/components/ui/QuietAction";
import { Segmented } from "@/components/ui/Segmented";
import { Itinerary } from "@/components/trip/Itinerary";
import { tripCountdown } from "@/lib/countdown";
import { formatDateRange } from "@/lib/dateRange";
import { RSVP_ANSWERS, RSVP_LABEL, type RsvpStatus } from "@/lib/rsvp";
import { useTrips } from "@/lib/tripsStore";

type Variant = "organizer" | "traveler";

const VARIANTS: Array<{ value: Variant; label: string }> = [
  { value: "organizer", label: "Organizer" },
  { value: "traveler", label: "Traveler" },
];

/**
 * Trip detail, header only — the itinerary comes after this lands.
 *
 * The facts read exactly like the card they were tapped from: countdown
 * on the cover, then the date, the name, and the place. The only thing
 * the detail adds is who is coming and what you are going to do about
 * it, so the card to detail move adds rather than re-teaches.
 *
 * A trip you have been invited to but not answered opens as an
 * invitation rather than as a trip: this same header, one Accept
 * invitation button, and nothing below it. Accepting swaps the button
 * in place for the Going / Maybe / Not going control and reveals the
 * rest. That is why the RSVP control is never seen empty — an
 * unanswered invitation is a state of the screen, not of the control.
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
 * The variant switch at the top is a lab control, not a product one: it
 * exists so both halves of that rule can be seen side by side. It
 * defaults to the traveler because that is the state with a decision in
 * it.
 */
export default function TripDetail() {
  return (
    <Suspense fallback={null}>
      <TripDetailScreen />
    </Suspense>
  );
}

function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trips } = useTrips();
  const router = useRouter();
  const [variant, setVariant] = useState<Variant>("traveler");
  // Everyone starts unreplied, exactly as the API's default has it.
  const [response, setResponse] = useState<RsvpStatus>("no_response");

  // Every card on the trips screen opens here, so the id is a lookup, not
  // a requirement: with no trip named, show the first one.
  const tripId = typeof id === "string" ? id : undefined;
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];

  if (!trip) {
    return (
      <Screen>
        <Text className="font-body text-base text-ink">
          No trip to show. Start one from the trips screen.
        </Text>
      </Screen>
    );
  }

  const countdown = tripCountdown(trip.startDate, trip.endDate);
  const organizer = variant === "organizer";
  // The organizer is never invited to their own trip, and everyone else
  // starts unreplied — the API's own default.
  const invited = !organizer && response === "no_response";

  // Both variants end their action group with the same button: the
  // organizer's is the fourth in the stack, the traveler's sits directly
  // under the RSVP.
  const settingsButton = (
    <Button
      title="Trip settings"
      variant="secondary"
      fullWidth
      onPress={() => router.push(`/design/trips/settings?id=${trip.id}`)}
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
        onPress={() => {}}
      />
      {/* Authoring sits under the ask: adding an event is how the
          organizer fills the itinerary below, so it reads as building
          rather than maintaining. */}
      <Button
        title="Add event"
        variant="primary"
        fullWidth
        onPress={() => router.push(`/design/trips/events/new?id=${trip.id}`)}
      />
      {/* The trip's own maintenance, outlined under the coloured two. */}
      <Button
        title="Edit trip"
        variant="secondary"
        fullWidth
        onPress={() => router.push(`/design/trips/edit?id=${trip.id}`)}
      />
      {settingsButton}
    </View>
  ) : (
    <View className="gap-2">
      {invited ? (
        // An unanswered invitation gets one answer and nothing else:
        // settings for a trip you have not joined would be noise.
        <Button
          title="Accept invitation"
          variant="accent"
          fullWidth
          onPress={() => setResponse("going")}
        />
      ) : (
        <>
          {/* All three answers, always visible and always reachable — an
              RSVP you cannot take back is a worse RSVP. */}
          <Segmented
            options={RSVP_ANSWERS.map((status) => ({
              value: status,
              label: RSVP_LABEL[status],
            }))}
            value={response}
            onChange={setResponse}
          />
          {settingsButton}
        </>
      )}
    </View>
  );

  return (
    <Screen>
      <View className="gap-6 md:gap-8">
        <View className="flex-row gap-6">
          {VARIANTS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setVariant(option.value)}
            >
              <Text
                className={`text-sm text-ink ${
                  variant === option.value
                    ? "font-body-bold underline"
                    : "font-body"
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

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
              <Text className="font-body-bold text-lg text-ink">
                {trip.location}
              </Text>
              <QuietAction
                label={`${trip.going} going`}
                onPress={() =>
                  router.push(`/design/trips/members?id=${trip.id}`)
                }
              />
            </View>

            {trip.description ? <Description text={trip.description} /> : null}
          </View>
        </View>

        {/* The itinerary is the only thing an unanswered invitation
            withholds: the description is what you decide on, it is what
            you get for saying yes. */}
        {invited ? null : <Itinerary trip={trip} />}
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
