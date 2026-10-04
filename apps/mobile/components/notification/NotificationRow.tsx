import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import type { Trip } from "@/components/trip/TripCard";
import { PlaceholderImage } from "@/components/ui/PlaceholderImage";
import { useMotion } from "@/hooks/useMotion";
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
 * Not a card: no fill, no radius, and no rule either. This is a LIST —
 * rows group by proximity alone, so `py-4` is the separator and the
 * strawberry edge is the only mark on the screen.
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
  const motion = useMotion();

  return (
    <Pressable
      onPress={onPress}
      // A LIST row: no rule. The rows group by proximity alone — `py-4`
      // is the whole separator. The `border-l-4` is not structure, it is
      // state: it reports that the notification is unread.
      className={`flex-row items-center gap-4 border-l-4 py-4 pl-4 pr-2 ${
        unread ? "border-l-strawberry" : "border-l-transparent"
      } ${motion.row}`}
    >
      {trip ? (
        trip.image ? (
          <Image
            source={{ uri: trip.image }}
            contentFit="cover"
            cachePolicy="memory-disk"
            className="h-18 w-18"
          />
        ) : (
          <View className="h-18 w-18">
            <PlaceholderImage kind="trip" />
          </View>
        )
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
