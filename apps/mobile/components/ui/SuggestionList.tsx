import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  entryAccessibilityLabel,
  type PickerEntry,
} from "@/lib/dropdown";

/** One line of a suggestion list: what is committed, and what is read. */
export type Suggestion = PickerEntry;

/**
 * The suggestion list under a field, as one component.
 *
 * Two fields in this app autocomplete — a place, and a person to invite
 * — and they had drifted into two lists that were nearly the same, each
 * with its own idea of what a row looks like. What they have in common
 * is the whole of the look, so it lives here, and each caller keeps only
 * what is actually its own: whether a pick is a value or an addition.
 *
 * It takes its place in the flow rather than floating over what follows.
 * Floating needs the list to paint above a later sibling, and every View
 * in this app is positioned with z-index 0, so that means a `relative
 * z-10` on whichever section happens to hold the field. That rule has
 * been missed twice already, and it fails silently: the list is simply
 * crossed by the prose below it. A list in the flow cannot be crossed.
 * It also cannot be clipped, which an absolutely positioned child inside
 * a scroll view can be on Android.
 *
 * The cost is that the form moves down when the list opens. Hence the
 * cap: a jump that is always the same height is one the eye can follow,
 * and one that grows with the number of matches is not. Inside the cap
 * the list scrolls itself.
 */
export function SuggestionList({
  suggestions,
  empty,
  onPick,
  footer,
}: {
  suggestions: Suggestion[];
  /** What to say when nothing matches, in the caller's own words. */
  empty: string;
  onPick: (value: string) => void;
  /** Attribution or context below the rows, e.g. the Google Maps mark. */
  footer?: ReactNode;
}) {
  return (
    <ScrollView
      // Five rows. Past that the field it belongs to would be pushed off
      // the screen on a phone.
      className="max-h-56 border border-ink bg-paper"
      nestedScrollEnabled
      // Without this the first tap only closes the keyboard, which reads
      // as the row being unpressable.
      keyboardShouldPersistTaps="handled"
    >
      {suggestions.length === 0 ? (
        <Text className="font-body p-3 text-base text-ink">{empty}</Text>
      ) : (
        suggestions.map((suggestion) =>
          // Status rows (loading, failure) read but never commit.
          suggestion.disabled ? (
            <View
              key={suggestion.value}
              className="border-b border-gravel p-3"
            >
              <Text className="font-body text-base text-ink/60">
                {suggestion.label}
              </Text>
            </View>
          ) : (
            <Pressable
              key={suggestion.value}
              onPress={() => onPick(suggestion.value)}
              accessibilityRole="button"
              accessibilityLabel={entryAccessibilityLabel(suggestion)}
              className="cursor-pointer border-b border-gravel p-3"
            >
              <Text className="font-body-bold text-base text-ink">
                {suggestion.label}
              </Text>
              {suggestion.secondary ? (
                <Text className="font-body text-sm text-ink/70">
                  {suggestion.secondary}
                </Text>
              ) : null}
            </Pressable>
          ),
        )
      )}
      {footer}
    </ScrollView>
  );
}
