import { Component, Suspense, type ReactNode } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { InlineError } from "@/components/ui/InlineError";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import NotFound from "@/app/+not-found";
import { toErrorCopy } from "@/lib/queries/errors";

/**
 * The screen gate for a single-trip read (`useTrip(id)`), copying the
 * trips list gate in `app/trips/index.tsx`: Suspense owns the loading
 * copy, the boundary below owns the failure copy, and the content owns
 * the empty state.
 *
 * A 404 passes through `toErrorCopy` with no message — the id names
 * nothing — so the gate answers with the exact not-found state a bad
 * `tripFor` lookup gave (`"Nothing here"`), never an error block.
 * Offline renders `OfflineBlock`; anything else renders the screen's
 * sentence with a retry.
 */
export function TripGate({
  label,
  children,
}: {
  /** What is loading, never "Loading…" on its own. */
  label: string;
  children: ReactNode;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <TripErrorBoundary
          onReset={reset}
          fallback={(error, retry) => (
            <TripFailure error={error} onRetry={retry} />
          )}
        >
          <Suspense fallback={<LoadingBlock label={label} />}>
            {children}
          </Suspense>
        </TripErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

function TripFailure({
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
  if (copy.message === null) {
    return <NotFound />;
  }
  return (
    <InlineError
      message={copy.message ?? "Couldn't load this trip"}
      {...retryProps}
    />
  );
}

/**
 * Minimal error boundary: catches a Suspense query's rejection at the
 * screen level. `onRetry` resets the query boundary (refetch on next
 * render) and clears the caught error in the same tap.
 */
class TripErrorBoundary extends Component<{
  children: ReactNode;
  onReset: () => void;
  fallback: (error: unknown, retry: () => void) => ReactNode;
}> {
  override state: { error: unknown | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidCatch(error: unknown) {
    console.error("Trip detail failed to load.", error);
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
