import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import type { PushPermission } from "@/lib/push";
import { registerForPush } from "@/lib/push";

/**
 * The push ask, as a state of the notifications list rather than a
 * dialog. Undetermined shows the invitation; denied shows the way
 * back through system settings; granted renders nothing — the list
 * is what it always was. No toast: feedback is the block swapping
 * state in place.
 */
export function PushOptIn({
  permission,
  onGranted,
}: {
  permission: PushPermission;
  onGranted: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (permission === "granted") return null;
  const denied = permission === "denied";
  return (
    <View className="gap-2 border border-gravel bg-paper p-4">
      <Text className="font-display text-xl uppercase text-ink">
        {denied ? "Notifications are off" : "Turn on notifications"}
      </Text>
      <Text className="font-body text-base text-ink">
        {denied
          ? "You turned them off for Journiful. Your phone settings turn them back on."
          : "Invites, replies, and itinerary changes reach this phone."}
      </Text>
      {denied ? (
        <Button title="Open settings" onPress={() => void Linking.openSettings()} />
      ) : (
        <Button
          title={asking ? "Asking" : "Turn on"}
          disabled={asking}
          onPress={() =>
            void (async () => {
              setAsking(true);
              try {
                const token = await registerForPush();
                if (token) onGranted();
              } finally {
                setAsking(false);
              }
            })()
          }
        />
      )}
    </View>
  );
}
