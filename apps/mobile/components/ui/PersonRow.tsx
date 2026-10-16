import type { ReactNode } from "react";
import { Text, View } from "react-native";

/**
 * A person's row, read across: the name with whatever chips belong beside
 * it, one line of detail under it, and one fact at the far edge.
 *
 * Extracted from the roll call's own row (`components/trip/RosterList.tsx`)
 * rather than invented. The travel board's row is this row now — a person,
 * their mode, their where, their when — and two hand-written rows that
 * "happen to" match is exactly the drift the lab was written against. The
 * two call sites are the roster and the board; the roster keeps its footer,
 * its press target and its own far column, because those are the screen's
 * decisions, and this component decides the row's *shape*.
 *
 * **The mark lands on the row's own wrapper, and `className` is why that
 * slot exists.** `RuledRows` hands a table row its soft rule as a class,
 * and the rule belongs to the row's measure rather than to a press target:
 * the row's own size must not change with a permission. So the class is
 * merged onto the wrapper `RuledRows` rules, never onto a `Pressable` a
 * caller wraps around it, and `__tests__/ruled-block.test.ts` reads this
 * file off disk to hold it there.
 *
 * **No press inside it.** Each caller knows what its row opens — the
 * roster's person dialog, the board's travel detail — so a caller that
 * needs a press wraps the body in its own `Pressable`. A pressable nested
 * in a pressable answers two presses out of one box and reads as one
 * control to anything announcing the tree.
 *
 * The name and the detail are one line each (`numberOfLines={1}`) unless
 * the caller says otherwise: a row read across has a far column to protect,
 * and a name that wraps pushes that column into a second line of its own.
 * That is the board's row, and the members list is the other answer — it
 * wrapped a long name before this row was extracted from it and must go on
 * wrapping — so the cap is `truncate`, and the two lines move together
 * because neither call site has ever capped one and not the other.
 */
export function PersonRow({
  name,
  chips,
  detail,
  far,
  className,
  truncate = true,
}: {
  name: string;
  /**
   * Beside the name, and wrapping under it when the line runs out — unless
   * the row caps its lines, in which case the name gives way instead and
   * the chips keep the line. See the note on `nameClass`.
   */
  chips?: ReactNode;
  /** The line under the name: a number, a place. Null when there is none. */
  detail?: string | null;
  /** The far column: one fact, read down the page. */
  far: string;
  /**
   * The table's mark, handed down by `RuledRows`. It lands on the row's
   * own wrapper rather than on a press target, because the row's own
   * measure must not change with a permission.
   */
  className?: string | undefined;
  /**
   * Whether the name and the detail stop at one line each. True by
   * default, which is the board's row: its far column is a day and a
   * clock, and a name that wraps pushes it down. The members list passes
   * `false`, because the row it drew before this component existed capped
   * neither line and the extraction is meant to be invisible there.
   */
  truncate?: boolean;
}) {
  // `undefined` is React Native's own "as many lines as it takes".
  const lines = truncate ? 1 : undefined;
  // **A capped line has to be allowed to give way, or the cap is
  // decorative.** The name and the chips share a line, so a name too wide
  // for its column pushes the chip onto a second line rather than
  // truncating — and the row's shape then depends on how long someone's
  // name is. That is how the travel board read before this: `Carol
  // Martinez` with the chip beneath her and `Eve Chen` with hers beside,
  // decided by name length alone, on a margin of a few pixels.
  //
  // Two things had to change, and the first is the one that looks
  // innocent. **Wrapping beats shrinking**: a wrapped line is broken before
  // any `flex-shrink` is consulted, so a name that is allowed to give way
  // still pushes the chip down while `flex-wrap` is on. So a capped row
  // turns wrapping *off* and lets the name shrink instead; the roster,
  // which wraps its chips on purpose, keeps it on.
  //
  // The other two properties each matter on one platform: `min-w-0`,
  // because a flex item refuses to shrink below its own content
  // (`components/ui/TextField.tsx` carries the same note), and `shrink`,
  // because React Native's own default is not to shrink at all.
  const nameClass = [
    "font-body-bold text-base text-ink",
    truncate ? "min-w-0 shrink" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <View className={[ROW_BODY, className].filter(Boolean).join(" ")}>
      <View className="flex-1 gap-1">
        <View
          className={`flex-row items-center gap-3${truncate ? "" : " flex-wrap"}`}
        >
          <Text numberOfLines={lines} className={nameClass}>
            {name}
          </Text>
          {chips}
        </View>
        {detail ? (
          <Text numberOfLines={lines} className="font-body text-sm text-ink">
            {detail}
          </Text>
        ) : null}
      </View>
      <Text className="font-body text-sm text-ink">{far}</Text>
    </View>
  );
}

/**
 * The row's own body: one line, the person's name and chips on the left,
 * the far fact on the right, and the vertical space that belongs to the
 * row rather than to the mark above it. It was one string written twice —
 * once per row kind — and the merge is what leaves one.
 */
const ROW_BODY = "flex-row items-center justify-between gap-4 py-3";
