/**
 * design-lint: structural rules about the UI that no unit test can hold.
 *
 * Plain Node, no dependencies, no JSX parser — the checks read the source
 * as text, which is enough for the shapes they look for (a wrapper class,
 * a sibling count) and is why they can run in CI without a renderer.
 * `apps/mobile/vitest.config.ts` is plain node with no renderer (A9), so a
 * rule about layout has nowhere else to live. Follows the
 * `scripts/check-export.mjs` precedent, which `AGENTS.md` justifies as
 * "a script rather than a test".
 *
 * One check per phase; each is added where the phase that fixes the sites
 * can prove the check fires on them first.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, "..");

let failures = 0;
function check(name, ok) {
  if (ok) console.log(`ok: ${name}`);
  else {
    failures += 1;
    console.error(`FAIL: ${name}`);
  }
}

/** Every .tsx under app/ and components/, sorted for a stable report. */
function sources() {
  return sourcesWith(/\.tsx$/);
}

/** The same walk, over the pattern the caller needs. */
function sourcesWith(pattern) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (pattern.test(entry.name)) out.push(full);
    }
  };
  for (const dir of ["app", "components"]) {
    const full = path.join(mobile, dir);
    if (fs.existsSync(full)) walk(full);
  }
  return out.sort();
}

/**
 * The app's own rule, deliberately not a check: `ActionBar` is a dialog's
 * pinned foot and holds one action, and `ActionRow` is a form's foot,
 * where the one button sits beside quiet words by design. Both are the
 * two places a button shares a row on purpose, so neither can be the
 * site a side-by-side pair drifts into. Listed so that a future check
 * that trips on them has to read the reason rather than work around it.
 */
const ALLOW = new Set([
  "components/ui/ActionBar.tsx",
  "components/ui/ActionRow.tsx",
]);

/**
 * Check 1 — no two content buttons side by side.
 *
 * A button is one choice; two of them in a row turn a list into a choice
 * it was never meant to be, and on a phone a pair of halves wraps into a
 * ragged 2+1 that reads as a layout accident. A button beside a *field*
 * is not this rule — that is `PhoneFieldAction`, and it has one button by
 * construction.
 *
 * Counts `<Button>` only, and this is a deliberate narrowing of the
 * plan's wording, which named "two Button or QuietAction siblings". A
 * `QuietAction` is a word, not a box, and four existing rows are two
 * words side by side on purpose: the trip page's two doors to the roll
 * call and the travel board (`trips/detail.tsx:340`), the unsubscribe and
 * reset words under the calendar heading (`profile.tsx:514`), the
 * verify screen's "use a different number" and "resend code"
 * (`verify.tsx:163`), and the admin profile header's Edit/Cancel
 * (`admin/users/detail.tsx:271`). Each carries a comment in the source
 * saying why the row is there. Counting them would mean deleting four
 * deliberate rows, and the rule this check exists to hold is about
 * content buttons — boxes that read as panels. `ActionRow` is the same
 * argument: a form's foot is a button plus words, by design.
 * `app/design/index.tsx` is scanned with everything else, so a specimen
 * that contradicts the rule fails this too.
 *
 * The walk is a tag stack, not a tree: when a `<Button>` opens it counts
 * against the innermost enclosing flex-row View and no further, so a row
 * inside a row is judged on its own and the outer one is not charged for
 * it. That also means a button wrapped in a `flex-1` View still counts —
 * which is how the `/profile` calendar pair was written, and the reason
 * counting direct children only would have missed it.
 */
function checkButtonRows() {
  const hits = [];
  for (const file of sources()) {
    const rel = path.relative(mobile, file);
    if (ALLOW.has(rel)) continue;
    const src = fs.readFileSync(file, "utf8");
    const lineOf = (i) => src.slice(0, i).split("\n").length;
    /** @type {{isRow: boolean, at: number, count: number}[]} */
    const stack = [];
    const tag = /<(\/?)(View|Button)\b([^>]*?)(\/?)>/g;
    let m;
    while ((m = tag.exec(src)) !== null) {
      const [, closing, name, attrs, selfClosing] = m;
      if (closing) {
        // Judged as the View closes: once it is popped its count is gone,
        // and a check that reads the stack after the walk has read nothing.
        const frame = name === "View" ? stack.pop() : undefined;
        if (frame?.isRow && frame.count >= 2) {
          hits.push(
            `${rel}:${lineOf(frame.at)} — ${frame.count} Buttons in one flex row`,
          );
        }
        continue;
      }
      if (name === "View") {
        if (selfClosing) continue;
        const isRow = /className="[^"]*\bflex-row\b/.test(attrs);
        stack.push({ isRow, at: m.index, count: 0 });
        continue;
      }
      const row = [...stack].reverse().find((f) => f.isRow);
      if (row) row.count += 1;
    }
  }
  check("no two content buttons share a flex row", hits.length === 0);
  for (const hit of hits) console.error(`  ${hit}`);
}

checkButtonRows();

/**
 * Check 2 — one rule per boundary.
 *
 * A stack of blocks shares its rules; it does not double them at every
 * seam. The rule belongs to `RuledBlock` and the hairline to
 * `ruledBlockClasses.ts`, and each has exactly one home. Before this branch
 * thirteen hand-written copies of `border-t border-ink pt-6` had drifted to
 * three different inner gaps while `Section` used a fourth, which is what made
 * a stack of them look like a stack of unrelated things rather than one
 * screen.
 *
 * Both needles live in the same file: `ruledBlockClasses.ts` *defines*
 * them and `RuledBlock.tsx` and `RuledRows.tsx` import them, so the module
 * of strings is the one place either may appear.
 *
 * **The `h-px` arm is back, with the page hairline it guards.** This check
 * had a second arm asserting that the page rule's `h-px w-full bg-ink` was
 * written in that module and nowhere else. The page hairline was withdrawn
 * on this branch — its one call site, the trip page's, had been removed,
 * because the hero band's lower edge already closed both columns and
 * changed the ground there, so the rule was a second mark saying one
 * thing, and a guard on a string nothing renders is a guard on nothing.
 * `BootCover` then became a caller: the boot screen draws the splash's
 * mark, then the page's rule, then the page's foot, and that middle mark is
 * a hairline over nothing. So the arm returned alongside the form it guards,
 * which is the condition its own retirement note set.
 */
const RULE_HOME = "components/ui/ruledBlockClasses.ts";

/**
 * Comments, dropped. These checks look for class strings, and a doc
 * comment that names the class it forbids is not a violation of it --
 * `RuledBlock.tsx` explains why a block rule is not a hairline, and that
 * sentence contains `border-t`. Without this the check fails on the file
 * that documents it.
 *
 * Block comments are removed wherever they are. `//` comments are removed
 * only when they open a line, because a `//` mid-line is far more likely
 * to be a URL inside a string (`https://calendar.google.com/...`) than a
 * comment, and eating the rest of such a line would hide a real rule
 * sitting after it.
 */
function code(source) {
  return source
    // Newlines are kept so a reported line number is the line number in
    // the file a human opens, not the line number after the surgery.
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, (line) => " ".repeat(line.length));
}

function checkRuleForms() {
  const block = [];
  const page = [];
  for (const file of sourcesWith(/\.tsx?$/)) {
    const rel = path.relative(mobile, file);
    const src = code(fs.readFileSync(file, "utf8"));
    // Every occurrence, not the first: four of the thirteen pre-branch
    // copies shared files with three others, and a check reporting one
    // line per file would let three of them through.
    if (rel !== RULE_HOME) {
      for (
        let at = src.indexOf("border-t border-ink pt-6");
        at !== -1;
        at = src.indexOf("border-t border-ink pt-6", at + 1)
      ) {
        block.push(`${rel}:${src.slice(0, at).split("\n").length}`);
      }
    }
    if (rel !== RULE_HOME) {
      for (
        let at = src.indexOf("h-px");
        at !== -1;
        at = src.indexOf("h-px", at + 1)
      ) {
        page.push(`${rel}:${src.slice(0, at).split("\n").length}`);
      }
    }
  }
  check(`the block rule is written only in ${RULE_HOME}`, block.length === 0);
  for (const hit of block) console.error(`  ${hit}`);
  check(`the page hairline is written only in ${RULE_HOME}`, page.length === 0);
  for (const hit of page) console.error(`  ${hit}`);
}

checkRuleForms();

/**
 * Check 3 — the underline ratchet.
 *
 * **The plan specified this check the other way round** — "underline is
 * banned on any `text-xs`, with `PhotoCredit.tsx:42` on an explicit
 * allow-list" — and it was not built that way, because that check enforces
 * removal and this phase decided against removal. An underline is the only
 * affordance this system gives a word that does something: no colour marks
 * one, deliberately, since a colour is a role and a word in a row is doing
 * neither. Taking the mark off `PhotoCredit:27` would have left a live link
 * at 12px in 60% ink looking like the prose around it.
 *
 * So the guard is a ratchet rather than a ban: the count of underlined
 * words may not go **up**. Nothing is required to lose its underline, and
 * nothing may quietly gain one either — a new underlined word is a visible,
 * reviewable act on this constant rather than something that happens because
 * a copy-paste carried a class along.
 *
 * Counted on code with comments stripped, so a note that says the word
 * "underline" is not one, and in the whole tree including `.ts` because a
 * component that owns an underlined word is as likely to live in a module
 * as in a screen. The lab is excluded: it *demonstrates* underlines on
 * purpose, so counting it would make every specimen a rule change.
 *
 * The sixteenth underlined word is the landing's link to `/demo` ("Look
 * at a real trip"): a navigation word, and the lab's own rule says a
 * word that does something is underlined. Bumped 15 → 16 for it here
 * rather than removing one elsewhere, because every existing underline is
 * an affordance something relies on.
 */
const UNDERLINE_RATCHET = 16;

function checkUnderlineRatchet() {
  const lab = path.join("app", "design", "index.tsx");
  let total = 0;
  const perFile = [];
  for (const file of sourcesWith(/\.tsx?$/)) {
    if (path.relative(mobile, file) === lab) continue;
    const count = (code(fs.readFileSync(file, "utf8")).match(/\bunderline\b/g) ?? [])
      .length;
    if (count > 0) {
      total += count;
      perFile.push(`${path.relative(mobile, file)} (${count})`);
    }
  }
  check(
    `underlined words do not exceed ${UNDERLINE_RATCHET} (currently ${total})`,
    total <= UNDERLINE_RATCHET,
  );
  if (total > UNDERLINE_RATCHET) {
    console.error(`  ${perFile.join(", ")}`);
  }
}

checkUnderlineRatchet();

/**
 * Check 4 — the display floor, and one leading per step.
 *
 * The display face is for things read at a glance, never for anything a
 * reader reads in a sentence, and 28px (`heading-lg`) is where that starts.
 * Below it the body face sets the same words and the scale is consistent;
 * above it the display face carries them. Seventeen sites were under the
 * floor when this check was written — eleven at 20px and six at 24px — and
 * the point of writing it first is that those seventeen are the phase's own
 * evidence that the work is needed.
 *
 * Matched on `font-display` **as a prefix**, so it covers both the bare
 * `font-display` of the Handjet era and the four `font-display-black`-style
 * tokens that replace it. Matching the exact string would stop firing on
 * the day the face landed, which is exactly when it starts to matter.
 *
 * Leading is checked on display sites only. `leading-snug` and
 * `leading-relaxed` are body-prose decisions and are none of this check's
 * business — but a *display* site carrying one is a second leading opinion
 * on a step that already declared its own, and five named values across 39
 * sites is what that drift looks like. The scale binds size, leading and
 * tracking together in the token, so the correct end state is a display
 * site with **no** leading class at all.
 */
const SIZE_PX = {
  "text-xs": 12,
  "text-sm": 14,
  "text-base": 16,
  "text-lg": 18,
  "text-xl": 20,
  "text-2xl": 24,
  "text-3xl": 30,
  "text-4xl": 36,
  "text-5xl": 48,
  "text-6xl": 60,
  "text-7xl": 72,
  // The scale, after Phase 5 Task 2.
  "text-display-lg": 60,
  "text-display-lg-wide": 72,
  "text-display-md": 42,
  "text-display-md-wide": 48,
  "text-display-sm": 32,
  "text-heading-lg": 28,
  "text-heading-md": 20,
  "text-body": 16,
  "text-label": 14,
};
const DISPLAY_FLOOR_PX = 28;
/** The scale's seven leadings, from the Architecture table. */
const SCALE_LEADINGS = new Set(["0.9", "0.95", "1", "1.1", "1.15", "1.4", "1.5"]);

/** Every string literal in a file, which is where a class list lives. */
function classLiterals(src) {
  return src.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? [];
}

function checkDisplayFloor() {
  const belowFloor = [];
  const oddLeading = [];
  const unknownSize = [];
  for (const file of sources()) {
    const rel = path.relative(mobile, file);
    if (rel === path.join("app", "design", "index.tsx")) continue;
    const src = code(fs.readFileSync(file, "utf8"));
    const lineOf = (i) => src.slice(0, i).split("\n").length;
    for (const literal of classLiterals(src)) {
      if (!/\bfont-display(?:-[a-z]+)?\b/.test(literal)) continue;
      const at = lineOf(src.indexOf(literal));
      const names = literal
        .replace(/["'`]/g, "")
        .split(/[\s:]+/)
        .filter(Boolean);
      let sawSize = false;
      for (const name of names) {
        const arbitrary = name.match(/^text-\[\((\d+(?:\.\d+)?)px\)\]$/);
        const px = SIZE_PX[name] ?? (arbitrary ? Number(arbitrary[1]) : undefined);
        if (px === undefined) continue;
        sawSize = true;
        if (px < DISPLAY_FLOOR_PX) {
          belowFloor.push(`${rel}:${at} — ${name} is ${px}px`);
        }
      }
      if (!sawSize) unknownSize.push(`${rel}:${at} — no size class`);
      for (const name of names) {
        const lead = name.match(/^leading-(?:\[([0-9.]+)\]|(none|tight|snug|normal|relaxed|loose))$/);
        if (!lead) continue;
        const value =
          lead[1] ??
          { none: "1", tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625", loose: "2" }[
            lead[2]
          ];
        if (!SCALE_LEADINGS.has(value)) {
          oddLeading.push(`${rel}:${at} — ${name} (${value})`);
        }
      }
    }
  }
  check(
    `no display site sets type below ${DISPLAY_FLOOR_PX}px`,
    belowFloor.length === 0,
  );
  for (const hit of belowFloor) console.error(`  ${hit}`);
  check(
    "every display site names a declared size",
    unknownSize.length === 0,
  );
  for (const hit of unknownSize) console.error(`  ${hit}`);
  check(
    "no display site carries a leading outside the scale",
    oddLeading.length === 0,
  );
  for (const hit of oddLeading) console.error(`  ${hit}`);
}

checkDisplayFloor();

/**
 * Check 5 — two bands are never adjacent.
 *
 * A band is a ground, so two of them touching is a seam between two grounds
 * with nothing to say what the division means. A reader cannot tell whether
 * they are two sections, a mistake, or one section with a colour change —
 * and the answer is "sand between them", because sand is the ground the page
 * is on and a band is the exception to it.
 *
 * Adjacent means **siblings with no other element between them**, not
 * "anywhere in the file". The landing has both tones and is meant to: sand,
 * `lilac`, sand, `baltic`, sand. What it may not have is `lilac` directly
 * against `baltic`.
 *
 * Bands are matched by their JSX range rather than by line, because a band's
 * content is a whole column of markup and the interesting question is what
 * sits *between* two of them.
 *
 * (The trip page's hero against its stays table is the app's other
 * deliberate adjacency and is **not** listed here, because check 5 works per
 * file and those two bands live in different ones. That gap is recorded in
 * `app/trips/detail.tsx` where the adjacency is.)
 */
const ALLOWED_ADJACENCIES = [
  {
    file: "app/trips/index.tsx",
    tones: ["lilac", "baltic"],
    reason: "Underway against Upcoming: two named sections, and the seam is the division.",
  },
];

function checkBandAdjacency() {
  const hits = [];
  for (const file of sources()) {
    const rel = path.relative(mobile, file);
    const src = code(fs.readFileSync(file, "utf8"));
    // Every <Band …> … </Band> range, depth-counted so a nested one cannot
    // end the outer one early.
    const ranges = [];
    for (let at = src.indexOf("<Band"); at !== -1; at = src.indexOf("<Band", at + 1)) {
      let depth = 1;
      let i = at + "<Band".length;
      while (depth > 0) {
        const nextOpen = src.indexOf("<Band", i);
        const nextClose = src.indexOf("</Band>", i);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth += 1;
          i = nextOpen + "<Band".length;
        } else {
          depth -= 1;
          i = nextClose + "</Band>".length;
        }
      }
      ranges.push([at, i]);
    }
    const lineOf = (i) => src.slice(0, i).split("\n").length;
    const toneOf = (at) => /tone="(\w+)"/.exec(src.slice(at, at + 120))?.[1];
    for (let k = 1; k < ranges.length; k++) {
      const between = src.slice(ranges[k - 1][1], ranges[k][0]);
      // Anything with a `<` is an element between them: sand content, a
      // Column, a rule. Only whitespace and comments leave them adjacent.
      if (/<(?!\/\*)/.test(between)) continue;
      const tones = [toneOf(ranges[k - 1][0]), toneOf(ranges[k][0])];
      const allowed = ALLOWED_ADJACENCIES.some(
        (a) => a.file === rel && a.tones.join() === tones.join(),
      );
      if (!allowed) {
        hits.push(
          `${rel}:${lineOf(ranges[k][0])} — ${tones.join(" against ")} at :${lineOf(ranges[k - 1][0])}`,
        );
      }
    }
  }
  check("no two bands are adjacent siblings", hits.length === 0);
  for (const hit of hits) console.error(`  ${hit}`);
}

checkBandAdjacency();

/**
 * Check 6 — a band is never inside a column.
 *
 * A band is full bleed by definition: it is the one thing in this system that
 * breaks the measure, which is the whole reason `Screen` stopped wrapping its
 * children in a column. A `<Band>` written inside a `<Column>` is therefore
 * not a band at all — it is a coloured card inset in the page, which is the
 * shape the trip page rejected and which reads as a mistake rather than as a
 * ground.
 *
 * **This check exists because that shipped** — and it does not catch the case
 * that motivated it. `/trips` had its `Column` in `TripsScreen` and its
 * `Band` in `TripsContent`, so the nesting crossed a component boundary and
 * no per-file JSX scan can see it. What this catches is the literal form: a
 * band written inside a column in one block of JSX. That is a real mistake
 * worth failing on, but the rule for the rest is a convention — the component
 * holding a band is rendered directly under `Screen`, never inside a
 * `Column` — and it is written down in `Band.tsx` rather than enforced. A band containing a `<Column>` is correct and
 * expected — that is how its content stays in the measure — so the test is
 * one-directional: band inside column fails, column inside band passes.
 */
function checkBandsAreFullBleed() {
  const hits = [];
  for (const file of sources()) {
    const rel = path.relative(mobile, file);
    const src = code(fs.readFileSync(file, "utf8"));
    const lineOf = (i) => src.slice(0, i).split("\n").length;
    // Each <Column …> … </Column> range, depth-counted.
    for (
      let at = src.indexOf("<Column");
      at !== -1;
      at = src.indexOf("<Column", at + 1)
    ) {
      let depth = 1;
      let i = at + "<Column".length;
      while (depth > 0) {
        const nextOpen = src.indexOf("<Column", i);
        const nextClose = src.indexOf("</Column>", i);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth += 1;
          i = nextOpen + "<Column".length;
        } else {
          depth -= 1;
          i = nextClose + "</Column>".length;
        }
      }
      const band = src.indexOf("<Band", at);
      if (band !== -1 && band < i) {
        hits.push(`${rel}:${lineOf(band)} — band inside the column at :${lineOf(at)}`);
      }
    }
  }
  check("no band is nested inside a column", hits.length === 0);
  for (const hit of hits) console.error(`  ${hit}`);
}

checkBandsAreFullBleed();

/**
 * Check 9 — the rule census, as a ratchet.
 *
 * The app drew structural lines in nine spellings at two weights across 54
 * code sites, and `global.css`'s rule book declared one of them. This is the
 * count of those sites, and it may only go **down** — the same shape as check
 * 3's underline ratchet rather than a ban, because the sweep that fixes them
 * runs one phase at a time and a ban would fail every phase between here and
 * the end of it.
 *
 * **It has been ratcheted.** The seed was 54 and this branch lands it at 42:
 * arm 1's twenty-nine hand-written marks are down to the six named exceptions,
 * and arm 2's count is up by eleven because the sweep replaced those marks
 * with the one component that draws the block rank, which the census counts
 * as a site. Those are the same pixels moved, not new ones — which is the
 * other half of what this ratchet is for: it does not reward a rule for
 * being spelled better, and it does not punish one for going through the
 * component that owns it. What it forbids is a *net* increase in the places
 * a person chose a mark.
 *
 * **The number is of code sites, not of rendered rules.** A row class
 * written once inside a `.map` that draws a rule per row is one site, not
 * one per row. The two numbers are different on purpose: the ratchet is
 * about places a *person* chose a mark, and a rendered count would reward
 * splitting one `.map` into four call sites, which changes no pixels and
 * halves the constant for free.
 *
 * Two arms, and exactly two:
 *
 *   1. a className string containing `border-[tblr]` as its own
 *      whitespace-delimited token — so `border border-ink` on a control,
 *      which is the control's own edge rather than a rule, is not counted;
 *   2. a `<RuledBlock` / `<Section` call site that does **not** pass
 *      `rule={false}` — a component that draws the block rule is a rule site
 *      whatever its className says.
 *
 * Both are restricted to `app/` + `components/`, excluding `app/design/`
 * as a directory rather than a file: the lab *demonstrates* marks on
 * purpose, so counting it would make every specimen a rule change, and its
 * `frame.tsx` and `motion.tsx` demonstrate them exactly as deliberately as
 * `index.tsx` does.
 *
 * Measured on this tree: **6 + 36 = 42** (down from the seeded 29 + 25 = 54
 * as the sweep landed). Arm 1's six survivors are exactly the marks check 11
 * grants by name — the Autofill split, three chrome edges, and
 * `DisclosureButton`'s one deliberate list-row rule; the unread accent is not
 * among them because it is a `border-l-4` and arm 1 takes a bare side.
 * Arm 2's thirty-six are `<RuledBlock>`/`<Section>` sites that draw the
 * block rank, out of thirty-nine call sites: the other three pass
 * `rule={false}`, because a band's edge is already their boundary. (The plan
 * recorded 14 + 25 = 39; arm 2 measured exactly 25 at the seed and arm 1
 * measured 29 — the latter being the whole of the plan's own "Every site,
 * before and after" table, chrome edges and named exceptions included. The 14
 * is a miscount; the ratchet is seeded on the measurement, because the check
 * is the authority and the plan is a record of one run.)
 */
const RULE_CENSUS_MAX = 42;

/**
 * Every string literal with its offset. `classLiterals` (check 4) hands back
 * the values alone, which is fine there and wrong here: four of this
 * census's sites share one identical class string, so a value-only scan
 * would report all four at the first one's line.
 */
function classLiteralSpans(src) {
  const out = [];
  const re = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push([m.index, m[0]]);
  return out;
}

/**
 * The end of a JSX opening tag, skipping over `>` inside an attribute
 * string — a `note="a > b"` would otherwise truncate the tag and hide a
 * `rule={false}` written after it.
 */
function jsxTagEnd(src, from) {
  let quote = null;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === ">") return i;
  }
  return src.length;
}

function checkRuleCensus() {
  const labDir = path.join("app", "design") + path.sep;
  const marks = [];
  const blocks = [];
  for (const file of sources()) {
    const rel = path.relative(mobile, file);
    if (rel.startsWith(labDir)) continue;
    const src = code(fs.readFileSync(file, "utf8"));
    const lineOf = (i) => src.slice(0, i).split("\n").length;
    // Arm 1 — a mark typed as a class.
    for (const [at, literal] of classLiteralSpans(src)) {
      const tokens = literal.replace(/["'`]/g, "").split(/\s+/).filter(Boolean);
      if (!tokens.some((name) => /^border-[tblr]$/.test(name))) continue;
      marks.push(`${rel}:${lineOf(at)}`);
    }
    // Arm 2 — a mark drawn by the component that owns it.
    const tag = /<(RuledBlock|Section)(?=[\s/>])/g;
    let m;
    while ((m = tag.exec(src)) !== null) {
      const end = jsxTagEnd(src, m.index + m[0].length);
      if (/rule=\{false\}/.test(src.slice(m.index, end))) continue;
      blocks.push(`${rel}:${lineOf(m.index)}`);
    }
  }
  const total = marks.length + blocks.length;
  console.log(
    `census: ${total} — ${marks.length} marked class strings, ${blocks.length} ruled blocks`,
  );
  check(
    `rule sites do not exceed ${RULE_CENSUS_MAX} (currently ${total})`,
    total <= RULE_CENSUS_MAX,
  );
  if (total > RULE_CENSUS_MAX) {
    for (const hit of [...marks, ...blocks]) console.error(`  ${hit}`);
  }
}

checkRuleCensus();

/**
 * Check 10 — a Column's children do not restate its vertical padding.
 *
 * `Column` carries the app's vertical rhythm, `py-6 md:py-10`. A child
 * inside one that declares its own vertical padding is therefore opening
 * on two of that rhythm where every other block opens on one.
 *
 * **This check exists because that shipped, six times, and was recorded as
 * deliberate** — the plan's closeout note described the landing's four
 * sites as "kept for the air at each seam." They were not a decision. Each
 * was a verbatim restatement of its parent's `py-6 md:py-10`, and the
 * duplication is what made the trips page visibly inconsistent: two
 * sibling bands built the same way, one of them opened 40px lower than
 * the other. It survived seven phases because a note said it was
 * intentional and nobody checked whether it was. Hence a check rather
 * than another careful pass.
 *
 * Allow-listed by exact class string rather than by line number, because
 * line numbers drift on every edit to these files and a stale allow-list
 * is a check that silently stops guarding anything. Each entry is a
 * *different* rhythm from the Column's, not a restatement of it, and each
 * wants the owner's eye rather than this script's judgement.
 */
const COLUMN_PADDING_ALLOW = new Set([
  // The landing and the invitation open on a display heading and want more
  // air than the default rhythm. They express a real intent; `Column`'s
  // `lead` variant is the mechanism built for it and neither uses it yet.
  "gap-6 pb-12 pt-4 md:pt-14",
  "gap-8 py-6 pt-4 md:pt-14",
]);

function checkColumnChildrenCarryNoPadding() {
  const hits = [];
  const vertical = /(?:^|\s)(?:[a-z]+:)?(?:py|pt|pb)-/;
  for (const file of sources()) {
    const rel = path.relative(mobile, file);
    // The lab is documentation and demonstrates spacing on purpose, and
    // `Column.tsx` is where the rhythm is defined rather than restated.
    if (rel === "components/ui/Column.tsx" || rel.startsWith("app/design/")) {
      continue;
    }
    const src = code(fs.readFileSync(file, "utf8"));
    const lineOf = (i) => src.slice(0, i).split("\n").length;
    for (
      let at = src.indexOf("<Column");
      at !== -1;
      at = src.indexOf("<Column", at + 1)
    ) {
      // Walk out to this Column's matching close, depth-counted, so a
      // child of a nested Column is not also read as a child of the outer.
      let depth = 1;
      let end = at + "<Column".length;
      while (depth > 0) {
        const open = src.indexOf("<Column", end);
        const close = src.indexOf("</Column>", end);
        if (close === -1) break;
        if (open !== -1 && open < close) {
          depth += 1;
          end = open + "<Column".length;
        } else {
          depth -= 1;
          end = close + "</Column>".length;
        }
      }
      const inner = src.slice(at, end);
      // Only the Column's own opening tag, so this Column's attributes
      // (a `lead`, say) are not mistaken for a child's className.
      const openTag = inner.slice(0, inner.indexOf(">") + 1);
      const rest = inner.slice(openTag.length);
      // The direct child is the first opening element after the tag. Only a
      // `View` counts: the fault is a *container* stacking the rhythm, and
      // a `Text` carrying its own `pb-3` is a heading's spacing inside a
      // block, which is a different thing and correct.
      const child = rest.search(/<([A-Z][A-Za-z0-9.]*)/);
      if (child === -1) continue;
      const tag = /^<([A-Z][A-Za-z0-9.]*)/.exec(rest.slice(child))?.[1];
      if (tag !== "View") continue;
      const childAt = at + openTag.length + child;
      // Only the child's *own* opening tag. Reading a fixed window ahead
      // would run past a child that carries no className at all and pick
      // up a descendant's, which is how a `Text`'s pb-3 got reported here.
      const childTag = rest.slice(child, rest.indexOf(">", child) + 1);
      const className = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(childTag);
      const value = (className?.[1] ?? className?.[2] ?? "").trim();
      if (!value || !vertical.test(value)) continue;
      if (COLUMN_PADDING_ALLOW.has(value)) continue;
      hits.push(
        `${rel}:${lineOf(childAt)} — "${value}" under the column at :${lineOf(at)}`,
      );
    }
  }
  check("no column child restates the column's vertical padding", hits.length === 0);
  for (const hit of hits) console.error(`  ${hit}`);
}

checkColumnChildrenCarryNoPadding();

/**
 * Check 7 — reduced motion is read with a hook, never with a media query.
 *
 * `react-native-css` evaluates a native media query against a fixed list of
 * features and `prefers-reduced-motion` is not one of them, so the block falls
 * through to `if (typeof value !== "number") return false` — the value is the
 * string `reduce`, so it is false, always. A `@media (prefers-reduced-motion:
 * reduce)` block therefore works on the web export and **silently never matches
 * on Android**, which is the platform no browser can check for you.
 *
 * This is the only check here that exists to stop a *silent* bug rather than a
 * visible one. Every other fault in this file shows up as something wrong on
 * screen; this one shows up as nothing at all on one of the two surfaces, which
 * is why it needs a machine and the others only need a careful reader.
 *
 * Comments are stripped first, and that is load-bearing: the rule is *described*
 * in `components/ui/motionClasses.ts` and in this check, and a check that fired
 * on its own explanation would be unfixable.
 */
const CSS_AND_MOTION_DIRS = ["app", "components", "hooks", "lib"];

/** Every .css and .ts(x) the motion rules could be written in. */
function motionSources() {
  const out = [path.join(mobile, "global.css")];
  for (const dir of CSS_AND_MOTION_DIRS) {
    const full = path.join(mobile, dir);
    if (!fs.existsSync(full)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const next = path.join(d, entry.name);
        if (entry.isDirectory()) walk(next);
        else if (/\.tsx?$/.test(entry.name)) out.push(next);
      }
    };
    walk(full);
  }
  return out.sort();
}

function checkNoReducedMotionMediaQuery() {
  const hits = [];
  for (const file of motionSources()) {
    const src = code(fs.readFileSync(file, "utf8"));
    for (
      let at = src.indexOf("prefers-reduced-motion");
      at !== -1;
      at = src.indexOf("prefers-reduced-motion", at + 1)
    ) {
      hits.push(
        `${path.relative(mobile, file)}:${src.slice(0, at).split("\n").length}`,
      );
    }
  }
  check(
    "reduced motion is read with useReducedMotion, never a media query",
    hits.length === 0,
  );
  for (const hit of hits) console.error(`  ${hit}`);
}

checkNoReducedMotionMediaQuery();

/**
 * Check 8 — a press state and a pointer state are asked for, never typed.
 *
 * `active:` and `hover:` are the whole of this system's press and pointer
 * feedback, and every one of them has to answer the same two questions: which
 * properties move (one `transition-property` list, never two `transition-*`
 * classes fighting over it), and what it becomes when the device has reduced
 * motion on. A press or a hover written by hand answers neither, and it answers
 * the second one by silently doing nothing — the same shape of failure as
 * check 7.
 *
 * Hover is in here for a third reason: the only honest use of it is to *add* to
 * a resting state that is already correct without it. A `hover:` typed at a
 * call site is most often a control that hides and reveals, which on a phone is
 * a control that is either missing or invisible-but-tappable. In the vocabulary
 * it is one property on one role, next to the press it accompanies.
 *
 * So both may appear in exactly one file, `components/ui/motionClasses.ts`,
 * where the five roles and their reduced forms are. A component asks for
 * `motion.row`.
 *
 * The lab is scanned with everything else rather than excluded: a specimen that
 * demonstrates motion should be spending the same vocabulary a screen does,
 * and if it cannot, that is the finding.
 */
const MOTION_HOME = path.join("components", "ui", "motionClasses.ts");

function checkPressStatesComeFromTheVocabulary() {
  const hits = [];
  for (const file of motionSources()) {
    const rel = path.relative(mobile, file);
    if (rel === MOTION_HOME) continue;
    const src = code(fs.readFileSync(file, "utf8"));
    for (const needle of ["active:", "hover:"]) {
      for (let at = src.indexOf(needle); at !== -1; at = src.indexOf(needle, at + 1)) {
        hits.push(`${rel}:${src.slice(0, at).split("\n").length} — ${needle}`);
      }
    }
  }
  check(`every press and pointer state comes from ${MOTION_HOME}`, hits.length === 0);
  for (const hit of hits) console.error(`  ${hit}`);
}

checkPressStatesComeFromTheVocabulary();

/**
 * Check 11 — a rule is a declared rank, and gravel is not one.
 *
 * `global.css`'s rule book declares three ranks and the app drew its lines
 * in nine spellings at two weights, so the check holds both halves of that
 * in one place:
 *
 *   1. **No gravel border outside `PushOptIn`'s box.** Gravel is 1.12:1 on
 *      sand — it is a ground, not a line — so a gravel rule is a smudge
 *      where the same boundary elsewhere is a black one. Phase 5 took the
 *      last six off; this is what stops the next one arriving as a copy of
 *      the row it was copied from.
 *   2. **A mark is a declared rank.** Every rule in the tree is one of the
 *      entries below or it is a fourth rank, which is a decision for a
 *      person. This is the arm the plan's negative case names: a
 *      `border-b border-ink` typed onto a list row is exactly the fault
 *      Phase 4 swept, and it is nowhere in the list.
 *
 * **The lab is excluded, as a directory, for the reason check 9 excludes
 * it**: `app/design/` *demonstrates* marks on purpose — `frame.tsx` and
 * `motion.tsx` show the with-and-without specimens on purpose, and
 * `index.tsx`'s rule book quotes the very classes being forbidden. Counting
 * it would make every specimen a lint failure. The four real gravel rules
 * in `frame.tsx` and `motion.tsx` are therefore outside this check's reach
 * and stay outside the app; they are specimens, not sites.
 *
 * **What counts as a mark.** The same line check 9's arm 1 takes — a side
 * token, `border-[tblr]`, as a token of its own — widened by exactly two
 * steps, both forced by survivors: a side with a width (`border-l-4`, the
 * unread accent) and a side named inside the colour (`border-b-gravel`),
 * which rule 1 needs in order to see a gravel rule at all. A **bare
 * `border` is never a mark**. That one exclusion is load-bearing: it is
 * what keeps `AppHeader`'s `border-b border-ink bg-gravel` a chrome edge
 * rather than a gravel rule (rule 1 reads the *border's* colour, and a
 * gravel *ground* beside an ink rule is chrome, not a rule), and it is what
 * keeps `PushOptIn`'s `border border-gravel` and the controls' own
 * `border border-ink` outlines out of the rank arm. `border-l-0` is not a
 * mark either — a zero width draws nothing, and `Segmented` uses it to
 * cancel the shared left edge between two cells.
 *
 * Allow-listed by **file** against the literal's **border tokens**, order
 * and layout classes ignored, so re-ordering a class string is not a lint
 * failure and a *changed* mark is. Each entry states the class it permits
 * and why it is not an oversight, because the difference between an
 * exception and an oversight is the sentence next to it. The file is the
 * key rather than the line number: line numbers drift on every edit, and a
 * stale allow-list that keeps its key has silently stopped guarding
 * anything. A stale *key* fails loudly instead, which is the trade.
 *
 * `ruledBlockClasses.ts` is on the list like any other file, for its two
 * declared ranks — it is not exempted wholesale, so a `border-b border-ink`
 * written there would fail too. Its table rank's signature carries no
 * colour because the colour is the interpolated `${RULE_SOFT}` beside it,
 * which is the point: a hand-typed `border-t` anywhere else has no
 * `RULE_SOFT` to point at.
 */
const BORDER_TOKEN = /^border(-[a-z0-9]+){1,3}$/;
/** A rule token: a side, optionally at a width. `border-l-0` draws nothing. */
const RULE_TOKEN = /^border-[tblrxy](?:-(?!0$)\d+)?$/;
/** A border painted gravel, on one side or on the whole box. */
const GRAVEL_BORDER = /^border(-[tblrxy])?-gravel$/;

const DECLARED_RANKS = new Map([
  [
    RULE_HOME,
    [
      {
        mark: "border-t border-ink",
        reason:
          "THE BLOCK RANK — `RULED_BLOCK`. Written here once and nowhere else, " +
          "which is what check 2 and `__tests__/ruled-block.test.ts` hold.",
      },
      {
        mark: "border-t",
        reason:
          "THE TABLE RANK — `RULE_ROW`. Its colour is the `${RULE_SOFT}` " +
          "interpolated beside it, so the signature has no colour in it.",
      },
    ],
  ],
  [
    "components/ui/AppHeader.tsx",
    [
      {
        mark: "border-b border-ink",
        reason:
          "CHROME EDGE (:300) — the bar's own lower edge, ink on a gravel " +
          "ground so the bar reads as a bar rather than as the last thing in " +
          "the content. The gravel is the bar's fill, not its rule. Nothing " +
          "scrolls under it, which is the test that separates a chrome edge " +
          "from a rule.",
      },
    ],
  ],
  [
    "components/ui/ActionBar.tsx",
    [
      {
        mark: "border-t border-ink",
        reason:
          "CHROME EDGE (:33 the dialog's pinned foot on gravel, :34 the screen " +
          "bar on sand) — the bar marks itself at its top edge for the same " +
          "reason as the other three: the ground here is the page, and without " +
          "the line the bar is invisible. One entry for both, because the two " +
          "differ in ground and not in rank.",
      },
    ],
  ],
  [
    "components/ui/DatePicker.tsx",
    [
      {
        mark: "border-b border-ink",
        reason:
          "CHROME EDGE (:63) — the picker's header separating from its grid. " +
          "The grid's days are read across, so :62's `border border-ink` box " +
          "is already the boundary and this is the header's own edge inside " +
          "it, not a second rule for the same one.",
      },
    ],
  ],
  [
    "components/ui/DisclosureButton.tsx",
    [
      {
        mark: "border-b border-ink",
        reason:
          "THE ONE DELIBERATE LIST-ROW RULE in the app, and the reason is " +
          "this file and no other: these rows sit inside the trigger's own " +
          "box, where the box edge is the boundary and the rules are what " +
          "stop the stack dissolving into what it just opened. Ink rather " +
          "than the soft table rule, because the trigger above it is an " +
          "ink-bordered secondary button and a line a quarter of its weight " +
          "under it reads as a mistake.",
      },
    ],
  ],
  [
    "components/trip/TravelDialog.tsx",
    [
      {
        mark: "border-l border-ink",
        reason:
          "THE ONE VERTICAL RULE in the app, and the one place adjacent " +
          "inline content needs a visible boundary: it splits the flight " +
          "field from the Autofill button standing in for it. `global.css`'s " +
          "rule book names it as the field's Autofill split.",
      },
    ],
  ],
  [
    "components/notification/NotificationRow.tsx",
    [
      {
        mark: "border-l-4 border-l-strawberry border-l-transparent",
        reason:
          "STATE, NOT STRUCTURE — the unread accent. It reports that a " +
          "notification has not been read, which is a fact about the row " +
          "rather than a boundary between it and its neighbours, so it is " +
          "not one of the three ranks and cannot become one. The transparent " +
          "arm is what keeps read rows flush down the column. Both arms are " +
          "in the signature because the literal names both.",
      },
    ],
  ],
]);

const GRAVEL_ALLOW = new Map([
  [
    "gap-2 border border-gravel bg-paper p-4",
    "PushOptIn's box — the one gravel border the app keeps. It is a card " +
      "outline on a form, not a rule: the box says \"this panel exists\" and " +
      "nothing is divided by it, so the 1.12:1 that disqualifies a gravel " +
      "*rule* does not disqualify a gravel box on a paper ground. Allowed " +
      "by exact class string rather than by file, so a second gravel border " +
      "in the same component still fails.",
  ],
]);

/**
 * The border tokens of a class string, as its rule's signature.
 *
 * First-appearance order, not sorted, so the signature reads the way the
 * class string does — `border-t border-ink`, which is the order every rank
 * in the book is written in. Sorted would give `border-ink border-t` and a
 * reader would have to work out which half of it is the side. Duplicates
 * are dropped (the NotificationRow ternary names both arms of one accent)
 * and layout classes are not part of it.
 */
function ruleSignature(tokens) {
  const seen = new Set();
  const out = [];
  for (const token of tokens) {
    if (!BORDER_TOKEN.test(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out.join(" ");
}

function checkRuleIsADeclaredRank() {
  const labDir = path.join("app", "design") + path.sep;
  const gravel = [];
  const undeclared = [];
  for (const file of sourcesWith(/\.tsx?$/)) {
    const rel = path.relative(mobile, file);
    if (rel.startsWith(labDir)) continue;
    const src = code(fs.readFileSync(file, "utf8"));
    const lineOf = (i) => src.slice(0, i).split("\n").length;
    for (const [at, literal] of classLiteralSpans(src)) {
      const tokens = literal.replace(/["'`]/g, "").split(/\s+/).filter(Boolean);
      const value = tokens.join(" ");
      if (tokens.some((t) => GRAVEL_BORDER.test(t)) && !GRAVEL_ALLOW.has(value)) {
        gravel.push(`${rel}:${lineOf(at)} — ${value}`);
        continue;
      }
      if (!tokens.some((t) => RULE_TOKEN.test(t))) continue;
      const signature = ruleSignature(tokens);
      if (DECLARED_RANKS.get(rel)?.some((e) => e.mark === signature)) continue;
      const known = (DECLARED_RANKS.get(rel) ?? []).map((e) => e.mark);
      undeclared.push(
        `${rel}:${lineOf(at)} — ${signature}` +
          (known.length ? ` (this file declares ${known.join(" | ")})` : ""),
      );
    }
  }
  check("no gravel border outside PushOptIn's box", gravel.length === 0);
  for (const hit of gravel) console.error(`  ${hit}`);
  check("every rule is a declared rank", undeclared.length === 0);
  for (const hit of undeclared) console.error(`  ${hit}`);
}

checkRuleIsADeclaredRank();

process.exit(failures === 0 ? 0 : 1);
