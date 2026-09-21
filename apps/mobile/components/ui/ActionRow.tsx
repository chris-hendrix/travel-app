import type { ReactNode } from "react";
import { View } from "react-native";

/**
 * The foot of a form: its one button, and the quiet words that go with
 * it.
 *
 * Stacked on a phone, where the button fills the width and a word under
 * it is a word under it. One row from md up, where there is space to
 * spare and a footer is easier to read as one group.
 *
 * The button comes first, which is the opposite of the desktop habit of
 * putting the secondary action on the left. The reason is the alignment
 * rule: a content button hugs the start edge so that it lines up with
 * the fields above it, and anything sharing its row has to come after
 * it or the button stops being on that edge.
 *
 * Not the same thing as `ActionBar`, which is a dialog's pinned bar and
 * holds one action only. This is part of the form, and it scrolls with
 * it.
 */
export function ActionRow({ children }: { children: ReactNode }) {
  return (
    <View className="gap-5 md:flex-row md:items-center md:gap-8">
      {children}
    </View>
  );
}
