import { Suspense, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { Accordion, AccordionItem } from "@/components/ui/Accordion";
import { CountdownChip } from "@/components/trip/CountdownChip";
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

  const action = organizer ? (
    <View className="gap-3">
      <Button
        title="Invite people"
        variant="accent"
        fullWidth
        onPress={() => {}}
      />
      <QuietAction label="Trip settings" onPress={() => {}} />
    </View>
  ) : (
    // All three answers, always visible and always reachable — an RSVP
    // you cannot take back is a worse RSVP. Nothing is filled until you
    // answer, which is what `null` shows.
    <Segmented
      options={RSVP_ANSWERS.map((status) => ({
        value: status,
        label: RSVP_LABEL[status],
      }))}
      value={response === "no_response" ? null : response}
      onChange={setResponse}
    />
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
          {/* Left: the cover carries the countdown, exactly as the card
              does, and the action sits under it. */}
          <View className="gap-6 md:w-1/2">
            <View className="relative overflow-hidden">
              <Image
                source={{ uri: trip.image }}
                resizeMode="cover"
                className="w-full aspect-[2/1]"
              />
              {countdown ? <CountdownChip label={countdown} /> : null}
            </View>

            {action}
          </View>

          {/* Right: the card's own order — date, name, place — then who is
              coming, then the prose. */}
          <View className="gap-6 md:w-1/2">
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

            {trip.description ? (
              <Accordion>
                <AccordionItem title="Description">
                  <Text className="font-body text-base leading-relaxed text-ink">
                    {trip.description}
                  </Text>
                </AccordionItem>
              </Accordion>
            ) : null}
          </View>
        </View>
      </View>
    </Screen>
  );
}

/** Secondary action, quiet on purpose: the header carries one loud
 *  button and everything else steps back. */
function QuietAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="self-start">
      <Text className="font-body-bold text-sm text-ink underline">
        {label}
      </Text>
    </Pressable>
  );
}
