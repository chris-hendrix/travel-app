import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import NotFound from "@/app/+not-found";
import { TripGate } from "@/components/trip/TripGate";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { RuledRows } from "@/components/ui/RuledRows";
import { useMotion } from "@/hooks/useMotion";
import { useProfile } from "@/lib/profileStore";
import { useTripWeather } from "@/lib/queries/weather";
import { todayIn } from "@/lib/timezone";
import { useTrip } from "@/lib/tripsStore";
import {
  forecastUpdatedWording,
  formatTemp,
  prepareWeatherDays,
} from "@/lib/weather";

/**
 * Weather — the trip's forecast, behind the hero's door.
 *
 * A dialog rather than a screen, for the same reason Places is: the
 * forecast answers one question about the trip you are already
 * looking at. This file is the trip it belongs to and the sheet's
 * title; the body below owns the read. There is no primary verb —
 * nothing about weather is authored anywhere — so the bar carries
 * nothing.
 *
 * A row press is a route change rather than a panel, so the dialog
 * holds one shape of each day instead of two: the record behind it
 * is a dialog of its own at `/trips/weather/detail`, keyed by
 * `&day=`.
 */
export default function TripWeather() {
  return (
    <TripGate label="Getting the forecast">
      <TripWeatherDialog />
    </TripGate>
  );
}

function TripWeatherDialog() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);

  if (!trip) {
    return <NotFound />;
  }

  return (
    <FullscreenDialog
      title="Weather"
      dismissHref={`/trips/detail?id=${trip.id}`}
    >
      <WeatherList tripId={trip.id} timeZone={trip.preferredTimezone} />
    </FullscreenDialog>
  );
}

/**
 * The trip's forecast days: the read (`useTripWeather`) and the rows,
 * so the caller hands over the trip and nothing else.
 *
 * The three failure states are blocks of their own — the SettleLedger
 * bargain — never a blank sheet. The server's `available: false`
 * reads the same way: a first-class state in place of the list, never
 * a crash on the daily and hourly it did not send. Days before today
 * are dropped on the destination's clock, so an empty list after the
 * drop says the forecast has nothing left rather than nothing at all.
 */
function WeatherList({
  tripId,
  timeZone,
}: {
  tripId: string;
  timeZone: string;
}) {
  const router = useRouter();
  const motion = useMotion();
  const { profile } = useProfile();
  const { data, status, retry } = useTripWeather(tripId);
  // The profile setting reads °F or °C (`lib/profile.ts` US/Metric);
  // null while the me read lands reads fahrenheit, the `toProfile`
  // default in `lib/mapping.ts`.
  const unit = profile?.temperatureUnit ?? "fahrenheit";

  if (status === "loading" || !data) {
    return <LoadingBlock label="Getting the forecast" />;
  }
  if (status === "offline") {
    return <OfflineBlock onRetry={retry} />;
  }
  if (status === "error") {
    return (
      <InlineError message="Couldn't load the forecast" onRetry={retry} />
    );
  }

  if (!data.available) {
    return (
      <Text className="text-center font-body text-base text-ink opacity-60">
        {data.message ?? "No forecast available for this trip."}
      </Text>
    );
  }

  const rows = prepareWeatherDays(
    data.forecasts ?? [],
    todayIn(timeZone),
  );

  if (rows.length === 0) {
    return (
      <Text className="font-body text-base text-ink opacity-60">
        No forecast days left on this trip.
      </Text>
    );
  }

  const foot = forecastUpdatedWording(data.fetchedAt);

  return (
    <View className="gap-6">
      <RuledRows>
        {rows.map((row) => (
          <Pressable
            key={row.date}
            role="button"
            onPress={() =>
              router.push(
                `/trips/weather/detail?id=${tripId}&day=${row.date}`,
              )
            }
            className={motion.rowOnGravel}
            accessibilityLabel={`${row.label}, ${row.condition}`}
          >
            <View className="gap-1 py-3">
              <Text className="font-body text-base text-ink">
                {row.label} · {row.condition} · {formatTemp(row.high, unit)}/
                {formatTemp(row.low, unit)} · {row.precipitationProbability}%
              </Text>
            </View>
          </Pressable>
        ))}
      </RuledRows>
      {foot ? (
        <Text className="font-body text-sm text-ink opacity-60">{foot}</Text>
      ) : null}
    </View>
  );
}
