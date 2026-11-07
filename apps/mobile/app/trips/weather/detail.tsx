import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";

import NotFound from "@/app/+not-found";
import { TripGate } from "@/components/trip/TripGate";
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
  conditionWord,
  dayStep,
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
      title={dayParam ? formatDay(dayParam) : "Weather"}
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
      {/* Prev/Next step the `&day=` param and disable at the ends — a
          wrap would read as an infinite list the data does not have.
          The words name their own direction; the aria label names the
          day each one lands on. */}
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

      {/* The hero: the day's high, pinned — never a mid temp — with the
          condition word under it. The numeral is the stimulant; no band,
          no color, nothing classifies the sky. */}
      <View className="items-center gap-1">
        <Text className="font-display-extrabold text-display-lg text-ink">
          {formatTemp(forecast.temperatureMax, unit)}
        </Text>
        <Text className="font-body text-base text-ink">
          {conditionWord(forecast.weatherCode)}
        </Text>
      </View>

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

      {/* The day's profile at six destination-clock hours — a profile,
          not a log. Every field the API carries per hour, one compact
          row each, in `text-sm` so all eight read at a phone's 390px. */}
      {sample.length > 0 ? (
        <RuledBlock title="Hourly">
          <RuledRows>
            {sample.map((row) => (
              <Text
                key={row.time}
                className="py-2 font-body text-sm text-ink"
                accessibilityLabel={`${row.time.slice(11, 16)}, ${conditionWord(row.weatherCode)}`}
              >
                {[
                  row.time.slice(11, 16),
                  conditionWord(row.weatherCode),
                  formatTemp(row.temperature, unit),
                  formatWind(row.windSpeed, unit),
                  `${row.humidity}%`,
                  formatTemp(row.dewPoint, unit),
                  `${row.precipitationProbability}%`,
                  `UV ${row.uvIndex}`,
                ].join(" · ")}
              </Text>
            ))}
          </RuledRows>
        </RuledBlock>
      ) : null}
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
        .join(" / "),
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
  if (sunrise) facts.push({ label: "Sunrise", value: sunrise });
  if (sunset) facts.push({ label: "Sunset", value: sunset });

  if (facts.length === 0) return null;

  return (
    <RuledBlock>
      {facts.map((fact) => (
        <Fact key={fact.label} label={fact.label}>
          <Text className="font-body text-base text-ink">{fact.value}</Text>
        </Fact>
      ))}
    </RuledBlock>
  );
}
