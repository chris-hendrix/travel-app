import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mobileDir = path.resolve(__dirname, "..");

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(mobileDir, rel), "utf8"));
}

describe("expo policy: router peer dependencies", () => {
  it("declares every required expo-router peer (or inherits it from expo/expo-router)", () => {
    const mobile = readJson("package.json") as {
      dependencies: Record<string, string>;
    };
    const routerPkg = readJson("node_modules/expo-router/package.json") as {
      peerDependencies: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
      dependencies: Record<string, string>;
    };
    const expoPkg = readJson("node_modules/expo/package.json") as {
      dependencies: Record<string, string>;
    };
    const optional = new Set(
      Object.entries(routerPkg.peerDependenciesMeta ?? {})
        .filter(([, meta]) => meta.optional)
        .map(([name]) => name),
    );
    const required = Object.entries(routerPkg.peerDependencies ?? {}).filter(
      ([name, range]) => !optional.has(name) && range !== "*",
    );
    expect(required.length).toBeGreaterThan(0);
    for (const [name] of required) {
      expect(
        name in (mobile.dependencies ?? {}) ||
          name in (expoPkg.dependencies ?? {}) ||
          name in (routerPkg.dependencies ?? {}),
        `${name} is a required expo-router peer but is neither declared in apps/mobile dependencies nor provided by expo/expo-router`,
      ).toBe(true);
    }
  });

  it("declares expo-constants and expo-linking directly", () => {
    const mobile = readJson("package.json") as {
      dependencies: Record<string, string>;
    };
    expect(mobile.dependencies).toHaveProperty("expo-constants");
    expect(mobile.dependencies).toHaveProperty("expo-linking");
  });
});
