import { Image, Pressable, Text, View } from "react-native";
import type { Trip } from "@/components/trip/TripCard";
import { relativeTime, type Notification } from "@/lib/notifications";

/**
 * One notification. A pattern, not a primitive: it knows about trips and
 * read state, and there is one of it.
 *
 * The server's `title` is the eyebrow and its `body` is the message, so
 * everything the row shows comes off the wire. The eyebrow clamps to one
 * line — titles like "Los Picos Trail - Today's Schedule" are written for
 * a push notification, not for a 300px column.
 *
 * The cover is the client's lookup — the API sends a bare `tripId` — so
 * a notification about a trip this person has left simply renders
 * without one.
 *
 * Unread is carried by weight and a strawberry edge, never by fading
 * the type. There is no muted-text token, and a dimmed row would read as
 * disabled rather than read. The edge is transparent when read so the
 * covers stay flush down the column.
 *
 * Rules, not cards: no fill, no radius, matching the accordion.
 */
export function NotificationRow({
  notification,
  trip,
  onPress,
}: {
  notification: Notification;
  trip?: Trip | undefined;
  onPress?: () => void;
}) {
  const unread = notification.readAt === null;

  return (
    <Pressable
      onPress={onPress}
      aria-label={notification.body}
      className={`flex-row items-center gap-4 border-b border-b-ink border-l-4 py-4 pl-4 pr-2 ${
        unread ? "border-l-strawberry" : "border-l-transparent"
      }`}
    >
      {trip ? (
        <Image
          source={{ uri: trip.image }}
          resizeMode="cover"
          className="h-18 w-18"
        />
      ) : null}
      <View className="flex-1 gap-1">
        <Text
          numberOfLines={1}
          className="font-body-bold text-xs uppercase tracking-widest text-ink"
        >
          {notification.title}
        </Text>
        <Text
          numberOfLines={2}
          className={`text-lg leading-snug text-ink ${
            unread ? "font-body-bold" : "font-body"
          }`}
        >
          {notification.body}
        </Text>
        <Text className="font-body text-sm text-ink">
          {relativeTime(notification.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}
