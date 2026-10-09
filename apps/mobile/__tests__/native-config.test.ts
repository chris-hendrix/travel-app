import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mobileDir = path.resolve(__dirname, "..");

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(mobileDir, rel), "utf8"));
}

describe("native config: the app.json keys the native build needs", () => {
  const appJson = readJson("app.json") as {
    expo: {
      version: unknown;
      icon: unknown;
      web: { output: unknown };
      ios?: {
        bundleIdentifier: unknown;
        supportsTablet: unknown;
        buildNumber: unknown;
        associatedDomains: string[];
        config: { usesNonExemptEncryption: unknown };
      };
      infoPlist?: Record<string, unknown>;
      android: {
        package: unknown;
        versionCode: unknown;
        adaptiveIcon: { foregroundImage: unknown };
        googleServicesFile: unknown;
        intentFilters: Array<{
          action: unknown;
          autoVerify: unknown;
          category: unknown;
          data: unknown;
        }>;
      };
      plugins: Array<unknown>;
    };
  };

  it("pins the release identity", () => {
    expect(appJson.expo.version).toBe("1.0.0");
    expect(appJson.expo.android.package).toBe("com.journiful.app");
    expect(appJson.expo.android.versionCode).toBe(1);
  });

  it("points icons, splash and the FCM client config at real files", () => {
    expect(appJson.expo.icon).toBe("./assets/icon.png");
    expect(appJson.expo.android.adaptiveIcon.foregroundImage).toBe(
      "./assets/adaptive-icon.png",
    );
    expect(appJson.expo.android.googleServicesFile).toBe(
      "./google-services.json",
    );
    for (const rel of [
      "assets/icon.png",
      "assets/adaptive-icon.png",
      "assets/splash.png",
      "assets/notification-icon.png",
    ]) {
      expect(fs.existsSync(path.join(mobileDir, rel)), `${rel} exists`).toBe(
        true,
      );
    }
  });

  it("verifies invite App Links against the apex", () => {
    const filters = appJson.expo.android.intentFilters;
    expect(filters).toHaveLength(1);
    expect(filters[0]!).toMatchObject({
      action: "VIEW",
      autoVerify: true,
      category: ["BROWSABLE", "DEFAULT"],
    });
    expect(filters[0]!.data).toEqual([
      { scheme: "https", host: "journiful.app", pathPrefix: "/invite" },
    ]);
  });

  it("registers the monochrome notification icon, not the launcher", () => {
    const plugins = appJson.expo.plugins as Array<unknown>;
    const notif = plugins.find(
      (p) => Array.isArray(p) && p[0] === "expo-notifications",
    ) as [string, Record<string, string>];
    expect(notif, "expo-notifications plugin registered").toBeDefined();
    expect(notif[1].icon).toBe("./assets/notification-icon.png");
  });

  // Embedded, not loaded at runtime, and the difference is measurable: a
  // face that only exists in JS paints but does not *measure*, so the band's
  // wordmark was laid out as Roboto (222px) and drawn as Bungee Shade
  // (390px) until these files were listed here. Android resolves a family
  // from `assets/fonts/<family>.ttf`, which is where prebuild puts them.
  it("embeds every face the app draws with", () => {
    const plugins = appJson.expo.plugins as Array<unknown>;
    const font = plugins.find(
      (p) => Array.isArray(p) && p[0] === "expo-font",
    ) as [string, { fonts: string[] }];
    expect(font, "expo-font plugin configured").toBeDefined();
    expect(font[1].fonts).toHaveLength(8);
    for (const rel of font[1].fonts) {
      // The family Android derives is the file's basename, so it has to
      // match what `global.css` names in `--font-wordmark` and friends.
      const family = path.basename(rel, ".ttf");
      expect([
        "BungeeShade_400Regular",
        "SpaceMono_400Regular",
        "SpaceMono_400Regular_Italic",
        "SpaceMono_700Bold",
        // Four weights of the display face. Not one family with four
        // weights: the basename *is* the family on Android, so these are
        // four families and `global.css` needs four tokens to name them.
        "BigShouldersDisplay_900Black",
        "BigShouldersDisplay_800ExtraBold",
        "BigShouldersDisplay_700Bold",
        "BigShouldersDisplay_600SemiBold",
      ]).toContain(family);
      expect(fs.existsSync(path.join(mobileDir, rel)), `${rel} exists`).toBe(
        true,
      );
    }
  });

  // The old assertion here was "ships no ios block": the web export is the
  // only shipped surface, and an `ios` key nobody builds is a promise the
  // repo does not keep. That is exactly what changes — the iOS app is now a
  // built and uploaded surface, so the config states it. The web export stays
  // static; what moved is the other half of the assertion.
  //
  // `buildNumber` is the config's own baseline for where the count starts,
  // not the number that reaches TestFlight: with `cli.appVersionSource:
  // "remote"` EAS owns the build number it stamps, and this value only has to
  // exist so the config is complete on its own.
  it("declares the ios block the App Store build needs", () => {
    expect(appJson.expo.web.output).toBe("static");
    const ios = appJson.expo.ios!;
    expect(ios.bundleIdentifier).toBe("com.journiful.app");
    expect(ios.supportsTablet).toBe(false);
    expect(ios.buildNumber).toBeTruthy();
    expect(ios.associatedDomains).toContain("applinks:journiful.app");
    // `usesNonExemptEncryption` is the supported field and writes
    // ITSAppUsesNonExemptEncryption into the built plist, which is what keeps
    // App Store Connect from asking for export-compliance documents.
    expect(ios.config.usesNonExemptEncryption).toBe(false);
  });

  // The plist key is asserted on the *plugin*, not on a duplicated
  // `infoPlist` entry: `expo-image-picker` is what writes
  // NSPhotoLibraryUsageDescription into the built plist, and a second copy in
  // `infoPlist` is a string that drifts from the plugin it claims to mirror.
  it("carries the photo library permission on the plugin that writes it", () => {
    const plugins = appJson.expo.plugins as Array<unknown>;
    const picker = plugins.find(
      (p) => Array.isArray(p) && p[0] === "expo-image-picker",
    ) as [string, { photosPermission?: string }];
    expect(picker, "expo-image-picker plugin registered").toBeDefined();
    expect(picker[1].photosPermission).toEqual(expect.any(String));
    expect(picker[1].photosPermission!.length).toBeGreaterThan(0);
    const infoPlist = appJson.expo.infoPlist ?? {};
    expect(
      infoPlist,
      "infoPlist does not duplicate NSPhotoLibraryUsageDescription",
    ).not.toHaveProperty("NSPhotoLibraryUsageDescription");
  });

  // The update layer lives *inside* the binary: a build shipped without
  // expo-updates can never receive an update, and adding it after the first
  // store build costs a review cycle. The fingerprint policy is what makes an
  // update safe — a native change changes the fingerprint and cannot be
  // delivered as JS, which is the whole enforcement.
  //
  // The three *shipping* profiles are asserted by name. The `simulator`
  // profile is an availability gate (it proves the prebuild configures), not
  // an update target, so it is deliberately exempt here and asserted on its
  // own below.
  it("carries the update layer and a channel per shipping profile", () => {
    const { expo } = appJson as unknown as {
      expo: { runtimeVersion?: unknown; updates?: unknown };
    };
    expect(expo.runtimeVersion).toEqual({ policy: "fingerprint" });

    const pkg = readJson("package.json") as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toHaveProperty("expo-updates");

    const eas = readJson("eas.json") as {
      build: Record<string, { channel?: string }>;
    };
    for (const profile of ["development", "preview", "production"]) {
      expect(eas.build[profile], `${profile} profile exists`).toBeDefined();
      expect(eas.build[profile]!.channel, `${profile} names a channel`).toEqual(
        expect.any(String),
      );
    }
  });

  // `make ios-sim` and the iOS section of AGENTS.md both name a `simulator`
  // profile, and both were naming one that eas.json did not define — a
  // documented command that could only fail. The profile is the pre-payment
  // verification loop: an unsigned `.app` that proves the prebuild configures
  // and is the only place the built appiconset can be read, which is what
  // `plugins/withIosOpaqueIcon.cjs` exists for.
  //
  // No channel, on purpose: a channel would make it an update target, and this
  // build is meant to show the source it was built from.
  it("ships the simulator profile the iOS loop documents", () => {
    const eas = readJson("eas.json") as {
      build: Record<
        string,
        { ios?: { simulator?: boolean }; channel?: string }
      >;
    };
    expect(eas.build.simulator?.ios?.simulator).toBe(true);
    expect(eas.build.simulator?.channel).toBeUndefined();
  });

  it("gitignores prebuild output and the untracked client secret", () => {
    const ignore = fs.readFileSync(
      path.join(mobileDir, ".gitignore"),
      "utf8",
    );
    for (const entry of ["android/", "ios/", "google-services.json"]) {
      expect(ignore).toContain(entry);
    }
  });
});
