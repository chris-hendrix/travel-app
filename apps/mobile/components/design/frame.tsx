import type { ReactNode } from "react";
import { Text, View } from "react-native";

/*
 * The lab's own documentation frame.
 *
 * These four lived in `index.tsx`, and the Motion section had to import from
 * the screen it documents — a lab page depending on itself is the dependency
 * pointing the wrong way. They are the frame every section is drawn in, so
 * they live in one module that `index.tsx` and each section module share.
 *
 * `Specimen` is the exhibit frame: the live component, its contract, and the
 * note explaining why it is the way it is. The note is the reason it exists —
 * a primitive without one is a component the next person cannot extend.
 */

/** A documented section heading: small caps, ink, children below. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="font-body-bold text-sm uppercase tracking-widest text-ink">
        {title}
      </Text>
      {children}
    </View>
  );
}


export function TokenRow({
  name,
  token,
  detail,
  right,
}: {
  name: string;
  token: string;
  detail: string;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3 border-b border-gravel py-2">
      {right}
      <View className="flex-1 gap-0">
        <Text className="font-body-bold text-base text-ink">{name}</Text>
        <Text className="font-body text-sm text-ink">{detail}</Text>
      </View>
      <Text className="font-body text-sm text-ink">{token}</Text>
    </View>
  );
}


export function TypeRow({
  step,
  size,
  leading,
  tracking,
  weight,
  face,
  family,
  className,
  sample,
  use,
}: {
  step: string;
  size: string;
  leading: string;
  tracking: string;
  weight: string;
  face: "display" | "body";
  family: string;
  className: string;
  sample: string;
  use: string;
}) {
  return (
    <View className="gap-2 border-b border-gravel py-4">
      {/* The sample is set at the step's real size, leading and tracking,
          in the face the step wears. Judging a scale off a swatch that is
          not the scale is how a scale goes unnoticed until it is in 42
          places. */}
      <Text className={`${className} text-ink`} numberOfLines={1}>
        {sample}
      </Text>
      <View className="flex-row flex-wrap items-baseline gap-x-4 gap-y-1">
        <Text className="w-28 font-body-bold text-sm text-ink">{step}</Text>
        <Text className="font-body text-sm text-ink">{size}</Text>
        <Text className="font-body text-sm text-ink">lh {leading}</Text>
        <Text className="font-body text-sm text-ink">track {tracking}</Text>
        <Text className="font-body text-sm text-ink">w{weight}</Text>
        {/* Named as the *face*, not the family: this is the column that
            decides which of the two faces a step gets, and the family is
            the consequence of it. */}
        <Text className="font-body-bold text-sm text-ink">{face}</Text>
      </View>
      <Text className="font-body text-sm text-ink opacity-60">
        {family} — {use}
      </Text>
    </View>
  );
}

/** Exhibit frame: the live component, its contract, and its variants. */

export function Specimen({
  name,
  contract,
  note,
  children,
}: {
  name: string;
  contract: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <View className="border border-ink bg-paper">
      <View className="gap-0 border-b border-ink p-4">
        <Text className="font-body-bold text-base text-ink">{name}</Text>
        <Text className="font-body text-sm text-ink">{contract}</Text>
        <Text className="font-body text-sm text-ink">{note}</Text>
      </View>
      <View className="gap-3 p-4">{children}</View>
    </View>
  );
}

/**
 * A role, what it is for, and the two class strings it actually is.
 *
 * Both forms are printed side by side on purpose: the reduced-motion
 * rule is "colour is kept, movement goes", and the only way to see that
 * rule holding is to read the two strings next to each other.
 */
