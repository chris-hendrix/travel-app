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
    expect(filters[0]).toMatchObject({
      action: "VIEW",
      autoVerify: true,
      category: ["BROWSABLE", "DEFAULT"],
    });
    expect(filters[0].data).toEqual([
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

  it("keeps the web export static and ships no ios block", () => {
    expect(appJson.expo.web.output).toBe("static");
    expect(appJson.expo).not.toHaveProperty("ios");
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
