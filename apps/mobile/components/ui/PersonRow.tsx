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
 * The name and the detail are one line each (`numberOfLines={1}`): a row
 * read across has a far column to protect, and a name that wraps pushes
 * that column into a second line of its own.
 */
export function PersonRow({
  name,
  chips,
  detail,
  far,
  className,
}: {
  name: string;
  /** Beside the name, and wrapping under it when the line runs out. */
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
}) {
  return (
    <View className={[ROW_BODY, className].filter(Boolean).join(" ")}>
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-3">
          <Text numberOfLines={1} className="font-body-bold text-base text-ink">
            {name}
          </Text>
          {chips}
        </View>
        {detail ? (
          <Text numberOfLines={1} className="font-body text-sm text-ink">
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
