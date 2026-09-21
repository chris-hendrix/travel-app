import type { ReactNode } from "react";
import { Text, View } from "react-native";

/**
 * A titled block of a screen or a dialog, ruled off from the one above.
 *
 * The rule is the point. A screen here is a stack of ruled blocks, and the
 * rule is what says where one ends: it sits on top of the block rather
 * than under it, so a stack of them shares its rules instead of doubling
 * them at every boundary.
 *
 * The heading wears the display face at the size a block heading wears.
 * One block on the landing is deliberately not this component: its
 * sections are tables of rows, closed by a rule underneath and set at the
 * hero's own scale, which is a different block rather than a variant of
 * this one. Folding it in would mean two props serving one caller.
 */
export function Section({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <View className="gap-5 border-t border-ink pt-6">
      <Text className="font-display text-xl uppercase leading-none text-ink">
        {title}
      </Text>
      {children}
    </View>
  );
}
