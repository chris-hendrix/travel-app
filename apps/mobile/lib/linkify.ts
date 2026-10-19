import { find } from "linkifyjs";
import type { Opts } from "linkifyjs";

/** The mark the cut wears. One character, and the one a reader expects. */
const ELLIPSIS = "\u2026";

/**
 * The characters a link may never carry: the zero-width joiners and marks
 * that hide part of an address, and the bidi embeddings, overrides and
 * isolates that re-read it backwards. U+200B–U+200F, U+202A–U+202E,
 * U+2066–U+2069 and the byte-order mark.
 *
 * No `g` flag, deliberately: `test` on a global regexp keeps state between
 * calls and would start refusing every other address.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

const FIND_OPTIONS: Opts = {
  // The scheme an author on a phone leaves off, which is nearly all of
  // them. A scheme they did type is kept as typed.
  defaultProtocol: "https",
  validate: {
    // Returning false refuses the match outright: the address stays prose,
    // in place, with nothing lost.
    url: (value: string) => !INVISIBLE.test(value),
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
 * **One guard, and it is not cosmetic.** No link carries a bidi override or
 * a zero-width character. An address with one inside it is an address whose
 * visible text is not where it goes — `https://example.com/\u202Excod.exe`
 * reads as `.exe` — and in prose written by another member that is the shape
 * a spoof takes. Such a match is refused whole and stays prose. A character
 * the matcher stops at instead of swallowing simply ends the match early,
 * which is the same safe outcome by another route: the character never lands
 * in a link either way.
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
 * `truncated` is a fact about the description it was handed, not about what
 * survives it. Trailing whitespace at the cut is trimmed (`…` should close
 * the last word, not float after a space), which can leave the visible text
 * well short of the limit and still be a description somebody has to press
 * "Read more" to finish. Recomputing the flag from the visible length would
 * silently take that press away.
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
    kept.push({ type: "text", value: run.value.slice(0, budget) });
    break;
  }

  // The whitespace the cut left hanging, trimmed off the end — and a run it
  // empties goes with it.
  let tail: ProseRun | undefined = kept.pop();
  while (tail) {
    const trimmed = tail.value.trimEnd();
    if (trimmed.length > 0) {
      kept.push(
        tail.type === "text"
          ? { type: "text", value: trimmed }
          : { type: "link", value: trimmed, href: tail.href },
      );
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
