import { Component, Suspense, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { ActionBar } from "@/components/ui/ActionBar";
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
  const router = useRouter();

  return (
    // The bar is a sibling of the scroll rather than an overlay: the scroll
    // takes the height that is left, so no card is ever behind it and the
    // content needs no bottom padding to escape it.
    <View className="flex-1">
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
      {/* The page's one action, in the system's own foot. It was a box at the
          top of the list, which made the *action* louder than the *content*:
          a seafoam button out-shouted the trip card it sits above. Here it is
          out of the content's way, and the top of the page is free for the
          first section's ground to start at the header.

          Always present, including while the list loads or fails. It is the
          page's action rather than the list's, and a bar that appeared only
          once data arrived would move the page under the reader. */}
      <ActionBar
        primaryTitle="Create trip"
        onPrimary={() => router.push("/trips/new")}
        // A screen's foot, not a dialog's: this bar is a sibling of the
        // scroll, so nothing passes under it and it needs no rule.
        variant="screen"
      />
    </View>
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
          are, and the section rules carry the structure. No button either:
          the page's one action is pinned at the foot, which is why the first
          band below can start at the top of the page. */}
      {trips.length === 0 ? (
        <Band tone="baltic">
          <Column>
        <View className="gap-5">
          <Text className="font-display-bold text-display-sm uppercase text-ink">
            No trips yet
          </Text>
          <Text className="font-body text-body text-ink">
            Start a trip, add the dates, and invite everyone. Everyone
            sees the same itinerary as it comes together.
          </Text>
        </View>
          </Column>
        </Band>
      ) : (
        <>
          {/* `Underway`, not `Now` or `Current`: the card's own badge says
              "underway", and the list and the badge should use one word for
              one state.

              It is the group whose *presence* is information: a trip you
              are on right now is what the app is for, and a band that appears
              only while you are travelling says so. `Upcoming` would have
              been the group that is usually populated, which is an argument
              about how often the colour shows rather than about what deserves
              marking.

              `Upcoming` takes baltic directly under it, so the two grounds
              touch. That is band-against-band, which `design-lint` check 5
              exists to prevent and which the trip page already does once for
              the same reason: the seam is the division between two named
              sections, so it is saying something rather than nothing. The
              exception is written into the check's allow-list. */}
          {current.length > 0 ? (
            <Band tone="lilac">
              <Column>
                <View className="gap-8">
                  <Section title="Underway" rule={false}>
                    <Grid>{current.map((trip) => card(trip))}</Grid>
                  </Section>
                </View>
              </Column>
            </Band>
          ) : null}
          {upcoming.length > 0 ? (
            <Band tone="baltic">
              <Column>
                <View className="gap-8">
                  <Section title="Upcoming" rule={false}>
                    <Grid>{upcoming.map((trip) => card(trip))}</Grid>
                  </Section>
                </View>
              </Column>
            </Band>
          ) : null}
          {/* Past keeps sand: a trip that is over is the one group with
              nothing to say, and the two grounds above it have said it.
              It also drops its rule, which is the third reason it matches
              the two groups above rather than the rest of the app. Every
              division on this page is a change of ground — lilac to
              baltic, baltic to sand — so the baltic band's lower edge is
              already the seam above Past. The rule was the one mark on the
              page saying what both of those say, which is the argument the
              trip hero used when it deleted its page rule for the same
              reason. With current and upcoming both empty, Past is the only
              block on the page and has nothing to divide from, so the rule
              would be a mark saying nothing there too. */}
          <Column>
            <View className="gap-8">
          {past.length > 0 ? (
            <Section title="Past" rule={false}>
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
