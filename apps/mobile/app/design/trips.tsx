import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { TripCard, TripGrid } from "@/components/trip/TripCard";
import { groupTrips } from "@/lib/tripGroups";
import { TRIPS } from "@/mocks/trips";

/**
 * Design lab: the trips screen under construction.
 *
 * Upcoming first, soonest first. Past below, newest first. The two are
 * separated by a rule rather than year headings — each card carries its
 * own year in the date line.
 */
export default function TripsScreen() {
  const [empty, setEmpty] = useState(false);
  const [log, setLog] = useState("No interaction yet.");

  const trips = empty ? [] : TRIPS;
  const { upcoming, past } = groupTrips(trips, new Date());

  const card = (trip: (typeof TRIPS)[number]) => (
    <TripCard
      key={trip.id}
      trip={trip}
      onPress={() => setLog(`Opened "${trip.title}"`)}
    />
  );

  return (
    <Screen>
      <View className="gap-8">
        <View className="flex-row gap-5">
          <Pressable onPress={() => setEmpty(false)}>
            <Text
              className={`text-sm text-ink ${
                empty ? "font-body" : "font-body-bold underline"
              }`}
            >
              With trips
            </Text>
          </Pressable>
          <Pressable onPress={() => setEmpty(true)}>
            <Text
              className={`text-sm text-ink ${
                empty ? "font-body-bold underline" : "font-body"
              }`}
            >
              Empty
            </Text>
          </Pressable>
        </View>

        {/* No page heading: the app wordmark bar already says where you
            are, and the Upcoming/Past rules carry the structure. */}
        {trips.length > 0 ? (
          <View>
            <Button
              title="Create trip"
              onPress={() => setLog("Create trip pressed")}
            />
          </View>
        ) : null}

        {trips.length === 0 ? (
          <View className="gap-5 py-10">
            <Text className="font-display text-3xl uppercase leading-tight text-ink">
              No trips yet
            </Text>
            <Text className="max-w-[46ch] font-body text-lg text-ink">
              Start a trip, add the dates, and invite everyone. Everyone
              sees the same itinerary as it comes together.
            </Text>
            <View>
              <Button
                title="Create your first trip"
                fullWidth
                onPress={() => setLog("Create first trip pressed")}
              />
            </View>
          </View>
        ) : (
          <>
            {upcoming.length > 0 ? (
              <Section title="Upcoming">
                {upcoming.map((trip) => card(trip))}
              </Section>
            ) : null}
            {past.length > 0 ? (
              <Section title="Past">{past.map((trip) => card(trip))}</Section>
            ) : null}
          </>
        )}

        <Text className="font-body text-sm text-ink">{log}</Text>
      </View>
    </Screen>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-6 border-t border-ink pt-6">
      <Text className="font-display text-xl uppercase leading-none text-ink">
        {title}
      </Text>
      <TripGrid>{children}</TripGrid>
    </View>
  );
}
