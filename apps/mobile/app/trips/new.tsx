import { useEffect, useMemo, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { TextField } from "@/components/ui/TextField";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import type { Selection } from "@/lib/calendar";
import { formatDateRange } from "@/lib/dateRange";
import { validateNewTrip, type NewTripInput } from "@/lib/newTrip";
import { useTrips } from "@/lib/tripsStore";
import { toErrorCopy } from "@/lib/queries/errors";
import {
  toPlaceOption,
  usePlaceDetails,
  usePlaceSessionToken,
  usePlaceSuggestions,
} from "@/lib/queries/places";
import { PLACES } from "@/lib/placeSuggestions";

export default function NewTrip() {
  const { addTrip } = useTrips();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState<string | null>(null);
  const [dates, setDates] = useState<Selection>({ start: null, end: null });
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Live Places suggestions sit above the static list; offline, an
  // empty key, or a 503 falls back to `PLACES` silently, and the
  // required-pick still accepts a static pick. The field keeps the
  // display string only — the trip carries no lat/lon.
  const [search, setSearch] = useState("");
  const [sessionToken, rotateSessionToken] = usePlaceSessionToken();
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    null,
  );
  const { data: suggestions } = usePlaceSuggestions(search, sessionToken);
  const details = usePlaceDetails(selectedPlaceId, sessionToken);
  const liveById = useMemo(
    () => new Map((suggestions ?? []).map((s) => [s.placeId, s])),
    [suggestions],
  );
  const placeOptions = useMemo(
    () =>
      suggestions?.length ? suggestions.map(toPlaceOption) : PLACES,
    [suggestions],
  );

  // Details only canonicalize the committed label (and close the
  // input session) — they never block submit.
  useEffect(() => {
    if (!selectedPlaceId) return;
    if (details.data?.placeId === selectedPlaceId) {
      setLocation(details.data.name);
    }
    if (details.data?.placeId === selectedPlaceId || details.isError) {
      rotateSessionToken();
    }
  }, [details.data, details.isError, selectedPlaceId, rotateSessionToken]);

  // One tap is a day trip, so a start with no end closes on itself.
  const input: NewTripInput = {
    title,
    location: location ?? "",
    startDate: dates.start ?? "",
    endDate: dates.end ?? dates.start ?? "",
  };

  const errors = submitted ? validateNewTrip(input) : {};

  async function create() {
    setSubmitted(true);
    setFailure(null);
    if (Object.keys(validateNewTrip(input)).length > 0) return;

    // No client-side id: the trip's identity comes back from
    // `POST /trips`, and success lands on its detail screen.
    setBusy(true);
    try {
      const trip = await addTrip({
        name: input.title.trim(),
        destination: input.location.trim(),
        // The create schema requires a timezone; the device's zone
        // stands in until the trip has a place, as `buildTrip` did.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      router.replace(`/trips/detail?id=${trip.id}`);
    } catch (caught) {
      // The failure reads at the submit area (the lab's Feedback rule:
      // it belongs where its content would have been — the new trip),
      // mapped through the same copies every other screen uses.
      const copy = toErrorCopy(caught);
      if (copy.offline) {
        setFailure("You're offline. Check your connection and try again.");
      } else {
        setFailure(
          copy.message ??
            (caught instanceof Error ? caught.message : "Couldn't create the trip."),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <FullscreenDialog
      title="Create trip"
      primaryTitle={busy ? "Creating trip" : "Create trip"}
      onPrimary={() => void create()}
      primaryDisabled={busy}
      dismissHref="/trips"
    >
      {/* Modals are routes, presented modally: iOS slides it up and
          allows a swipe-down dismiss, Android maps its hardware back
          to the same dismissal. */}
      <Stack.Screen options={{ presentation: "modal" }} />
      <TextField
        label="Trip name"
        value={title}
        onChangeText={setTitle}
        placeholder="Los Picos Trail"
        error={errors.title}
      />

      {/* TODO(BE): `GET /api/locations/autocomplete` and `/details` do not request `photos[].name` (field masks at `location.routes.ts:88-130`, `:178`), so a picked place has no image reference even though `/locations/photos/:photoRef` exists. */}
      <Dropdown
        label="Where"
        options={placeOptions}
        value={location}
        onSearchText={setSearch}
        onChange={(picked) => {
          const hit = liveById.get(picked);
          if (hit) {
            setSelectedPlaceId(hit.placeId);
            setLocation(hit.name);
          } else {
            setSelectedPlaceId(null);
            setLocation(picked);
            rotateSessionToken();
          }
        }}
        placeholder="Start typing a place…"
        error={errors.location}
      />

      <View className="gap-2">
        <Text className="font-body-bold text-sm text-ink">Dates</Text>
        <DatePicker selection={dates} onChange={setDates} />
        <Text className="font-body text-sm text-ink">
          {dates.start
            ? formatDateRange(input.startDate, input.endDate)
            : "Tap the first day, then the last. One tap is a day trip."}
        </Text>
        {errors.startDate ? (
          <Text className="font-body text-sm text-ink">
            {errors.startDate}
          </Text>
        ) : null}
      </View>

      {failure ? (
        <Text className="font-body text-sm text-ink">{failure}</Text>
      ) : null}

      <View className="gap-1">
        <Text className="font-body-bold text-sm text-ink">
          What happens next
        </Text>
        <Text className="font-body text-sm text-ink">
          The trip appears in Upcoming straight away, empty but yours.
          Accommodation, travel, and events come after.
        </Text>
      </View>
    </FullscreenDialog>
  );
}
