/**
 * Every face the app draws with, in one table.
 *
 * The classes a screen writes — `font-body-bold`, `font-display-semibold` —
 * are roles, and nothing in the app passes a family as a prop, so switching
 * a face touches no screen at all. What it does touch is the wiring, and
 * before this table that wiring was one string written in four files:
 *
 *   app.json                the family as a *file path*
 *   app/_layout.tsx         the family as an *imported identifier*
 *   global.css              the family as a *quoted CSS string*
 *   __tests__/native-config the family in an *allow-list*
 *
 * Four copies of one string and nothing asserting they agreed. A name that
 * drifted in `global.css` would have painted the system fallback while
 * `app.json` embedded a font nobody referenced — silently, on both
 * platforms, with every test green. That is the measure-vs-paint class this
 * repo has already been bitten by: `_layout.tsx` records the band wordmark
 * rendering "JOUR" because it was *measured* as Roboto and *drawn* as
 * Bungee Shade.
 *
 * `__tests__/fonts.test.ts` binds all four directions against this table,
 * so a swap is: edit here, and the test names what else must move.
 *
 * **`file` is not derivable from `pkg`, and that is the whole reason it is
 * a column.** `@expo-google-fonts/big-shoulders-display` ships its TTFs at
 * the package root; `bungee-shade` and `space-mono` nest them one directory
 * per weight. Nothing in the package name or the export says which, so the
 * path is written down rather than computed — it was a real trap the day
 * the display face landed.
 *
 * **`export` is provenance, not an import.** `app/_layout.tsx` requires each
 * face *by `file`* rather than importing it from the package, and that is
 * not a stylistic preference: a package's `index.js` `require`s every face it
 * ships, so one named import brings the whole weight axis with it — nine
 * TTFs for `big-shoulders-display`, five of which no token names. That was
 * 611 KB of the web export, silently, with `app.json` listing only the eight
 * faces below and every test green. So `export` records where a face came
 * from (which named export of which package version) and nothing imports it;
 * `file` is the binding, asserted by `__tests__/fonts.test.ts` and by
 * `scripts/check-export.mjs` against the built artifact. Reinstating the
 * barrel import as "cleaner" reintroduces all of it.
 *
 * The family is the TTF's **basename**, because that is what Android
 * derives the family from. That is also why the four display weights are
 * four families and not one family with four weights: there is no weight
 * axis to ask for, so `font-black` cannot resolve against any of them and
 * `global.css` needs four tokens. See A1.
 */
export type FontRow = {
  /** The CSS token in `global.css`, without the leading `--`. */
  token: string;
  /** The TTF basename. On Android this *is* the family. */
  family: string;
  /** The npm package the TTF comes from. */
  pkg: string;
  /**
   * Provenance only: the named export in that package's `index.d.ts` the
   * face was taken from. Nothing imports it — `app/_layout.tsx` requires
   * the TTF by `file`, because the barrel that exports this name
   * `require`s every weight the package ships (see the header).
   */
  export: string;
  /**
   * Path from `apps/mobile`. `app.json`'s expo-font list uses it verbatim;
   * `app/_layout.tsx` requires the same file by its module specifier —
   * this path with the leading `./node_modules/` dropped. Both bindings
   * are asserted against this column, so a face cannot be wired without
   * being written down here.
   */
  file: string;
  /** What a failed load degrades to. Per-face, and it differs. */
  fallback: string;
  weight: number;
  /** The scale step this face sets, where it sets one. */
  step: string;
  /** Why it exists. */
  role: string;
};

export const FONTS: FontRow[] = [
  {
    token: "font-display-black",
    family: "BigShouldersDisplay_900Black",
    pkg: "@expo-google-fonts/big-shoulders-display",
    export: "BigShouldersDisplay_900Black",
    file: "./node_modules/@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_900Black.ttf",
    fallback: "sans-serif",
    weight: 900,
    step: "display-lg",
    role: "The landing hero, and nothing else.",
  },
  {
    token: "font-display-extrabold",
    family: "BigShouldersDisplay_800ExtraBold",
    pkg: "@expo-google-fonts/big-shoulders-display",
    export: "BigShouldersDisplay_800ExtraBold",
    file: "./node_modules/@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_800ExtraBold.ttf",
    fallback: "sans-serif",
    weight: 800,
    step: "display-md",
    role: "A screen's own title, a trip's name. The workhorse step.",
  },
  {
    token: "font-display-bold",
    family: "BigShouldersDisplay_700Bold",
    pkg: "@expo-google-fonts/big-shoulders-display",
    export: "BigShouldersDisplay_700Bold",
    file: "./node_modules/@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_700Bold.ttf",
    fallback: "sans-serif",
    weight: 700,
    step: "display-sm",
    role: "An empty state's headline, a dialog's title.",
  },
  {
    token: "font-display-semibold",
    family: "BigShouldersDisplay_600SemiBold",
    pkg: "@expo-google-fonts/big-shoulders-display",
    export: "BigShouldersDisplay_600SemiBold",
    file: "./node_modules/@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_600SemiBold.ttf",
    fallback: "sans-serif",
    weight: 600,
    step: "heading-lg",
    role: "A block heading. The display floor, at 28px.",
  },
  {
    token: "font-wordmark",
    family: "BungeeShade_400Regular",
    pkg: "@expo-google-fonts/bungee-shade",
    export: "BungeeShade_400Regular",
    file: "./node_modules/@expo-google-fonts/bungee-shade/400Regular/BungeeShade_400Regular.ttf",
    fallback: "sans-serif",
    weight: 400,
    step: "—",
    role: "Journiful. Nowhere else.",
  },
  {
    token: "font-body",
    family: "SpaceMono_400Regular",
    pkg: "@expo-google-fonts/space-mono",
    export: "SpaceMono_400Regular",
    file: "./node_modules/@expo-google-fonts/space-mono/400Regular/SpaceMono_400Regular.ttf",
    fallback: "monospace",
    weight: 400,
    step: "body",
    role: "Everything read as prose.",
  },
  {
    token: "font-body-bold",
    family: "SpaceMono_700Bold",
    pkg: "@expo-google-fonts/space-mono",
    export: "SpaceMono_700Bold",
    file: "./node_modules/@expo-google-fonts/space-mono/700Bold/SpaceMono_700Bold.ttf",
    fallback: "monospace",
    weight: 700,
    step: "heading-md, label",
    role: "Emphasis, controls, badges. The body face's own bold.",
  },
  {
    token: "font-body-italic",
    family: "SpaceMono_400Regular_Italic",
    pkg: "@expo-google-fonts/space-mono",
    export: "SpaceMono_400Regular_Italic",
    file: "./node_modules/@expo-google-fonts/space-mono/400Regular_Italic/SpaceMono_400Regular_Italic.ttf",
    fallback: "monospace",
    weight: 400,
    step: "—",
    role: "Quotes and asides.",
  },
];
