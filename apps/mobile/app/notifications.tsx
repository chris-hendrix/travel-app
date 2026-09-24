import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { InlineError } from "@/components/ui/InlineError";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { NotificationRow } from "@/components/notification/NotificationRow";
import { newestFirst, tripFor } from "@/lib/notifications";
import { useNotifications } from "@/lib/notificationsStore";
import { useTrips } from "@/lib/tripsStore";
import { toErrorCopy } from "@/lib/queries/errors";

/**
 * Notifications: invites and trip updates.
 *
 * One list, newest first — unread rows are marked on the row itself
 * (weight plus a strawberry edge), so the list needs no sections. There
 * is no list primitive here: this is the only list of its kind, so the
 * map lives in the screen; if a second one appears, it earns a component
 * then.
 *
 * The list read is the screen (Mockup §5): loading, error, and empty
 * are explicit — the store hook cannot suspend because the header's
 * bell reads it outside any Suspense boundary.
 */
export default function Notifications() {
  const { notifications, markRead, markAllRead, unreadCount, status, error, retry } =
    useNotifications();
  const { trips } = useTrips();

  return (
    <FullscreenDialog
      title="Loading notifications"
      // Nothing to mark until there is something unread. The bar belongs to
      // the scaffold and does not wait for a query, so the action does:
      // measured, Mark all read sat live over a list still saying
      // "Loading notifications".
      primaryTitle={unreadCount > 0 ? "Mark all read" : undefined}
      onPrimary={unreadCount > 0 ? () => void markAllRead() : undefined}
    >
      {status === "pending" ? (
        <LoadingBlock label="Loading notifications" />
      ) : status === "error" ? (
        <NotificationsFailure error={error} onRetry={retry} />
      ) : notifications.length === 0 ? (
        <View className="gap-5 py-10">
          <Text className="font-display text-3xl uppercase leading-tight text-ink">
            Nothing yet
          </Text>
          {/* The empty state names only what the app can open: invites and
              trip updates. "Messages" used to sit in this sentence, but there
              is no chat surface, so it promised a thread the app cannot
              open — the copy rule holds copy to what the app does. */}
          <Text className="font-body text-lg text-ink">
            Invites and trip updates land here.
          </Text>
        </View>
      ) : (
        <View className="border-t border-ink">
          {newestFirst(notifications).map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              // The API sends a trip id; the cover comes from the trips on hand.
              trip={tripFor(trips, notification)}
              // Tapping should open the trip it is about and then mark it
              // read. Trip detail does not exist yet, so for now it only
              // marks read.
              onPress={() => void markRead(notification.id)}
            />
          ))}
        </View>
      )}
    </FullscreenDialog>
  );
}

/**
 * Where the list request failed, in place of the list. Offline renders
 * `OfflineBlock` with its default copy; anything else renders the
 * screen's sentence. Copy is verbatim from the mockup: loading
 * `"Loading notifications"`, error `"Couldn't load"` + `Try again`.
 */
function NotificationsFailure({
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
    <InlineError message={copy.message ?? "Couldn't load"} {...retryProps} />
  );
}
