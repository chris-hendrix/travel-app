import { find } from "linkifyjs";
import type { Opts } from "linkifyjs";

/** The mark the cut wears. One character, and the one a reader expects. */
const ELLIPSIS = "\u2026";

/**
 * Invisible characters a link may never carry: the format controls that
 * reorder text or vanish inside it, the zero-width characters that hide it,
 * the C0/C1 controls that truncate a URL at the platform, the fillers that
 * stand in for a syllable, and the variation selectors and tag characters
 * that can carry a whole hidden string after a visible address. BMP only;
 * the astral ranges are checked separately because a surrogate pair is not
 * one character to a regex without the `u` flag.
 *
 * The isolates, U+2066–U+2069, are in the U+2060–U+206F run and not left to
 * a range of their own: they are the ones that re-read an address backwards
 * without a matching pop, so a set that skipped them would be a narrower
 * guard than the one this replaced.
 */
const INVISIBLE_BMP =
  /[\u0000-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB]/;
/**
 * The astral half, in surrogate pairs: U+1BCA0–1BCA3 shorthand format
 * controls, U+1D173–1D17A musical format controls, U+E0001–E007F tag
 * characters, U+E0100–E01EF variation selectors.
 *
 * One unit is enough to read them in `stoppedAtInvisible`, because the
 * matcher swallows these rather than stopping at them — measured, an
 * address carrying one comes back as a single match with the pair inside
 * it, so `validate.url` refuses it and no half-pair ever reaches a
 * boundary. The guard list in the test iterates them, so a linkifyjs that
 * changed its mind would fail there rather than here.
 */
const INVISIBLE_ASTRAL =
  /\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01-\uDC7F]|\uDB40[\uDD00-\uDDEF]/;

/**
 * Neither regexp above carries the `g` flag, deliberately: `test` on a
 * global regexp keeps state between calls, and the guard would start
 * accepting every other address.
 */
const hasInvisible = (value: string) =>
  INVISIBLE_BMP.test(value) || INVISIBLE_ASTRAL.test(value);

/**
 * The whitespace a match may legitimately sit against — a link at the start
 * of a line is a link — written out rather than `\s`, which is not the set
 * it looks like. ECMAScript's `\s` includes U+FEFF, and the byte-order mark
 * is one of the six characters the matcher stops at, so `\s` here would
 * hand the mark back the very check it is being exempted from.
 */
const WHITESPACE = /[\t\n\v\f\r]/;

/** The schemes a press can follow. See `linkedRuns` — tested on `href`. */
const FOLLOWABLE = /^https?:\/\//i;

/**
 * A match the matcher stopped at: the invisible character is still there,
 * on one side of it, and the address a reader sees spans both halves.
 */
const stoppedAtInvisible = (text: string, start: number, end: number) => {
  const before = text[start - 1];
  const after = text[end];
  const traps = (char: string | undefined) =>
    char !== undefined && hasInvisible(char) && !WHITESPACE.test(char);
  return traps(before) || traps(after);
};

const FIND_OPTIONS: Opts = {
  // The scheme an author on a phone leaves off, which is nearly all of
  // them. A scheme they did type is kept as typed.
  defaultProtocol: "https",
  validate: {
    // Returning false refuses the match outright: the address stays prose,
    // in place, with nothing lost. This is the guard's first line, and it
    // catches most of the class: the matcher swallows the character into
    // the match, so `value` is where it shows up.
    url: (value: string) => !hasInvisible(value),
  },
};

/**
 * A stretch of a description: prose as the author typed it, or an address
 * inside that prose.
 *
 * `value` is what the reader sees, for both variants. `href` is the same
 * address made navigable, which is the only place the two differ.
 */
export type ProseRun =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "link"; readonly value: string; readonly href: string };

/**
 * A member's description, split where the addresses are.
 *
 * **Autolink only, and that is the whole feature.** A description is prose
 * somebody typed on a phone — the wifi password, the door code, the booking
 * they already paid for — and the addresses in it are the one part that
 * wants to be pressable. Nothing else does: no Markdown, no bold, no
 * bullets, no headings. Reading meaning into member prose ends in a
 * description that renders differently from how its author typed it, and
 * luckily the one thing an author does to say "this is a link" is write a
 * link. So the only markup in a description is the markup the text already
 * carries, and the label a reader presses is the address exactly as it was
 * written — no shortened form, no `booking.com` in place of
 * `https://booking.com/xyz?ref=…`, because the part that differs is the
 * part the author chose.
 *
 * **The matcher is linkifyjs, because an address is not a regexp.** Schemes,
 * the TLD list, the punctuation a sentence puts on an address — `(see
 * booking.com).` links `booking.com` and neither the paren nor the full stop
 * — and the fact that `host@airbnb.com` is an address and not a site: all of
 * it is in that package's tables, and retyping it here would be a worse copy.
 *
 * **The false positives are accepted on purpose.** `clip.mov`, `notes.app`
 * and `Rome.it` are a file, an app and a town, and each will render as a
 * link, because `.mov`, `.app` and `.it` are real TLDs and nothing in the
 * string says which reading the author meant. The alternative is a
 * heuristic that also refuses real sites — "booked through jungle.app" is
 * exactly what this feature is for — and the two mistakes do not cost the
 * same. A stray underline on a filename is visible, and the author can undo
 * it by putting a space in; a real address left as prose is a guest who
 * cannot get in. The underline is the cheaper mistake, so it is the one
 * taken.
 *
 * **One guard, and it is not cosmetic.** No link carries an invisible
 * character: not the format controls that re-read an address backwards, not
 * the zero-width characters that hide part of it, not the C0/C1 controls
 * that truncate it at the platform, not the variation selectors and tag
 * characters that can spell a second string after a visible one. An address
 * with one inside it is an address whose visible text is not where it goes —
 * `https://example.com/\u202Excod.exe` reads as `.exe` — and in prose
 * written by another member that is the shape a spoof takes. Such a match is
 * refused whole and stays prose.
 *
 * **The guard is two checks, because the matcher has two ways through.**
 * Measured against linkifyjs, it swallows nearly the whole class: the
 * character lands inside the match, `validate.url` sees it, and one refusal
 * settles it. Six characters are different — the five ASCII whitespace
 * controls and U+FEFF, the byte-order mark — because at those the matcher
 * *stops*, and stopping is worse than swallowing. `https://exa\uFEFFmple.com/a`
 * comes back as a link to `https://exa`, the mark as prose, and then a second
 * link to `https://mple.com/a` — a host the author never wrote, under an
 * underline a reader reads as one continuous address. So a match is refused
 * when the character on either side of it is invisible too: the character
 * the matcher stopped at is still in the text, and what a reader sees spans
 * both halves of it. Refused, both halves stay prose and in place, and the
 * address is neither pressable nor a lie about where it goes.
 *
 * **Whitespace is the one exception, and it is why the exemption is spelled
 * out.** Five of those six characters are `\t`, `\n`, `\r` and friends, and
 * they sit inside the C0 block the guard refuses — so adjacency alone would
 * unlink every address that begins a line. The exemption cannot be `\s`:
 * ECMAScript's `\s` includes U+FEFF, so it would wave through the one
 * character of the six that the check exists for.
 *
 * **What reaches `Linking.openURL` is http(s) or nothing.** The matcher also
 * recognises `file:`, `ftp:` and `mailto:`, and each is a press that lies or
 * a press that dies: `file:///etc/passwd` opens nothing on Android and an
 * address in prose is a place to go on the web. `javascript:` and `data:`
 * the matcher refuses already, and the allowlist makes that a rule rather
 * than a habit.
 *
 * Runs come back in document order, and concatenating every `value`
 * reproduces the input exactly — whitespace, newlines and paragraph breaks
 * included, because they are part of the prose. Two prose runs are never
 * adjacent (a refused match is swallowed back into the prose around it), so
 * a description with nothing to link comes back as one run and renders the
 * markup it renders today.
 */
export function linkedRuns(text: string): ProseRun[] {
  const matches = find(text, "url", FIND_OPTIONS);
  if (matches.length === 0) return [{ type: "text", value: text }];

  const runs: ProseRun[] = [];
  let cursor = 0;
  for (const match of matches) {
    // Two refusals, both leaving the text exactly where it is: a scheme no
    // press can follow, and a match that has an invisible character on one
    // side of it. The scheme is read off `href` and not off the matched
    // text, because the schemeless `booking.com` an author typed has no
    // scheme in it at all while its `href` is the `https://booking.com`
    // the press will follow.
    if (
      !FOLLOWABLE.test(match.href) ||
      stoppedAtInvisible(text, match.start, match.end)
    ) {
      continue;
    }
    if (match.start > cursor) {
      runs.push({ type: "text", value: text.slice(cursor, match.start) });
    }
    runs.push({
      type: "link",
      // Sliced rather than read off the match: the label is what the
      // author wrote, character for character.
      value: text.slice(match.start, match.end),
      href: match.href,
    });
    cursor = match.end;
  }
  if (cursor < text.length) {
    runs.push({ type: "text", value: text.slice(cursor) });
  }
  return runs;
}

/**
 * The runs cut down to `max` visible characters, wearing a `…` at the cut.
 *
 * Exists because the cut can land inside an address, and a link to half an
 * address is worse than no link at all: `https://booking` is a press that
 * goes nowhere, and a label that reads `booking.co` while going to
 * `booking.com` is a press that lies. So what survives of a cut link — and
 * of a cut stretch of prose — comes back as prose, and only a link that
 * survives whole stays pressable.
 *
 * A link that survives is kept whole or not at all: trimming one's label
 * would leave it pointing at an address it no longer spells.
 *
 * `truncated` is a fact about the description it was handed, not about what
 * survives it. Trailing whitespace at the cut is trimmed (`…` should close
 * the last word, not float after a space), which can leave the visible text
 * well short of the limit and still be a description somebody has to press
 * "Read more" to finish. Recomputing the flag from the visible length would
 * silently take that press away. Which also means the flag describes the
 * list it was handed and not the list it hands back: cutting an already-cut
 * list is not a supported input, and a second cut of one the trim left below
 * the limit reports `false`.
 */
export function truncateRuns(
  runs: ProseRun[],
  max: number,
): { runs: ProseRun[]; truncated: boolean } {
  const visible = runs.reduce((length, run) => length + run.value.length, 0);
  if (visible <= max) return { runs, truncated: false };

  const kept: ProseRun[] = [];
  let budget = max;
  for (const run of runs) {
    if (budget <= 0) break;
    if (run.value.length <= budget) {
      kept.push(run);
      budget -= run.value.length;
      continue;
    }
    // The cut lands inside this run: whatever it was, only prose survives.
    // `budget` counts UTF-16 units, the same unit as the `slice` this
    // replaces, so an emoji is two of the limit's characters — but a cut
    // between a surrogate pair would draw half a character, so the last
    // unit of the cut goes with the pair it belongs to.
    const cut = run.value.slice(0, budget);
    const safe = /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
    kept.push({ type: "text", value: safe });
    break;
  }

  // The whitespace the cut left hanging, trimmed off the end — and a run it
  // empties goes with it. A link is never trimmed: its label is the address
  // the press follows, so a shorter label is a link that misdirects. It is
  // kept whole instead, and the `…` arrives as the run after it.
  let tail: ProseRun | undefined = kept.pop();
  while (tail) {
    if (tail.type === "link") {
      kept.push(tail);
      break;
    }
    const trimmed = tail.value.trimEnd();
    if (trimmed.length > 0) {
      kept.push({ type: "text", value: trimmed });
      break;
    }
    tail = kept.pop();
  }

  const end = kept[kept.length - 1];
  if (end && end.type === "text") {
    kept[kept.length - 1] = { type: "text", value: end.value + ELLIPSIS };
  } else {
    kept.push({ type: "text", value: ELLIPSIS });
  }
  return { runs: joinProse(kept), truncated: true };
}

/** Two prose runs are never adjacent: a demoted link joins the run before it. */
function joinProse(runs: ProseRun[]): ProseRun[] {
  const joined: ProseRun[] = [];
  for (const run of runs) {
    const last = joined[joined.length - 1];
    if (run.type === "text" && run.value === "") continue;
    if (run.type === "text" && last && last.type === "text") {
      joined[joined.length - 1] = {
        type: "text",
        value: last.value + run.value,
      };
      continue;
    }
    joined.push(run);
  }
  return joined;
}
