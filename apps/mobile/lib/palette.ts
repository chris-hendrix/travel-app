import { chroma, contrast, dE } from "@/lib/color";

/**
 * The palette, as one list, with every token's role and its measured
 * floor.
 *
 * `global.css` holds the values and is the source of truth for anything
 * styled with a class; `lib/theme.ts` mirrors the few that a prop needs.
 * Writing a value down twice is how a palette drifts, so this file is the
 * single description both are checked against: `__tests__/palette.test.ts`
 * reads the other two from disk and fails if either disagrees with a row
 * here, or if a row's measured ratio falls under the floor it declares.
 *
 * The colour rule the roles encode, from the plan's audit:
 *
 *   calm   `chroma < 0.09`            — a ground. Text and marks go on it.
 *   mark   `chroma >= 0.10`           — a fill. Small area, never a ground.
 *   text   `chroma <= 0.26`           — the `-deep` tier. Readable on a
 *                                       ground, never used as a fill. The
 *                                       ceiling is the measured maximum
 *                                       (`ocean-deep`, 0.250), not a taste:
 *                                       the tier needs a bound because
 *                                       three of its six tokens already
 *                                       sit above the mark bar and would
 *                                       otherwise pass as chip fills.
 *   seam   `dE >= 6` between grounds  — else they read as one ground.
 *
 * The rule exists because contrast cannot express "loud": `acid #cbfb6a`
 * is 17.55:1 on sand and has the highest chroma in the palette.
 */

/** The grounds a token can be placed on. */
export type Ground = "sand" | "gravel" | "paper";

/** What a token is allowed to do. */
export type Role =
  /** A ground something else sits on. */
  | "ground"
  /** A pale full-bleed band. Ground-like, but only one at a time. */
  | "band"
  /** Readable as text on the grounds it names. */
  | "text"
  /** A saturated mark: an icon, a chip, a rule. Never a ground. */
  | "fill"
  /** A desaturated fill for a disabled or inert surface. */
  | "muted";

/** Which file(s) must carry the value. */
export type Home = "css" | "theme";

export type Token = {
  /** The token's name: `--color-<name>` in CSS, `<NAME>` in `lib/theme.ts`. */
  name: string;
  hex: string;
  role: Role;
  home: Home[];
  /**
   * The contrast floor this token must clear on each ground it may sit
   * on. Absent for grounds, bands and fills, which are not read as text.
   */
  floor?: { on: Ground[]; min: number };
  /** Why the token exists, and what it may not be used for. */
  note: string;
};

export const TOKENS: Token[] = [
  /* Structure and ground */
  {
    name: "ink",
    hex: "#000000",
    role: "text",
    home: ["css", "theme"],
    floor: { on: ["sand", "gravel", "paper"], min: 4.5 },
    note: "Chrome band, text and borders. The only token that clears body contrast on every ground, which is why it carries almost all of the app's text.",
  },
  {
    name: "sand",
    hex: "#f5eacc",
    role: "ground",
    home: ["css", "theme"],
    note: "The app ground. Dominant by design: everything else is placed on it.",
  },
  {
    name: "paper",
    hex: "#ffffff",
    role: "ground",
    home: ["css"],
    note: "Raised surfaces — dialogs and cards. Never adjacent to sand without a border or a rule between them.",
  },
  {
    name: "gravel",
    hex: "#e2ded5",
    role: "ground",
    home: ["css"],
    note: "Dialog ground and hairline fill. Its 4.6 dE from sand is why a rule or a border is required at the seam, and why it is never adjacent to sand bare.",
  },

  /* Marks — the pop tier */
  {
    name: "seafoam",
    hex: "#42d177",
    role: "fill",
    home: ["css"],
    note: "Primary: actions and positive states. chroma 0.176 — a mark, never a ground.",
  },
  {
    name: "watermelon",
    hex: "#ef8ad4",
    role: "fill",
    home: ["css"],
    note: "Secondary: category. chroma 0.152 — a mark.",
  },
  {
    name: "strawberry",
    hex: "#ff6352",
    role: "fill",
    home: ["css"],
    note: "Live, alerts, unread — as a fill. For the same alert as text use strawberry-deep.",
  },
  {
    name: "ocean",
    hex: "#4281ff",
    role: "fill",
    home: ["css"],
    note: "Info: a fill only. 3.01:1 on sand and 3.61:1 on paper are both under the body-text floor, so it cannot carry a link or any other text — use ocean-deep.",
  },
  {
    name: "acid",
    hex: "#cbfb6a",
    role: "fill",
    home: ["css"],
    note: "Highlight, used sparingly. chroma 0.179, the highest in the palette: it is 17.55:1 on sand and still the loudest token here, which is exactly why contrast is the wrong test for a ground and chroma is the right one.",
  },

  /* Text — the deep tier. Derived against gravel, the binding ground. */
  {
    name: "seafoam-deep",
    hex: "#1c713b",
    role: "text",
    home: ["css"],
    floor: { on: ["sand", "gravel"], min: 4.5 },
    note: "The primary as text. 4.50 on gravel, before rounding — the tightest margin in the palette.",
  },
  {
    name: "watermelon-deep",
    hex: "#b4198b",
    role: "text",
    home: ["css"],
    floor: { on: ["sand", "gravel"], min: 4.5 },
    note: "The secondary as text.",
  },
  {
    name: "strawberry-deep",
    hex: "#b8271a",
    role: "text",
    home: ["css"],
    floor: { on: ["sand", "gravel"], min: 4.5 },
    note: "The alert as text: 4.7:1 on gravel.",
  },
  {
    name: "ocean-deep",
    hex: "#0051f3",
    role: "text",
    home: ["css"],
    floor: { on: ["sand", "gravel"], min: 4.5 },
    note: "Links and info as text. Exists because ocean cannot do it: 3.01:1 on sand is under the body floor.",
  },
  {
    name: "amethyst-deep",
    hex: "#5e5e8b",
    role: "text",
    home: ["css"],
    floor: { on: ["sand", "gravel"], min: 4.5 },
    note: "A sixth category as text, held in reserve for Phase 7's hue table.",
  },
  {
    name: "baltic-deep",
    hex: "#1f6c73",
    role: "text",
    home: ["css"],
    floor: { on: ["sand", "gravel"], min: 4.5 },
    note: "The cool band's own text tone, for when a mark has to sit on a baltic band.",
  },
  {
    name: "bpink-deep",
    hex: "#bf0074",
    role: "text",
    home: ["css"],
    floor: { on: ["sand", "gravel"], min: 4.5 },
    note: "The reserved pink band's text tone. Kept in step with bpink below, which is measured but not shipped.",
  },
  {
    name: "grey-quiet",
    hex: "#5f5f5f",
    role: "text",
    home: ["css"],
    floor: { on: ["sand", "gravel"], min: 4.5 },
    note: "De-emphasised text. Replaces the old #707070, which was 4.13:1 on sand and 3.69:1 on gravel — under the body floor on both grounds.",
  },

  /* Bands — pale grounds, one at a time */
  {
    name: "lilac",
    hex: "#E2BFE3",
    role: "band",
    home: ["css"],
    note: "Warm band. chroma 0.062, 13.0 dE from sand. Ink text on it is 12.80:1.",
  },
  {
    name: "baltic",
    hex: "#9adee4",
    role: "band",
    home: ["css"],
    note: "Cool band. chroma 0.069, 12.3 dE from sand. Ink text on it is 13.94:1.",
  },

  /* Muted fills */
  {
    name: "concrete",
    hex: "#b0ad9b",
    role: "muted",
    home: ["css"],
    note: "Inert fill. chroma 0.025 — quiet enough to sit beside a ground without reading as a colour.",
  },
  {
    name: "silver",
    hex: "#b3b3b3",
    role: "muted",
    home: ["css"],
    note: "Inert fill, neutral rather than warm. Only 3.3 dE from concrete, so the two never share an edge.",
  },

  /* The one prop-only token */
  {
    name: "PLACEHOLDER",
    hex: "#5f5f5f",
    role: "text",
    home: ["theme"],
    floor: { on: ["sand", "gravel"], min: 4.5 },
    note: "An empty field's placeholder text. Prop-only, so it has no counterpart in global.css and no class that would name it. It is the same value as grey-quiet, asserted so the two cannot drift.",
  },
];

/**
 * A tone that was measured, is a legitimate candidate, and is deliberately
 * **not shipped**: the band set is two tones (lilac, baltic) and no
 * surface wanted a third. Kept here rather than deleted so the next person
 * to reach for pink starts from the measurement instead of re-deriving it.
 *
 * `bpink` passes the rules — chroma 0.063, 9.1 dE from sand — and is still
 * not a band, which is the most useful thing this list records.
 */
export const RESERVED: Token[] = [
  {
    name: "bpink",
    hex: "#ffd1ed",
    role: "band",
    home: [],
    note: "Measured and rules-passing, but unassigned. Its 6.5 dE from lilac is the tightest pair in the set, and nothing renders it.",
  },
];

/** Every token, shipped or reserved. */
export const ALL_TOKENS: Token[] = [...TOKENS, ...RESERVED];

/** The band set, in the order the plan assigns tones. */
export const BAND_TONES = TOKENS.filter((t) => t.role === "band").map((t) => t.name);

/** The saturation ceiling a `band` token must stay under. */
export const BAND_CHROMA_MAX = 0.09;

/** The minimum perceptual distance between any two grounds. */
export const SEAM_MIN = 6;

/** The ceiling for the `-deep` text tier, which is exempt from the mark rule. */
export const TEXT_CHROMA_MAX = 0.26;

/** The grounds a token may be placed on, by name. */
export const GROUNDS: Record<Ground, string> = {
  sand: "#f5eacc",
  gravel: "#e2ded5",
  paper: "#ffffff",
};

/**
 * The measured facts about a token, so a test can assert a rule without
 * re-deriving it and a reader can see the figure rather than trust it.
 */
export function measure(token: Token, against: Ground) {
  return {
    chroma: chroma(token.hex),
    dE: dE(token.hex, GROUNDS[against]),
    contrast: contrast(token.hex, GROUNDS[against]),
  };
}
