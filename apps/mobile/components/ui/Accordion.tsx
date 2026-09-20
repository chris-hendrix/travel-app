import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { INK } from "@/lib/theme";

/**
 * Accordion group. Rules only — no card, no fill, no radius. Items carry
 * their own bottom rule; the group supplies the top rule so adjacent
 * items never double up.
 */
export function Accordion({ children }: { children: ReactNode }) {
  return <View className="border-t border-ink">{children}</View>;
}

export function AccordionItem({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = open ? ArrowUp : ArrowDown;

  return (
    <View className="border-b border-ink">
      <Pressable
        aria-expanded={open}
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between gap-4 py-5"
      >
        <Text className="font-body-bold text-xl text-ink">{title}</Text>
        <Icon color={INK} size={24} />
      </Pressable>
      {open ? <View className="pb-5">{children}</View> : null}
    </View>
  );
}
