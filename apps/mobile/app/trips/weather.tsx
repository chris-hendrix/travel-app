import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, Pressable, Text, View } from "react-native";

import NotFound from "@/app/+not-found";
import { TripGate } from "@/components/trip/TripGate";
import { Badge } from "@/components/ui/Badge";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineAction } from "@/components/ui/InlineAction";
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
  conditionHueForWord,
  forecastUpdatedWording,
  formatTemp,
  googleWeatherUrl,
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
      <WeatherList
        tripId={trip.id}
        timeZone={trip.preferredTimezone}
        destination={trip.placeName ?? trip.location}
      />
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
  destination,
}: {
  tripId: string;
  timeZone: string;
  destination: string;
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
  const weatherUrl = googleWeatherUrl(destination);

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
            accessibilityLabel={`${row.label}, ${row.condition}, ${formatTemp(row.high, unit)}/${formatTemp(row.low, unit)}, ${row.precipitationProbability}% chance of rain`}
          >
            {/* The row: the day and its chip inline on the left (the
                warm fair band, the cool foul one — the hue is how a scan
                finds the rain days), the numeral pair in ink on the
                right with the precip chance quiet under it — the second
                line gives a dense row some vertical air. */}
            <View className="flex-row items-center justify-between gap-4 py-3">
              <View className="flex-row items-center gap-3">
                <Text className="font-body text-base text-ink">
                  {row.label}
                </Text>
                <Badge
                  variant="category"
                  size="sm"
                  hue={conditionHueForWord(row.condition)}
                  label={row.condition}
                />
              </View>
              <View className="items-end">
                <Text className="font-body text-base text-ink">
                  {formatTemp(row.high, unit)}/{formatTemp(row.low, unit)}
                </Text>
                <Text className="font-body text-sm text-ink opacity-60">
                  {row.precipitationProbability}%
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </RuledRows>
      {/* The foot: the fetched-at wording on the left and, when the
          trip names a destination, the one external door — the Google
          weather card for the place (googleWeatherUrl), pressed as the
          InlineAction word because a link to another service is a word
          that presses and has no box. Open-Meteo is our forecast; the
          card is the destination's weather somewhere readers already
          look, so the mark stays quiet and names the service. */}
      {foot || weatherUrl ? (
        <View className="flex-row items-center justify-between gap-4">
          <Text className="font-body text-sm text-ink opacity-60">
            {foot}
          </Text>
          {weatherUrl ? (
            <InlineAction
              label="Google Weather"
              onPress={() => void Linking.openURL(weatherUrl)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
