import { Pressable, Text, View } from "react-native";

/** One line of a suggestion list: what is committed, and what is read. */
export type Suggestion = { value: string; label: string };

/**
 * The suggestion list under a field, as one component.
 *
 * Two fields in this app autocomplete — a place, and a person to invite
 * — and they had drifted into two lists that were nearly the same: one
 * floating over the content, one pushing it down, and each with its own
 * idea of what a row looks like. What they have in common is the whole
 * of the look, so it lives here, and each caller keeps only what is
 * actually its own: whether a pick is a value or an addition.
 *
 * Floating is the default and is what a form wants: the list overlays
 * what follows rather than pushing it down, so the form does not reflow
 * as somebody types, and `top` — the field's own height, measured by the
 * caller — says where the field ends.
 *
 * A caller can ask for it inline instead, and one does: where the next
 * thing below the field is another field, an overlay lands on that
 * field's label and the block below paints over the list's edge, so the
 * label wears the list's border like a strikethrough. A list that takes
 * its place in the flow cannot do that.
 */
export function SuggestionList({
  suggestions,
  top,
  empty,
  onPick,
  floating = true,
}: {
  suggestions: Suggestion[];
  /** The field's height: where this list begins, when it floats. */
  top?: number;
  /** What to say when nothing matches, in the caller's own words. */
  empty: string;
  onPick: (value: string) => void;
  /** Overlay what follows, or take a place in the flow. */
  floating?: boolean;
}) {
  const floats = floating && top !== undefined;

  return (
    <View
      className={`border border-ink bg-paper ${
        floats ? "absolute left-0 right-0 z-50" : ""
      }`}
      {...(floats ? { style: { top } } : {})}
    >
      {suggestions.length === 0 ? (
        <Text className="font-body p-3 text-base text-ink">{empty}</Text>
      ) : (
        suggestions.map((suggestion) => (
          <Pressable
            key={suggestion.value}
            onPress={() => onPick(suggestion.value)}
            accessibilityRole="button"
            accessibilityLabel={suggestion.label}
            className="cursor-pointer border-b border-gravel p-3"
          >
            <Text className="font-body text-base text-ink">
              {suggestion.label}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}
