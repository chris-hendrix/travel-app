import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  MARK_GAP,
  markOffset,
  SPLASH_IMAGE_WIDTH,
} from "@/lib/boot";

/**
 * The launch is one mark, at one size, in one place.
 *
 * The number that matters is shared between two files — `app.json`'s
 * `expo-splash-screen.imageWidth`, which is what the OS draws, and
 * `lib/boot.ts`'s `SPLASH_IMAGE_WIDTH`, which is what the boot cover draws
 * immediately after it. On Android there is no crossfade between the two
 * (`setOptions`' `fade` is iOS-only), so a difference is a visible jump at the
 * start of every launch, which is the worst place in the app to put one.
 *
 * **Position is the other half of "the same mark", and it is here too.** The
 * first version of `BootCover` centred the mark as one group *with* the rule and
 * the label — a group about twice the mark's height — so it painted tens of
 * pixels above where the splash draws it, and no test could see it. The
 * arithmetic now lives in `lib/boot.ts` so this suite can hold it: the mark's
 * layer is padded by the shell's reserved inset, and the rule's offset is
 * derived rather than typed.
 *
 * The last two cases read the component's source. That is deliberate and it is
 * the pattern `__tests__/expo-policy.test.ts` already uses: what has to stay
 * true is a *shape* (the mark has a centring box of its own, nothing shares it,
 * the rule is placed by the helper) rather than a value, and the mobile suite
 * has no renderer (A9) with which to measure a rendered frame.
 */
const mobileDir = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(mobileDir, rel), "utf8");

const appJson = JSON.parse(read("app.json")) as {
  expo: { plugins: Array<unknown> };
};

const splash = appJson.expo.plugins.find(
  (p) => Array.isArray(p) && p[0] === "expo-splash-screen",
) as [string, { backgroundColor: string; image: string; imageWidth?: number }];

describe("the boot cover and the splash are one mark", () => {
  it("draws the mark at the width the splash declares", () => {
    expect(splash, "expo-splash-screen plugin configured").toBeDefined();
    // Before this was written down the plugin had no `imageWidth` at all, which
    // meant 100 by the library's own default — the same 100, arrived at by
    // accident. An explicit number is what makes the two comparable.
    expect(splash[1].imageWidth).toBe(SPLASH_IMAGE_WIDTH);
  });

  it("keeps the splash on the app's own ground", () => {
    // The cover paints `bg-sand`, and the native window is behind both. Any
    // other ground is a colour seam at launch, before a line of app code runs.
    expect(splash[1].backgroundColor).toBe("#f5eacc");
  });

  it("draws the splash's own asset, so nothing swaps under the reader", () => {
    const asset = path.basename(splash[1].image);
    expect(asset).toBe("splash.png");
    expect(read("components/ui/BootCover.tsx")).toContain(asset);
  });

  it("hangs the rule a fixed distance under the mark, whatever the inset", () => {
    // With no inset the rule sits half a mark plus the gap below the centre.
    expect(markOffset(0)).toBe(SPLASH_IMAGE_WIDTH / 2 + MARK_GAP);
    // And it *follows* the mark as the shell's reserved inset grows: the
    // distance between mark and rule is the same at the top of the screen as at
    // the bottom, which is the property the arithmetic exists to keep.
    expect(markOffset(48) - MARK_GAP - SPLASH_IMAGE_WIDTH / 2).toBe(24);
    expect(markOffset(120) - markOffset(0)).toBe(60);
  });

  it("keeps the mark's centring to itself", () => {
    const cover = read("components/ui/BootCover.tsx");
    // The mark's own layer, padded by the inset: a box H tall with paddingTop b
    // centres its content at (H + b)/2, which is the window's centre. This is
    // the line that makes the first frame the splash's, and the line whose
    // absence was the bug.
    expect(cover).toMatch(/paddingTop: insets\.bottom/);
    // The rule is placed by the helper rather than by a typed number, so it
    // cannot drift from the mark it hangs under.
    expect(cover).toMatch(/marginTop: markOffset\(insets\.bottom\)/);
    // And the foot is out of the flow, so its height cannot move the mark.
    expect(cover).toMatch(/absolute bottom-0 left-0 right-0/);
  });
});
