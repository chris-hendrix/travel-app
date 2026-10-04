/**
 * The three rule forms, as class strings.
 *
 * Separate from `RuledBlock.tsx` so `__tests__/ruled-block.test.ts` can
 * assert them without importing the component: `apps/mobile/vitest.config.ts`
 * is plain node with no renderer, and a *value* import of a component
 * file pulls in `react-native`, whose entry point is Flow source that
 * vitest cannot parse. Every existing test in the package avoids this
 * with `import type` or `vi.mock`; these are the three class strings that
 * must not drift, so they live somewhere importable.
 *
 * `RuledRows.tsx` imports them for the same reason and is the only other
 * module that does. Every one of them is written once, here, because
 * `scripts/design-lint.mjs` check 2 is a guard on that: a hand-typed
 * `border-t border-ink pt-6` or `border-t border-rule-soft` anywhere else
 * fails it.
 */

/**
 * A block boundary: the rule, the space under it, and the block's own
 * rhythm. `gap-5` is the block's inner spacing and is part of the form —
 * the sites this replaces had drifted to `none`, `none` and `gap-4`
 * while `Section` used `gap-5`, which is what made a stack of them look
 * like a stack of unrelated things.
 */
export const RULED_BLOCK = "gap-5 border-t border-ink pt-6";

/**
 * A block that has nothing above it to be ruled off from.
 *
 * The rule marks the boundary *above* a block, so a block whose boundary is
 * already drawn — the first block inside a `Band`, where the band's own edge
 * is the boundary — must not draw a second one 40px lower. `global.css`'s rule
 * book states it: "One rule per boundary: a stack of blocks shares rules, it
 * does not double them at every seam." The spacing goes with the rule, since
 * the space above the block is the band's column padding, not this block's.
 */
export const RULED_BLOCK_UNRULED = "gap-5";

/**
 * The table rank's rule colour, on its own: `--color-rule-soft`, ink
 * flattened to a 6-digit hex. Declared apart from `RULE_ROW` so the colour
 * has one spelling even where a caller needs the token without the side —
 * and so `design-lint.mjs` check 11 can name the token rather than a class
 * string that also happens to contain it.
 *
 * Flattened, never `border-ink/40`: `lib/color.ts`'s `parseHex` throws on
 * an 8-digit hex, so an alpha rule could not be measured against its floor
 * in `__tests__/palette.test.ts` at all.
 */
export const RULE_SOFT = "border-rule-soft";

/**
 * A table row's mark: one soft rule, above the row, and nothing else.
 *
 * The test that picks this rank over the other two is **the direction the
 * row is read** — a row read *across* (a name, some accounts, a role) is a
 * table and keeps a rule; a row read *down* is a list and keeps nothing at
 * all. The four call sites are the landing's two tables, the roster and the
 * admin user list.
 *
 * No padding here, unlike `RULED_BLOCK`'s `pt-6`. A table row's vertical
 * space belongs to the row body: the landing's rows are `py-5` at the hero's
 * own scale and the roster's and admin's are `py-3`, and the wrapper hands
 * over the mark rather than flattening three different rhythms into one.
 */
export const RULE_ROW = `border-t ${RULE_SOFT}`;
/**
 * The page's own hairline: a full-width `h-px` with no title and no
 * padding, for a boundary that closes a multi-column block and opens
 * what is under it. Never carries a title — a title is what a *block*
 * has, and a rule with one would be a block wearing a different box.
 *
 * **Reinstated.** This form was withdrawn by the rule-book branch on the
 * argument that a form the app does not draw is a token with no caller. At
 * that moment the argument held: the trip page's only call site had been
 * removed, because the hero band's own lower edge already closed both of
 * that page's columns and changed the ground. `BootCover` then became a
 * caller — the boot screen draws the splash's mark, then *the page's rule*,
 * then the page's foot, and that middle mark is a hairline over nothing,
 * which is exactly this form and not a block rule. So the premise went out
 * of date rather than the form going unused, and the constant is back with
 * the call site that needs it.
 */
export const RULED_BLOCK_PAGE = "h-px w-full bg-ink";
