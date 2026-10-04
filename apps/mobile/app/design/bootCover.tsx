import { useState } from "react";
import { Text, View } from "react-native";

import { BootCover } from "@/components/ui/BootCover";
import { Button } from "@/components/ui/Button";
import { Section, Specimen } from "./frame";

/**
 * The boot cover's specimen, in its own module for the reason the Motion
 * section is: `app/design/index.tsx` is a very long file, and this needs its
 * own state — a `key` to remount the cover, because a remount is what fires an
 * `entering` animation and there is no other way to watch one on demand.
 *
 * The cover is not a route, so it cannot be linked from the lab's Screens list;
 * this specimen is the only place it can be seen without launching the app, and
 * for the first frame that matters it is the only place the two draws can be
 * compared side by side.
 */
export function BootCoverSpecimen() {
  const [key, setKey] = useState(0);

  return (
    <Section title="The boot">
      <View className="gap-3">
        {/*
          Bounded rather than full-bleed: a specimen that filled the viewport
          would hide the section it is documenting, and the cover's own layout
          is `flex-1` inside whatever box it is given.

          The height is a phone's, less the band, because that is the shape the
          first frame has to match: the real one is drawn under a suppressed
          band while the session is restoring, and the mark is centred in the
          frame it is given.
        */}
        <View className="h-[420px] overflow-hidden border border-ink">
          <BootCover key={key} label="Signing you in" />
        </View>
        <Button
          title="Boot it again"
          variant="secondary"
          onPress={() => setKey((current) => current + 1)}
        />
      </View>

      <Specimen
        name="BootCover"
        contract="BootCover · the boot gate, and the only full-screen wait in the app"
        note="The first frame is the splash: the same asset, the same width, the same sand, with no band over it — because Android replaces the splash with this in one frame and a mark that moves is a jump at the start of every launch. Then the rule draws from its centre out and the label and the foot arrive behind it. No spinner, no bar, no loop: a loop is a claim about progress, and the boot is one request. No minimum duration either — a fast boot cuts the draw off, and that is the animation paying for the content rather than the other way round. Press the button to watch it from the first frame."
      >
        <View className="gap-2 border-t border-ink pt-4">
          <Text className="font-body text-sm text-ink">
            The two numbers that must agree are `app.json`'s
            `expo-splash-screen.imageWidth` and `SPLASH_IMAGE_WIDTH` in
            `lib/boot.ts`; `__tests__/boot-cover.test.ts` fails if they drift.
            The asset is the splash's own file, which is the third of the three
            and the one nobody can see in a test that only reads numbers.
          </Text>
        </View>
      </Specimen>
    </Section>
  );
}
