import { Text, View } from "react-native";
import { Button } from "@/components/ui/Button";

/**
 * A request that failed, where its content would have been.
 *
 * Not a toast and not a dialog: the failure belongs to the block that
 * asked, so it sits inside that block, in a ruled run of its own, with
 * the only action that matters. A message that disappears is not a
 * record, and a failed fetch is exactly the thing a person reads twice:
 * once when it fails, and again when they come back to ask.
 *
 * The message is the caller's sentence about what failed, not the
 * error's. What the fetch threw is for the console; what the person gets
 * is the noun that is missing and the verb that fixes it.
 */
export function InlineError({
  message,
  retryTitle = "Try again",
  onRetry,
}: {
  message: string;
  retryTitle?: string;
  /** Ask again. Omitted when there is nothing to ask, and then the
   *  block is a statement rather than a way back. */
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
