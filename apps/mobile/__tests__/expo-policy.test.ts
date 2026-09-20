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

describe("expo policy: every target is a thumb's size", () => {
  // The 44pt floor, measured two ways. Where a number exists it is read
  // as a number; tailwind-sized cells assert the class that encodes 44pt
  // (h-11) and the absence of the 40pt one (h-10). Lone targets assert
  // the hit-area mechanism, not the geometry: hitSlop (or padding with
  // a matching negative margin) leaves the picture unchanged, which is
  // the property the screenshot check would verify by hand.
  function source(rel: string): string {
    return fs.readFileSync(path.join(mobileDir, rel), "utf8");
  }

  it("TimeField rows are 44pt: ROW_HEIGHT === 44", () => {
    const match = source("components/ui/TimeField.tsx").match(
      /ROW_HEIGHT\s*=\s*(\d+)/,
    );
    expect(match, "ROW_HEIGHT must be a literal number").not.toBeNull();
    expect(Number(match![1])).toBe(44);
  });

  it("DatePicker day cells are 44pt (h-11) with no 40pt (h-10) left", () => {
    const picker = source("components/ui/DatePicker.tsx");
    expect(picker).toContain("h-11");
    expect(picker).not.toContain("h-10");
  });

  it("the month arrows reach the floor without moving the picture", () => {
    expect(source("components/ui/DatePicker.tsx")).toContain("hitSlop");
  });

  it("every enumerated header target carries a hit-area mechanism", () => {
    // Bell, avatar, close, zone token and sign-in word: each must reach
    // 44x44pt via hitSlop or via padding with a matching negative
    // margin (p-*-m-*), never by growing the visible control.
    const header = source("components/ui/AppHeader.tsx");
    const hitSlopCount = (header.match(/hitSlop=/g) ?? []).length;
    const negMarginCount = (header.match(/-m-\d/g) ?? []).length;
    expect(
      hitSlopCount + negMarginCount,
      `expected a hit-area mechanism on each of the 5 header targets, found ${hitSlopCount} hitSlop + ${negMarginCount} negative-margin`,
    ).toBeGreaterThanOrEqual(5);
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

describe("expo policy: the accessible state reaches the phone", () => {
  // Source files only: tests assert on source, node_modules is not ours.
  function sourceFiles(): string[] {
    const roots = ["app", "components", "lib"].map((d) =>
      path.join(mobileDir, d),
    );
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
      }
    };
    for (const root of roots) walk(root);
    return out;
  }

  it("uses aria-pressed nowhere: it does not exist in React Native", () => {
    const offenders = sourceFiles().filter((full) =>
      fs.readFileSync(full, "utf8").includes("aria-pressed"),
    );
    expect(
      offenders.map((f) => path.relative(mobileDir, f)),
      "aria-pressed is web-only and a silent no-op on a phone; use role + aria-selected",
    ).toEqual([]);
  });

  it("every file under components/ and app/ using an aria-* state prop also sets role", () => {
    // The state props this phase migrates: pressed/selected/expanded/disabled/checked.
    // aria-label is a name, not a state, so it does not count.
    const stateProp = /aria-(pressed|selected|expanded|disabled|checked)\b/;
    const roots = ["app", "components"].map((d) => path.join(mobileDir, d));
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          const source = fs.readFileSync(full, "utf8");
          if (stateProp.test(source) && !/\brole=/.test(source)) {
            offenders.push(path.relative(mobileDir, full));
          }
        }
      }
    };
    for (const root of roots) walk(root);
    expect(
      offenders,
      "role + aria-* is the cross-platform form; an aria-* state prop without role is silent on a phone",
    ).toEqual([]);
  });
});
