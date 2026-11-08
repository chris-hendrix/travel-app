import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";

import NotFound from "@/app/+not-found";
import { TripGate } from "@/components/trip/TripGate";
import { Badge } from "@/components/ui/Badge";
import { Fact } from "@/components/ui/Fact";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { QuietAction } from "@/components/ui/QuietAction";
import { RuledBlock } from "@/components/ui/RuledBlock";
import { RuledRows } from "@/components/ui/RuledRows";
import { useDismissTo } from "@/hooks/useDismiss";
import { formatDay } from "@/lib/dateRange";
import { useProfile } from "@/lib/profileStore";
import { useTripWeather } from "@/lib/queries/weather";
import { todayIn } from "@/lib/timezone";
import { useTrip } from "@/lib/tripsStore";
import {
  compassWord,
  conditionHue,
  conditionWord,
  dayStep,
  formatHour12,
  formatTemp,
  formatWind,
  hourlySampleForDay,
  prepareWeatherDays,
} from "@/lib/weather";

/**
 * One forecast day, opened from the list: the high as the numeral, the
 * condition word under it, the daily facts, and the six-row hourly
 * profile.
 *
 * A dialog rather than a panel, for the same reason a row press on the
 * list is a route change: the day is a record with an address
 * (`?id=&day=`), and the dialog holds its one shape instead of two.
 * There is no primary verb — nothing about weather is authored anywhere
 * — so the bar carries nothing, and Prev/Next step the `&day=` param via
 * `router.replace`, disabling at the ends rather than wrapping.
 */
export default function TripWeatherDay() {
  return (
    <TripGate label="Loading the forecast">
      <TripWeatherDayDialog />
    </TripGate>
  );
}

function TripWeatherDayDialog() {
  const { id, day } = useLocalSearchParams<{ id?: string; day?: string }>();

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  const dayParam = typeof day === "string" && day.length > 0 ? day : null;

  const listHref = trip ? `/trips/weather?id=${trip.id}` : "/trips";
  // Above the guards: a hook called after a return is a hook called a
  // different number of times.
  const dismissToList = useDismissTo(listHref);

  if (!trip) {
    return <NotFound />;
  }

  return (
    <FullscreenDialog
      // The title is the dialog's, not the day's: the body's hero names
      // the date once, at display weight, and a header that repeats it
      // two sizes smaller is the same words twice on one screen.
      title="Weather"
      dismissHref={listHref}
    >
      <WeatherDayDetail
        tripId={trip.id}
        timeZone={trip.preferredTimezone}
        day={dayParam}
        onDismissToList={() => dismissToList()}
      />
    </FullscreenDialog>
  );
}

/**
 * The day's read: the query, the list's rows for stepping, and the one
 * day those rows name.
 *
 * The failure states are blocks of their own — the SettleLedger bargain
 * — never a blank sheet. The server's `available: false` reads the same
 * way it does on the list: the message in place of the day. A day the
 * rows do not name is gone (a link to one that never existed, or a
 * forecast that moved since), and says so with a Done back to the list.
 */
function WeatherDayDetail({
  tripId,
  timeZone,
  day,
  onDismissToList,
}: {
  tripId: string;
  timeZone: string;
  day: string | null;
  onDismissToList: () => void;
}) {
  const router = useRouter();
  const { profile } = useProfile();
  const { data, status, retry } = useTripWeather(tripId);
  // The profile setting reads °F or °C (`lib/profile.ts` US/Metric);
  // null while the me read lands reads fahrenheit, the `toProfile`
  // default in `lib/mapping.ts`.
  const unit = profile?.temperatureUnit ?? "fahrenheit";

  if (status === "loading" || !data) {
    return <LoadingBlock label="Loading the forecast" />;
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

  // The list dropped every day: the forecast has nothing left, and a
  // stepper over no rows steps nowhere.
  if (rows.length === 0 || !day) {
    return (
      <View className="gap-4">
        <Text className="font-body text-base text-ink">
          {rows.length === 0
            ? "No forecast days left on this trip."
            : "That day is not in this forecast any more."}
        </Text>
        <QuietAction label="Done" onPress={onDismissToList} />
      </View>
    );
  }

  // The day the rows do not name: a stale link, or a forecast that moved
  // since the list was read. Done walks to the list however deep this
  // sheet sits in the stack.
  if (!rows.some((row) => row.date === day)) {
    return (
      <View className="gap-4">
        <Text className="font-body text-base text-ink">
          That day is not in this forecast any more.
        </Text>
        <QuietAction label="Done" onPress={onDismissToList} />
      </View>
    );
  }

  const forecast =
    (data.forecasts ?? []).find((candidate) => candidate.date === day) ??
    null;
  if (!forecast) {
    return (
      <View className="gap-4">
        <Text className="font-body text-base text-ink">
          That day is not in this forecast any more.
        </Text>
        <QuietAction label="Done" onPress={onDismissToList} />
      </View>
    );
  }

  const prev = dayStep(rows, day, -1);
  const next = dayStep(rows, day, 1);
  const sample = hourlySampleForDay(data.hourly ?? [], day);

  const stepTo = (target: string) => {
    router.replace({
      pathname: "/trips/weather/detail",
      params: { id: tripId, day: target },
    });
  };

  return (
    <View className="gap-6">
      {/* The hero leads — the day is the subject, and a reader who lands
          from the list is asking which day, not asking to leave it. The
          date over the day's high, pinned — never a mid temp — with the
          condition chip under it; the header band says Weather, the
          dialog's own name in the wayfinding weight. The numeral is the
          stimulant; the chip carries the theme (warm fair band, cool
          foul one), and its word still classifies the sky. */}
      <View className="items-center gap-2">
        <Text className="font-display-semibold text-heading-lg text-ink">
          {formatDay(day)}
        </Text>
        <Text className="font-display-extrabold text-display-lg text-ink">
          {formatTemp(forecast.temperatureMax, unit)}
        </Text>
        <Badge
          variant="category"
          size="md"
          hue={conditionHue(forecast.weatherCode)}
          label={conditionWord(forecast.weatherCode)}
        />
      </View>

      {/* Prev/Next step the `&day=` param and disable at the ends — a
          wrap would read as an infinite list the data does not have.
          The words name their own direction; the aria label names the
          day each one lands on. They ride under the hero, above the
          columns: navigation answers identity. */}
      <View className="flex-row items-center justify-between">
        {prev ? (
          <QuietAction
            label="Previous day"
            ariaLabel={`Previous day, ${formatDay(prev)}`}
            onPress={() => stepTo(prev)}
          />
        ) : (
          <Text className="py-3 font-body-bold text-sm text-ink opacity-40">
            Previous day
          </Text>
        )}
        {next ? (
          <QuietAction
            label="Next day"
            ariaLabel={`Next day, ${formatDay(next)}`}
            onPress={() => stepTo(next)}
          />
        ) : (
          <Text className="py-3 font-body-bold text-sm text-ink opacity-40">
            Next day
          </Text>
        )}
      </View>

      {/* Wide screens read two columns: the day's facts on the left,
          its six-hour profile on the right — the composition a weather
          page has on a desk, filling the scaffold's 960px column instead
          of hanging values off one edge of it. Phones (under md) keep
          the single column the thumb reads. */}
      <View className="gap-6 md:flex-row md:items-start md:gap-8">
        <View className="gap-6 md:flex-1">
          <DailyFacts
            unit={unit}
            high={forecast.temperatureMax}
            low={forecast.temperatureMin}
            feelsMax={forecast.apparentTemperatureMax}
            feelsMin={forecast.apparentTemperatureMin}
            precipitationProbability={forecast.precipitationProbability}
            windSpeedMax={forecast.windSpeedMax}
            windDirection={forecast.windDirectionDominant}
            uvIndexMax={forecast.uvIndexMax}
            sunrise={forecast.sunrise}
            sunset={forecast.sunset}
          />
        </View>

      {/* The day's profile at six destination-clock hours — a profile,
          not a log. One line each: the 12-hour time and the condition
          chip on the left, the temp in ink with the precip chance quiet
          after it on the right — the numeral reads first. Humidity, dew,
          wind, and UV live in the daily facts, not per hour. */}
        <View className="md:flex-1">
          {sample.length > 0 ? (
            // Title-less, matching the facts block beside it: the times
            // name themselves (`6 AM`), the facts name themselves (`High`),
            // and one block wearing a word the other lacks is the
            // asymmetry this twin layout is not allowed.
            <RuledBlock>
              <RuledRows>
                {sample.map((row) => (
                  <View
                    key={row.time}
                    className="flex-row items-center justify-between gap-4 py-2"
                    accessibilityLabel={`${formatHour12(row.time)}, ${conditionWord(row.weatherCode)}, ${formatTemp(row.temperature, unit)}, ${row.precipitationProbability}% chance of rain`}
                  >
                    <View className="flex-row items-center gap-2">
                      <Text className="font-body text-sm text-ink">
                        {formatHour12(row.time)}
                      </Text>
                      <Badge
                        variant="category"
                        size="sm"
                        hue={conditionHue(row.weatherCode)}
                        label={conditionWord(row.weatherCode)}
                      />
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Text className="font-body text-sm text-ink">
                        {formatTemp(row.temperature, unit)}
                      </Text>
                      <Text className="font-body text-sm text-ink opacity-60">
                        {row.precipitationProbability}%
                      </Text>
                    </View>
                  </View>
                ))}
              </RuledRows>
            </RuledBlock>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * The day's facts, in one block: the highs and lows first, then the
 * wind and sky, then the sun's two times. A fact that holds nothing is
 * not in the list — the type carries every field, but a read that did
 * not send one still renders rather than crashes.
 */
function DailyFacts({
  unit,
  high,
  low,
  feelsMax,
  feelsMin,
  precipitationProbability,
  windSpeedMax,
  windDirection,
  uvIndexMax,
  sunrise,
  sunset,
}: {
  unit: "celsius" | "fahrenheit";
  high: number | undefined;
  low: number | undefined;
  feelsMax: number | undefined;
  feelsMin: number | undefined;
  precipitationProbability: number | undefined;
  windSpeedMax: number | undefined;
  windDirection: number | undefined;
  uvIndexMax: number | undefined;
  sunrise: string | undefined;
  sunset: string | undefined;
}) {
  const facts: { label: string; value: string }[] = [];
  if (high != null) facts.push({ label: "High", value: formatTemp(high, unit) });
  if (low != null) facts.push({ label: "Low", value: formatTemp(low, unit) });
  if (feelsMax != null || feelsMin != null) {
    facts.push({
      label: "Feels like",
      value: [feelsMax, feelsMin]
        .filter((value) => value != null)
        .map((value) => formatTemp(value as number, unit))
        .join("/"),
    });
  }
  if (precipitationProbability != null) {
    facts.push({ label: "Precip", value: `${precipitationProbability}%` });
  }
  if (windSpeedMax != null) {
    facts.push({
      label: "Wind",
      value:
        windSpeedMax === 0 || windDirection == null
          ? formatWind(windSpeedMax, unit)
          : `${formatWind(windSpeedMax, unit)} ${compassWord(windDirection)}`,
    });
  }
  if (uvIndexMax != null) facts.push({ label: "UV index", value: `${uvIndexMax}` });
  if (sunrise) facts.push({ label: "Sunrise", value: formatHour12(sunrise) });
  if (sunset) facts.push({ label: "Sunset", value: formatHour12(sunset) });

  if (facts.length === 0) return null;

  return (
    <RuledBlock>
      {facts.map((fact) => (
        <Fact key={fact.label} label={fact.label} spread>
          <Text className="font-body text-base text-ink">{fact.value}</Text>
        </Fact>
      ))}
    </RuledBlock>
  );
}
