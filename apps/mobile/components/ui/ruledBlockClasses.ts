/**
 * The two rule forms, as class strings.
 *
 * Separate from `RuledBlock.tsx` so `__tests__/ruled-block.test.ts` can
 * assert them without importing the component: `apps/mobile/vitest.config.ts`
 * is plain node with no renderer, and a *value* import of a component
 * file pulls in `react-native`, whose entry point is Flow source that
 * vitest cannot parse. Every existing test in the package avoids this
 * with `import type` or `vi.mock`; these are the two class strings that
 * must not drift, so they live somewhere importable.
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
 * The page's own rule: a full-width hairline with no title and no
 * padding, for a boundary that closes a multi-column block and opens
 * what is under it. Never carries a title — a title is what a *block*
 * has, and a rule with one would be a block wearing a different box.
 */
export const RULED_BLOCK_PAGE = "h-px w-full bg-ink";
