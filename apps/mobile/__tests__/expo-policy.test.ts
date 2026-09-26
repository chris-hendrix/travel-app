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
          if (/\?\?\s*trips\[0\]|\|\|\s*trips\[0\]/.test(source)) {
            offenders.push(path.relative(mobileDir, full));
          }
        }
      }
    };
    walk(appDir);
    expect(
      offenders,
      "no '?? trips[0]' fallback in any spelling (?? / ||, with or without a space) under app/",
    ).toEqual([]);
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
    // Per-target: each named target element carries its own padding to a
    // real 44x44 box, and no negative margin anywhere on these targets —
    // the box sits inside its row and the surface grows (band 72).
    //
    // The padding is symmetric top and bottom, which is the correction
    // this test was written around: the row centres boxes, not their
    // contents, so an asymmetric pair (6 above the word, 18 below) put
    // every right-hand target 6pt above the wordmark's centre line —
    // icons visibly off the line the eye reads across the band. Equal
    // padding puts the content at the centre of a 44pt box, and the box
    // is what the row centres. Horizontal padding stays asymmetric: it
    // grows the box leftward from the band's right edge, which is where
    // the 44pt of width comes from without moving the icon or the word.
    const header = source("components/ui/AppHeader.tsx");
    const targets: Array<{ marker: string; padding: RegExp }> = [
      // 24px icon: 10 + 24 + 10 = 44.
      { marker: 'aria-label="Notifications"', padding: /pl-4 pr-1 py-2\.5/ },
      { marker: 'aria-label="Profile"', padding: /pl-4 pr-1 py-2\.5/ },
      { marker: 'aria-label="Close"', padding: /pl-4 pr-1 py-2\.5/ },
      // Zone token: 12 + 20 + 12 = 44, on the word's own centre line.
      // (marker: the token names itself through accessibilityLabel.)
      { marker: "Times in", padding: /pl-3 pr-1 py-3/ },
      // Sign-in word: grows leftward from the band's right edge.
      { marker: ">Sign in<", padding: /pl-4 py-3/ },
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

describe("expo policy: the trips store is query-backed, not mock-backed", () => {
  // Phase 8: the injected-source seam is deleted (lib/sources.ts and
  // createTripsStore are gone). Data comes from the query cache; the
  // lab renders from @/mocks directly, never through a store.
  function libSource(rel: string): string {
    return fs.readFileSync(path.join(mobileDir, rel), "utf8");
  }

  it("tripsStore reads from query options, not a mock pool or a source seam", () => {
    const store = libSource("lib/tripsStore.tsx");
    expect(store).toContain("tripsListOptions");
    expect(store).not.toMatch(/from\s+["']@\/mocks\//);
    expect(store).not.toMatch(/@\/lib\/sources/);
    expect(store).not.toMatch(/createTripsStore/);
  });

  it("the source seam file is gone", () => {
    expect(fs.existsSync(path.join(mobileDir, "lib/sources.ts"))).toBe(
      false,
    );
  });
});

describe("expo policy: the shell respects the system bars", () => {
  // The window is edge-to-edge on Android and the app takes no insets by
  // default: measured on the emulator, the status bar is 24dp while the
  // header's own top padding is 16dp, so the wordmark and the Sign in
  // word sat under the clock and the battery, and a dialog's title sat on
  // the status bar's edge. Each bar's inset now goes to whichever element
  // paints that edge: the bottom to the shell, because every route passes
  // through it and none of them paints it; the top to the band, which
  // paints ink up to the status bar so chrome and bar are one shape, or to
  // the shell when there is no band — a dialog. This is a shape guard, not
  // the evidence: the measurement is `uiautomator dump` against
  // `dumpsys window displays`.
  function source(rel: string): string {
    return fs.readFileSync(path.join(mobileDir, rel), "utf8");
  }

  it("reads the insets in the root layout", () => {
    const layout = source("app/_layout.tsx");
    expect(layout).toContain("useSafeAreaInsets");
    expect(layout).toMatch(/const insets = useSafeAreaInsets\(\)/);
  });

  it("gives each bar to the element that paints its edge", () => {
    const layout = source("app/_layout.tsx");
    const at = layout.indexOf('className={isDialog ? "flex-1 bg-gravel" : "flex-1 bg-sand"}');
    expect(at, "the shell view must carry the app ground").toBeGreaterThanOrEqual(0);
    const window = layout.slice(at, at + 1600);
    // Always the shell's: no screen paints the gesture bar's edge.
    expect(window).toContain("paddingBottom: insets.bottom");
    // The band's, unless there is no band to paint it — then the ground keeps
    // it, which is why the two are a pair rather than a constant.
    expect(window).toMatch(/paddingTop: isDialog \? insets\.top : 0/);
    const header = source("components/ui/AppHeader.tsx");
    expect(header).toMatch(/style=\{\{ paddingTop: insets\.top \}\}/);
    expect(header).toContain('className="bg-ink"');
  });

  it("paints the inset under a dialog in the dialog's own ground", () => {
    // A dialog has no band, so the shell's ground is what shows behind the
    // status and gesture bars there. It is gravel because every dialog is:
    // `DIALOG_ROUTES` and `FullscreenDialog`'s ground are one list and one
    // colour, and a shell that kept its sand would draw a seam along the
    // status bar of every dialog in the app.
    const layout = source("app/_layout.tsx");
    expect(layout).toMatch(
      /className=\{isDialog \? "flex-1 bg-gravel" : "flex-1 bg-sand"\}/,
    );
    const dialog = source("components/ui/FullscreenDialog.tsx");
    expect(dialog).toMatch(/<View className="flex-1 bg-gravel">/);
  });

  it("picks bar content that matches the ground under it", () => {
    const layout = source("app/_layout.tsx");
    // Light over the band's ink, dark over the gravel a dialog leaves there.
    expect(layout).toMatch(
      /barStyle=\{isDialog \? "dark-content" : "light-content"\}/,
    );
  });

  it("hides the platform's caret on an empty centred field and draws its own", () => {
    const field = source("components/ui/TextField.tsx");
    // Android draws that caret at the right edge of the box, and it comes out
    // of the native layout, so no prop can move it: the field hides it while
    // it is empty and draws the caret itself, in the middle. See
    // facebook/react-native#28794, #38528.
    expect(field).toMatch(
      /const drawnCaret = centered && !value && Platform\.OS === "android"/,
    );
    expect(field).toMatch(/caretHidden=\{Boolean\(drawnCaret\)\}/);
    // The drawn caret is an overlay on a field: it must not take the touch
    // that focuses the field, and it is Android's alone — iOS and the browser
    // centre the real caret themselves, and a second one would be a second
    // caret.
    expect(field).toMatch(/pointerEvents="none"/);
    expect(field).toMatch(/drawnCaret && focused \?/);
    // `caretHidden` and not a transparent `cursorColor`, which is what this
    // did first: a colour prop that goes back to `undefined` does not reach
    // the native side as "unset", so the cursor drawable kept the
    // colourFilter and the caret never returned once the field had a digit.
    expect(field).not.toMatch(/cursorColor=/);
  });

  it("does not hardcode a status bar height", () => {
    const layout = source("app/_layout.tsx");
    expect(layout).not.toMatch(/paddingTop:\s*\d/);
    expect(layout).not.toMatch(/paddingBottom:\s*\d/);
  });
});

describe("expo policy: a card fills the column it is in", () => {
  function source(rel: string): string {
    return fs.readFileSync(path.join(mobileDir, rel), "utf8");
  }

  it("caps the card on the wide grid, not on a phone", () => {
    // The cap is the grid's, not the card's: two 420px tiles and the 24px gap
    // are exactly the 864px inner width of the widest column (`Screen`'s
    // max-w-[960px] less its md:px-12), so the cap belongs where that width
    // is reached. Unconditional, it clipped a 480dp phone's 432px column by
    // 12px and the card disagreed with the button above it — measured on the
    // emulator, the card's right edge at 999px against the button's 1026px.
    const card = source("components/ui/PhotoCard.tsx");
    expect(card).toContain("lg:max-w-[420px]");
    expect(card, "no unconditional 420px cap: a phone fills its column")
      .not.toMatch(/className="w-full max-w-\[420px\]/);
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

  it("every aria-* state prop sits on an element that also sets role", () => {
    // Per element, not per file: a `role` on some other element in the same
    // file does not make an aria-* state prop announce. For each state prop
    // the scan takes the element it belongs to — from its own opening `<`
    // up to the next opening tag — and requires `role=` inside that span.
    // The span is a superset of the element's attributes (they all precede
    // its first child tag) which keeps it honest about `=>` inside an
    // attribute. It is a backstop: the browser measurement is the evidence
    // that the state actually reaches the DOM.
    const stateProp = /aria-(pressed|selected|expanded|disabled|checked)\b/;
    const roots = ["app", "components"].map((d) => path.join(mobileDir, d));
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          const source = fs.readFileSync(full, "utf8");
          const rel = path.relative(mobileDir, full);
          for (const match of source.matchAll(new RegExp(stateProp, "g"))) {
            const at = match.index ?? 0;
            const tagStart = source.lastIndexOf("<", at);
            if (tagStart === -1) continue;
            const nextTag = source.indexOf("<", tagStart + 1);
            const element = source.slice(tagStart, nextTag === -1 ? source.length : nextTag);
            if (!/\brole=/.test(element)) {
              offenders.push(
                `${rel}: ${element.replace(/\s+/g, " ").trim().slice(0, 70)}`,
              );
            }
          }
        }
      }
    };
    for (const root of roots) walk(root);
    expect(
      offenders,
      "role + aria-* is the cross-platform form; an aria-* state prop without role on the same element is silent on a phone",
    ).toEqual([]);
  });
});
