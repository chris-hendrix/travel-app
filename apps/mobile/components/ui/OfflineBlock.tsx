import { Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
/**
 * No connection, where the connection's content would have been.
 *
 * Not a banner pinned to the top of the screen: the failure belongs to
 * the block that asked, so it sits inside that block like InlineError
 * does, and for the same reason. A banner that survives scrolling is a
 * second header, and this system has one header already.
 */
export function OfflineBlock({
  message = "You're offline. Nothing here could be fetched, and nothing you do here will send.",
  retryTitle = "Try again",
  onRetry,
}: {
  message?: string;
  retryTitle?: string;
  onRetry?: () => void;
}) {
  return (
    <View className="gap-4 border-t border-ink pt-6">
      <Text className="font-body text-base leading-snug text-ink">
        {message}
      </Text>
      {onRetry ? (
        <Button title={retryTitle} variant="secondary" onPress={onRetry} />
      ) : null}
    </View>
  );
}
