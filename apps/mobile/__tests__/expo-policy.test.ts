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
  // the real-box mechanism, not just the geometry: each target's own
  // box grows to 44x44 with padding and NO negative margin, so the box
  // sits inside its row; the icon or text inside does not move, and the
  // surface grows where it must (band 72, title row 77, calendar
  // header 60). hitSlop leaves the box unchanged on web and is
  // unverifiable in a browser; padding plus a negative margin pulls
  // the box back out of its row and overflows it.
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

  it("the month arrows are real 44pt boxes with no negative margin", () => {
    // Per-target, not file-wide: the window around each arrow's own
    // aria-label must carry its own padding to 44pt and no negative
    // margin. A file-wide -m- count can pass with the bleed clustered
    // on one target; this one fails unless both arrows sit inside
    // their row.
    const picker = source("components/ui/DatePicker.tsx");
    // Both arrows exist as usages of the one Arrow component …
    for (const label of ['label="Previous month"', 'label="Next month"']) {
      expect(picker, `${label} must exist`).toContain(label);
    }
    // … and the component's own Pressable (found via aria-label={label})
    // is a real box whose padding sits on the side facing the row's
    // interior: the left arrow grows right, the right arrow grows left,
    // so the outer edge and the icon stay put while the bordered header
    // row grows to hold the box (8 + 44 + 8 = 60). Symmetric padding
    // was measured moving both icons 6pt inward.
    const at = picker.indexOf("aria-label={label}");
    expect(at, "Arrow must forward its label to aria-label").toBeGreaterThanOrEqual(0);
    const window = picker.slice(Math.max(0, at - 800), at + 800);
    expect(
      window,
      "arrows: the left arrow's padding pair, outer edge fixed",
    ).toMatch(/pl-1 pr-4 pt-2\.5 pb-2\.5/);
    expect(
      window,
      "arrows: and the mirrored pair for the right arrow",
    ).toMatch(/pl-4 pr-1 pt-2\.5 pb-2\.5/);
    expect(window, "arrows: no negative margin — the box sits inside its row").not.toMatch(/-m-/);
    expect(picker, "no hitSlop prop: it does not enlarge the box on web").not.toMatch(/hitSlop=/);
  });

  it("every enumerated header target is a real 44pt box with no negative margin", () => {
    // Per-target: each named target element carries its own asymmetric
    // padding to a real 44x44 box, and no negative margin anywhere on
    // these targets — the box sits inside its row, the icon or text
    // does not move, and the surface grows (band 72, title row 77).
    const header = source("components/ui/AppHeader.tsx");
    const targets: Array<{ marker: string; padding: RegExp }> = [
      // 24px icon; 16 left + 4 right keeps the outer edge and the icon.
      { marker: 'aria-label="Notifications"', padding: /pl-4 pr-1 pt-1 pb-4/ },
      { marker: 'aria-label="Profile"', padding: /pl-4 pr-1 pt-1 pb-4/ },
      { marker: 'aria-label="Close"', padding: /pl-4 pr-1 pt-1 pb-4/ },
      // Zone token: 12 left + 4 right keeps the text where it was, and
      // 6 above / 18 below makes a full 44pt box. (marker: the token
      // names itself through accessibilityLabel.)
      { marker: "Times in", padding: /pl-3 pr-1 pt-1\.5 pb-4\.5/ },
      // Sign-in word: grows leftward from the band's right edge.
      { marker: ">Sign in<", padding: /pl-4 pt-2 pb-4/ },
    ];
    for (const { marker, padding } of targets) {
      const at = header.indexOf(marker);
      expect(at, `${marker} must exist`).toBeGreaterThanOrEqual(0);
      const window = header.slice(Math.max(0, at - 800), at + 800);
      expect(window, `${marker}: expected the real-box padding pair`).toMatch(padding);
      expect(window, `${marker}: no negative margin — the box sits inside its row`).not.toMatch(/-m[trblxy]?-/);
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
