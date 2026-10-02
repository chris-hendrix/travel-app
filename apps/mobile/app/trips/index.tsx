import { Component, Suspense, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
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
import { Band } from "@/components/ui/Band";
import { Column } from "@/components/ui/Column";

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
          ("Loading your trips"), the boundary below owns the failure copy, and
          the content owns the empty state. The root layout's Suspense
          stays as the outer fallback; this boundary makes the copy
          screen-specific.

          **No column here.** The content owns its own, because a band inside
          a column is not a band — and this screen has two of them. The
          fallbacks are not bands, so they keep a column of their own. */}
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <TripsErrorBoundary
            onReset={reset}
            fallback={(error, retry) => (
              <Column>
                <TripsFailure error={error} onRetry={retry} />
              </Column>
            )}
          >
            <Suspense
              fallback={
                <Column>
                  <LoadingBlock label="Loading your trips" />
                </Column>
              }
            >
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
 * `"Loading your trips"`, error `"Couldn't load your trips"` + `Try again`.
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
  const { trips } = useTrips();
  const { current, upcoming, past } = groupTrips(trips, new Date());


  const card = (trip: (typeof trips)[number]) => (
    <TripCard
      key={trip.id}
      trip={trip}
      onPress={() => router.push(`/trips/detail?id=${trip.id}`)}
    />
  );

  return (
    <View>
      {/* No page heading: the app wordmark bar already says where you
          are, and the section rules carry the structure. The button keeps
          its own column above the bands — it is the page's one action and
          the top is where it is looked for. */}
      {trips.length > 0 ? (
        <Column>
          <View className="gap-8 pb-6 pt-6 md:pb-10 md:pt-10">
            <Button
              title="Create trip"
              onPress={() => router.push("/trips/new")}
            />
          </View>
        </Column>
      ) : null}

      {trips.length === 0 ? (
        <Band tone="baltic">
          <Column>
        <View className="gap-5 py-6 md:py-10">
          <Text className="font-display-bold text-display-sm uppercase text-ink">
            No trips yet
          </Text>
          <Text className="font-body text-body text-ink">
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
          </Column>
        </Band>
      ) : (
        <>
          {/* `Underway`, not `Now` or `Current`: the card's own badge says
              "underway", and the list and the badge should use one word for
              one state.

              It is the one group with a ground, and it is the only group
              whose *presence* is information: a trip you are on right now is
              what the app is for, and a band that appears only while you are
              travelling says so. `Upcoming` would have been the group that is
              usually populated, which is an argument about how often the
              colour shows rather than about what deserves marking. */}
          {current.length > 0 ? (
            <Band tone="lilac">
              <Column>
                <View className="gap-8 py-6 md:py-10">
                  <Section title="Underway">
                    <Grid>{current.map((trip) => card(trip))}</Grid>
                  </Section>
                </View>
              </Column>
            </Band>
          ) : null}
          <Column>
            <View className="gap-8 pb-6 pt-6 md:pb-10 md:pt-10">
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
            </View>
          </Column>
        </>
      )}
    </View>
  );
}
