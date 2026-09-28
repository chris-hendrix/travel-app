import { Pressable, Text, View } from "react-native";

/**
 * The way out of someone else's session, pinned under the chrome.
 *
 * Props, not a hook read, so the lab can exhibit it without inventing
 * a session: the caller (AppHeader) decides whether it renders at all
 * from `impersonating` being null, and applies the `No name` fallback
 * once at the call site. A long name is one line — the band is chrome
 * and chrome does not grow to two rows.
 *
 * The way out is a separate word with its own 44pt box, not a bare
 * word in the sentence: `QuietAction` and `InlineAction` are
 * deliberately boxless (the latter's target is the line rather than
 * 44pt), which is fine inside a sentence and not fine here, where this
 * is the only control. While the swap is in flight the word reads
 * `Stopping…` and the control is disabled, with `role="button"` and
 * `aria-disabled` on the same element — the policy sweep fails any
 * `aria-*` state prop whose own element does not set `role`.
 */
export function ImpersonationBand({
  displayName,
  onStop,
  pending,
}: {
  displayName: string;
  onStop: () => void;
  pending: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between gap-4 bg-strawberry px-6 py-3">
      <Text
        className="font-body-bold text-sm text-ink"
        numberOfLines={1}
      >{`You are ${displayName}.`}</Text>
      <Pressable
        role="button"
        disabled={pending}
        aria-disabled={pending}
        onPress={onStop}
        className="px-4 py-3"
      >
        <Text className="font-body-bold text-sm text-ink underline">
          {pending ? "Stopping…" : "Stop impersonating"}
        </Text>
      </Pressable>
    </View>
  );
}
