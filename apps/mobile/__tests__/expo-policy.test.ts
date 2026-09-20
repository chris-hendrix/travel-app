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

describe("expo policy: an unknown trip is not another trip", () => {
  it("never falls back to trips[0] under app/", () => {
    const appDir = path.join(mobileDir, "app");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          const source = fs.readFileSync(full, "utf8");
          if (source.includes("?? trips[0]")) {
            offenders.push(path.relative(mobileDir, full));
          }
        }
      }
    };
    walk(appDir);
    expect(offenders, `?? trips[0] must not appear under app/`).toEqual([]);
  });
});

describe("expo policy: CI can see the package", () => {
  const repoRoot = path.resolve(mobileDir, "..", "..");
  const ciYml = fs.readFileSync(
    path.join(repoRoot, ".github", "workflows", "ci.yml"),
    "utf8",
  );

  it("declares a mobile output on the changes job matching apps/mobile/**", () => {
    expect(ciYml).toContain("mobile: ${{ steps.filter.outputs.mobile }}");
    expect(ciYml).toContain("apps/mobile/**");
  });

  it("declares a job that runs the mobile lint/typecheck/test and expo-doctor", () => {
    expect(ciYml).toContain("mobile-checks");
    expect(ciYml).toContain("needs.changes.outputs.mobile");
    expect(ciYml).toContain(
      "pnpm turbo lint typecheck test --filter=@journiful/mobile",
    );
    expect(ciYml).toContain("expo-doctor");
  });
});
