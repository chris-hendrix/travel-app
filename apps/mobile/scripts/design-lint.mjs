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
 * Check 2 — one rule per boundary, in two forms.
 *
 * A stack of blocks shares its rules; it does not double them at every
 * seam. The rule belongs to `RuledBlock` and the hairline to
 * `ruledBlockClasses.ts`, and each has exactly one home. Thirteen
 * hand-written copies of `border-t border-ink pt-6` had drifted to three
 * different inner gaps while `Section` used a fourth, which is what made
 * a stack of them look like a stack of unrelated things rather than one
 * screen.
 *
 * Both needles live in the same file: `ruledBlockClasses.ts` *defines*
 * them and `RuledBlock.tsx` imports them, so the module of strings is the
 * one place either may appear. `PageRule` is the same story -- `h-px` is
 * not in a component at all.
 *
 * `h-px` is checked over `.ts` as well as `.tsx` for that reason. **The
 * plan expected `grep -rn 'h-px' app components` to return nothing after
 * this phase; it cannot, and should not** -- the string has to exist
 * somewhere for `PageRule` to render it. One hit, in the file that
 * defines it, is the correct end state.
 */
const RULE_HOME = "components/ui/ruledBlockClasses.ts";

/**
 * Comments, dropped. These checks look for class strings, and a doc
 * comment that names the class it forbids is not a violation of it --
 * `RuledBlock.tsx` explains why the page rule is not a border, and that
 * sentence contains `h-px` and `border-t`. Without this the check fails on
 * the file that documents it.
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
    // Every occurrence, not the first: four of the thirteen sites share
    // files with three others, and a check reporting one line per file
    // would let three of them through.
    const all = (needle) => {
      const lines = [];
      for (
        let at = src.indexOf(needle);
        at !== -1;
        at = src.indexOf(needle, at + 1)
      ) {
        lines.push(src.slice(0, at).split("\n").length);
      }
      return lines;
    };
    if (rel !== RULE_HOME) {
      for (const at of all("border-t border-ink pt-6")) {
        block.push(`${rel}:${at}`);
      }
    }
    if (rel !== RULE_HOME) {
      for (const at of all("h-px")) page.push(`${rel}:${at}`);
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
 */
const UNDERLINE_RATCHET = 15;

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
 */
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
    for (let k = 1; k < ranges.length; k++) {
      const between = src.slice(ranges[k - 1][1], ranges[k][0]);
      // Anything with a `<` is an element between them: sand content, a
      // Column, a rule. Only whitespace and comments leave them adjacent.
      if (!/<(?!\/\*)/.test(between)) {
        hits.push(
          `${rel}:${lineOf(ranges[k][0])} — band at :${lineOf(ranges[k - 1][0])} is adjacent`,
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

process.exit(failures === 0 ? 0 : 1);
