import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { TripCard, TripGrid } from "@/components/trip/TripCard";
import { groupTrips } from "@/lib/tripGroups";
import { TRIPS } from "@/mocks/trips";

/**
 * Design lab: the trips screen under construction.
 *
 * Upcoming first, soonest first. Past below, newest first, split by
 * year. A year label is only worth its ink when a section actually
 * spans more than one year.
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
    <ScrollView className="flex-1">
      <View className="gap-8 p-6">
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

        <View className="flex-row items-center justify-between gap-4">
          <Text className="font-display text-3xl uppercase leading-none text-ink">
            Trips
          </Text>
          {trips.length > 0 ? (
            <View>
              <Button
                title="Create trip"
                onPress={() => setLog("Create trip pressed")}
              />
            </View>
          ) : null}
        </View>

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
                onPress={() => setLog("Create first trip pressed")}
              />
            </View>
          </View>
        ) : (
          <>
            {upcoming.length > 0 ? (
              <Section title="Upcoming" groups={upcoming} render={card} />
            ) : null}
            {past.length > 0 ? (
              <Section title="Past" groups={past} render={card} />
            ) : null}
          </>
        )}

        <Text className="font-body text-sm text-ink">{log}</Text>
      </View>
    </ScrollView>
  );
}

function Section({
  title,
  groups,
  render,
}: {
  title: string;
  groups: ReturnType<typeof groupTrips>["upcoming"];
  render: (trip: (typeof TRIPS)[number]) => ReactNode;
}) {
  // One year needs no label; two or more need the signposts.
  const showYears = groups.length > 1;

  return (
    <View className="gap-6">
      <Text className="font-display text-xl uppercase leading-none text-ink">
        {title}
      </Text>
      {groups.map((group) => (
        <View key={group.year} className="gap-4">
          {showYears ? (
            <Text className="font-body-bold text-sm text-ink">
              {group.year}
            </Text>
          ) : null}
          <TripGrid>{group.trips.map(render)}</TripGrid>
        </View>
      ))}
    </View>
  );
}
