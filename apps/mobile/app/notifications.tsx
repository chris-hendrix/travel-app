import { Text, View } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { NotificationRow } from "@/components/notification/NotificationRow";
import { newestFirst, tripFor } from "@/lib/notifications";
import { useNotifications } from "@/lib/notificationsStore";
import { useTrips } from "@/lib/tripsStore";

/**
 * Notifications: invites, messages, itinerary changes.
 *
 * One list, newest first — unread rows are marked on the row itself
 * (weight plus a strawberry edge), so the list needs no sections. There
 * is no list primitive here: this is the only list of its kind, so the
 * map lives in the screen; if a second one appears, it earns a component
 * then.
 */
export default function Notifications() {
  const { notifications, markRead, markAllRead } = useNotifications();
  const { trips } = useTrips();

  return (
    <FullscreenDialog
      title="Notifications"
      primaryTitle="Mark all read"
      onPrimary={markAllRead}
    >
      {notifications.length === 0 ? (
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
              onPress={() => markRead(notification.id)}
            />
          ))}
        </View>
      )}
    </FullscreenDialog>
  );
}
