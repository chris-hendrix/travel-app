import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * App Store Connect refuses a marketing icon that is transparent or carries
 * an alpha channel at all (ITMS-90717), so the iOS icon is the one icon in
 * the repo that cannot be RGBA. Every other icon here is RGBA by
 * construction — the Android launcher masks `adaptive-icon.png`, the splash
 * is a rounded square on transparency, the notification is a silhouette read
 * from its alpha — which is exactly why the iOS one is flattened at the
 * source in `scripts/generate-icons.mjs` rather than patched in a binary
 * afterwards.
 *
 * The header is read by hand rather than through sharp: the check is about
 * the bytes' own declaration of the file, and sharp is happy to report an
 * alpha channel that is fully opaque everywhere, which is the thing App Store
 * Connect rejects.
 */
const mobileDir = path.resolve(__dirname, "..");

/** PNG colour types that carry an alpha channel. */
const WITH_ALPHA = new Map([
  [4, "grey + alpha"],
  [6, "RGBA"],
]);

function ihdr(rel: string) {
  const bytes = fs.readFileSync(path.join(mobileDir, rel));
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!bytes.subarray(0, 8).equals(signature)) {
    throw new Error(`${rel} is not a PNG`);
  }
  if (bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error(`${rel} has no leading IHDR chunk`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colourType: bytes.readUInt8(25),
  };
}

describe("the iOS icon", () => {
  it("is the 1024px square the App Store asks for", () => {
    const { width, height } = ihdr("assets/ios-icon.png");
    expect({ width, height }).toEqual({ width: 1024, height: 1024 });
  });

  it("declares no alpha channel at all", () => {
    const { colourType } = ihdr("assets/ios-icon.png");
    expect(WITH_ALPHA.get(colourType)).toBeUndefined();
  });

  it("is the icon app.json points iOS at", () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(mobileDir, "app.json"), "utf8"),
    ) as { expo: { ios: { icon: string } } };
    expect(appJson.expo.ios.icon).toBe("./assets/ios-icon.png");
  });
});
