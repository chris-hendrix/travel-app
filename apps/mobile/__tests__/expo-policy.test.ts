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
    // Per-target, not file-wide: the window around each arrow's own
    // aria-label must carry its own padding plus a matching negative
    // margin. A file-wide hitSlop/-m- count can pass with the mechanism
    // clustered on one target; this one fails unless both arrows do.
    const picker = source("components/ui/DatePicker.tsx");
    // Both arrows exist as usages of the one Arrow component …
    for (const label of ['label="Previous month"', 'label="Next month"']) {
      expect(picker, `${label} must exist`).toContain(label);
    }
    // … and the component's own Pressable (found via aria-label={label})
    // carries padding to the 44pt floor plus the padding DELTA as a
    // negative margin: p-2.5 (10px) over the original p-1 (4px) is a
    // 6px delta, i.e. -m-1.5. A -m-2.5 would shrink the margin box to
    // 24px and pull the bordered row up.
    const at = picker.indexOf("aria-label={label}");
    expect(at, "Arrow must forward its label to aria-label").toBeGreaterThanOrEqual(0);
    const window = picker.slice(Math.max(0, at - 800), at + 800);
    expect(window, "arrows: expected padding reaching 44pt").toMatch(/p-2\.5/);
    expect(window, "arrows: expected the delta (-m-1.5), not a matching -m-2.5").toMatch(/-m-1\.5/);
    expect(window, "arrows: the negative margin must be smaller than the padding, or the margin box shrinks").not.toMatch(/-m-2\.5/);
    expect(picker, "no hitSlop prop: it does not enlarge the box on web").not.toMatch(/hitSlop=/);
  });

  it("every enumerated header target carries its own hit area", () => {
    // Per-target: each named target element carries its own padding to
    // the 44pt floor plus the padding DELTA as a negative margin, so
    // the margin box is exactly what it was before. The negative margin
    // is always smaller than the padding — a margin as large as the
    // padding shrinks the margin box and pulls the page up.
    const header = source("components/ui/AppHeader.tsx");
    const targets: Array<{ marker: string; padding: RegExp; margin: RegExp }> = [
      // 24px icon in p-1 -> p-2.5; delta 6px = -m-1.5.
      { marker: 'aria-label="Notifications"', padding: /p-2\.5/, margin: /-m-1\.5/ },
      { marker: 'aria-label="Profile"', padding: /p-2\.5/, margin: /-m-1\.5/ },
      { marker: 'aria-label="Close"', padding: /p-2\.5/, margin: /-m-1\.5/ },
      // Zone token: p-1 -> p-3; delta 8px = -m-2.
      // (marker: the token names itself through accessibilityLabel.)
      { marker: "Times in", padding: /p-3/, margin: /-m-2(?!\.5)/ },
      // Sign-in word: py-2 -> py-3; vertical delta 4px = -my-1.
      { marker: ">Sign in<", padding: /py-3/, margin: /-my-1/ },
    ];
    for (const { marker, padding, margin } of targets) {
      const at = header.indexOf(marker);
      expect(at, `${marker} must exist`).toBeGreaterThanOrEqual(0);
      const window = header.slice(Math.max(0, at - 800), at + 800);
      expect(window, `${marker}: expected padding reaching 44pt`).toMatch(padding);
      expect(window, `${marker}: expected the delta as negative margin`).toMatch(margin);
    }
    expect(header, "no hitSlop prop: it does not enlarge the box on web").not.toMatch(/hitSlop=/);
  });
});

describe("expo policy: the trips store takes data from an injected source", () => {
  // Scoped to the one store that has the seam on purpose. tripsStore
  // proves the wiring interface; the seven other stores still import
  // their mock pools directly (see lib/sources.ts), and giving each a
  // seam is the wiring plan's job — not something this assertion
  // should pretend already happened by passing vacuously.
  function libSource(rel: string): string {
    return fs.readFileSync(path.join(mobileDir, rel), "utf8");
  }

  it("tripsStore takes data from an injected source, not a mock-pool import", () => {
    const store = libSource("lib/tripsStore.tsx");
    expect(store).toContain("@/lib/sources");
    expect(store).not.toMatch(/from\s+["']@\/mocks\//);
  });

  it("the mock pool lives in lib/sources.ts", () => {
    expect(libSource("lib/sources.ts")).toMatch(/from\s+["']@\/mocks\/trips["']/);
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
