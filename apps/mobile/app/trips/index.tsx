import { Component, Suspense, useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { Screen } from "@/components/ui/Screen";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { InlineError } from "@/components/ui/InlineError";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { TripCard } from "@/components/trip/TripCard";
import { Grid } from "@/components/ui/Grid";
import { groupTrips } from "@/lib/tripGroups";
import { toErrorCopy } from "@/lib/queries/errors";
import { useTrips } from "@/lib/tripsStore";

/**
 * Design lab: the trips screen under construction.
 *
 * Upcoming first, soonest first. Past below, newest first. The two are
 * separated by a rule rather than year headings — each card carries its
 * own year in the date line.
 */
export default function TripsScreen() {
  return (
    <Screen>
      {/* The list read is the screen: Suspense owns the loading copy
          ("Your trips"), the boundary below owns the failure copy, and
          the content owns the empty state. The root layout's Suspense
          stays as the outer fallback; this boundary makes the copy
          screen-specific. */}
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <TripsErrorBoundary
            onReset={reset}
            fallback={(error, retry) => (
              <TripsFailure error={error} onRetry={retry} />
            )}
          >
            <Suspense fallback={<LoadingBlock label="Your trips" />}>
              <TripsContent />
            </Suspense>
          </TripsErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </Screen>
  );
}

/**
 * Where the list request failed, in place of the list. Offline renders
 * `OfflineBlock` with its default copy; anything else renders the
 * screen's sentence. Copy is verbatim from the mockup: loading
 * `"Your trips"`, error `"Couldn't load your trips"` + `Try again`.
 */
function TripsFailure({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const copy = toErrorCopy(error);
  // `exactOptionalPropertyTypes` is on: only pass `onRetry` when the
  // copy offers a retry, never an explicit `undefined`.
  const retryProps = copy.retry ? { onRetry } : {};
  if (copy.offline) {
    return <OfflineBlock {...retryProps} />;
  }
  return (
    <InlineError
      message={copy.message ?? "Couldn't load your trips"}
      {...retryProps}
    />
  );
}

/**
 * Minimal error boundary: the only one in the app that needs to catch
 * a Suspense query's rejection at the screen level. `onRetry` resets
 * the query boundary (refetch on next render) and clears the caught
 * error in the same tap.
 */
class TripsErrorBoundary extends Component<{
  children: ReactNode;
  onReset: () => void;
  fallback: (error: unknown, retry: () => void) => ReactNode;
}> {
  override state: { error: unknown | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidCatch(error: unknown) {
    console.error("Trips list failed to load.", error);
  }

  retry = () => {
    this.props.onReset();
    this.setState({ error: null });
  };

  override render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.retry);
    }
    return this.props.children;
  }
}

function TripsContent() {
  const router = useRouter();
  const { trips: stored } = useTrips();
  const [empty, setEmpty] = useState(false);

  const trips = empty ? [] : stored;
  const { upcoming, past } = groupTrips(trips, new Date());

  const card = (trip: (typeof stored)[number]) => (
    <TripCard
      key={trip.id}
      trip={trip}
      onPress={() => router.push(`/trips/detail?id=${trip.id}`)}
    />
  );

  return (
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
            onPress={() => router.push("/trips/new")}
          />
        </View>
      ) : null}

      {trips.length === 0 ? (
        <View className="gap-5 py-10">
          <Text className="font-display text-3xl uppercase leading-tight text-ink">
            No trips yet
          </Text>
          <Text className="font-body text-lg text-ink">
            Start a trip, add the dates, and invite everyone. Everyone
            sees the same itinerary as it comes together.
          </Text>
          <View>
            <Button
              title="Create your first trip"
              onPress={() => router.push("/trips/new")}
            />
          </View>
        </View>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <Section title="Upcoming">
              <Grid>{upcoming.map((trip) => card(trip))}</Grid>
            </Section>
          ) : null}
          {past.length > 0 ? (
            <Section title="Past">
              <Grid>{past.map((trip) => card(trip))}</Grid>
            </Section>
          ) : null}
        </>
      )}

    </View>
  );
}
