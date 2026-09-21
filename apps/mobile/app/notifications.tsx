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
 * Notifications: invites, messages, itinerary changes.
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
  const { notifications, markRead, markAllRead, status, error, retry } =
    useNotifications();
  const { trips } = useTrips();

  return (
    <FullscreenDialog
      title="Notifications"
      primaryTitle="Mark all read"
      onPrimary={() => void markAllRead()}
    >
      {status === "pending" ? (
        <LoadingBlock label="Notifications" />
      ) : status === "error" ? (
        <NotificationsFailure error={error} onRetry={retry} />
      ) : notifications.length === 0 ? (
        <View className="gap-5 py-10">
          <Text className="font-display text-3xl uppercase leading-tight text-ink">
            Nothing yet
          </Text>
          <Text className="font-body text-lg text-ink">
            Invites, messages, and itinerary changes land here.
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
 * `"Notifications"`, error `"Couldn't load"` + `Try again`.
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
