import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SPLASH_IMAGE_WIDTH } from "@/lib/boot";

/**
 * The launch is one mark at one size, held in three places.
 *
 * The number that matters is the same in two of them — `app.json`'s
 * `expo-splash-screen.imageWidth`, which is what the OS draws, and
 * `lib/boot.ts`'s `SPLASH_IMAGE_WIDTH`, which is what the boot cover draws
 * immediately after it. On Android there is no crossfade between the two
 * (`setOptions`' `fade` is iOS-only), so a difference is a visible jump at the
 * start of every launch, which is the worst place in the app to put one.
 *
 * The third is the asset itself: the cover has to draw **the splash's own
 * image**, not a second export of the same mark at a different crop. That is a
 * source assertion rather than a runtime one because the failure is a design
 * regression nobody would see in a test suite, and it is the kind of check
 * this repo already makes elsewhere (`__tests__/expo-policy.test.ts` reads
 * component sources for exactly this reason).
 *
 * File reads only, no renderer: `apps/mobile/vitest.config.ts` is plain node
 * (A9).
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
});
