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
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx")) out.push(full);
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

process.exit(failures === 0 ? 0 : 1);
