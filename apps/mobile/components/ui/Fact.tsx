import type { ReactNode } from "react";
import { Text, View } from "react-native";

/**
 * One fact, as a ruled row: the noun the reader is looking for in the
 * quiet column, the answer in ink.
 *
 * The column is as wide as the longest noun the app carries, and it is
 * fixed rather than sized to its content: every row's answer then starts
 * on the same line down a block, which is the whole reason the noun sits
 * in a column of its own. That noun is `Flight number`, the travel
 * sheet's — the longest word in these rows since `Temperature` became
 * `Units` on the admin record (see `lib/profile.ts`) and left `Check out`
 * at nine characters.
 *
 * 80px fits `Check out` and broke the longer label mid-word ("Temperat" /
 * "ure") on a 390px screen, because a `<Text>` with no room breaks
 * wherever it must rather than at a word. 112px then held `Flight
 * number` by 0.6px — 13 cells of Space Mono at 14px is 111.4px — which
 * is not a fit at all: the label wears Tailwind's `text-sm`, and the
 * app's own 14px step carries +0.02em tracking, 3.6px over this noun,
 * which the sheet was seen wrapping in that width. 120px is the smallest
 * step of the width scale that clears the noun by half a cell of the
 * face once that tracking is on it, and the widest one that leaves the
 * travel sheet's own `Fri Dec 11 · 12:00 PM` on one line at 390px; the
 * answers give up 8 of a phone's 342px for it, and every other noun here
 * is a dozen cells or less, so none of them notices either way
 * (`__tests__/fact-column.test.ts` holds the arithmetic).
 */
export function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View className="flex-row gap-4">
      <Text className="w-30 shrink-0 font-body text-sm text-ink opacity-60">
        {label}
      </Text>
      <View className="flex-1 gap-1">{children}</View>
    </View>
  );
}
