/**
 * The motion vocabulary: five roles, and the reduced-motion form of each.
 *
 * Separate from the hook that spends them, for the reason
 * `ruledBlockClasses.ts` gives: `apps/mobile/vitest.config.ts` is plain
 * node with no renderer, and a *value* import of anything that reaches
 * `react-native` pulls in Flow source that vitest cannot parse. These two
 * maps are the thing that must not drift, so they live somewhere a test
 * can import them and hold them still.
 *
 * ## The methodology
 *
 * The order is the whole of it, and it is answered before any code is
 * written. Every motion in this app passed through these six questions in
 * this order, and a proposed animation that fails one of them is not
 * built:
 *
 * 1. **Should it animate at all?** By how often the reader meets it.
 *    Something they hit a hundred times a day gets the platform default
 *    or nothing. Tens of times a day gets under 150ms or nothing. The
 *    delight budget is spent on the rare things, and there are none in
 *    this vocabulary — every role below is a press or a state change,
 *    which is the tens-of-times-a-day tier.
 * 2. **What is it for?** One word: feedback, or a state indication, or
 *    preventing a jarring change. "Because it looks nice" is not one of
 *    them, and it is the reason most motion should not be written.
 * 3. **What is the cheapest thing that does it?** A press, a toggle, a
 *    colour flipping is a CSS transition — a class, no JavaScript. A loop
 *    or a mount-only sequence is a CSS animation. Something entering or
 *    leaving is a layout animation. Only a finger on a moving element
 *    needs a shared value and a worklet, and nothing in this app has one
 *    yet. A native screen transition is the stack's job, not ours.
 * 4. **Which properties?** `transform` and `opacity` are the only two
 *    that do not cost a layout pass. `width`, `height`, `margin`, `flex`,
 *    `top` and `left` re-run layout for the node *and its siblings* every
 *    frame. There is one exception and nothing here uses it: an
 *    absolutely positioned element with no children is out of flow, so
 *    animating its width costs nothing and keeps the corner it would
 *    otherwise smear.
 * 5. **Spring or curve, and how long?** A finger on the element means a
 *    spring, because a spring carries the gesture's velocity through an
 *    interruption and a curve restarts. Nothing here has a finger on it —
 *    a press is two states, not a drag — so everything here is a curve,
 *    and it is the one curve in `global.css`: 150ms on `--ease-motion`.
 *    Never `ease-in` on a control: it starts slow, and the start is the
 *    exact moment a thumb is watching.
 * 6. **Which thread?** The one this file exists to keep: a className
 *    compiles through `react-native-css` into a Reanimated animation, so
 *    it runs on the UI thread and React does not re-render for it. A
 *    `setState` per frame in a gesture or a scroll handler is the single
 *    biggest cause of jank in a React Native app, and none of this
 *    vocabulary can cause it.
 *
 * ## Why this is a hook and not a CSS media query
 *
 * `react-native-css` evaluates a native media query against a fixed list
 * of features (`native/conditions/media-query.js`): `dir`, `hover`,
 * `platform`, `prefers-color-scheme`, `display-mode`, the width and height
 * ranges, `orientation`, `resolution`. `prefers-reduced-motion` is not in
 * it, so it falls through to `if (typeof value !== "number") return false`
 * — the value is the string `reduce`, so it is false, always. A
 * `@media (prefers-reduced-motion: reduce)` block in `global.css` would
 * therefore work on the web export and **silently never match on
 * Android**, which is the platform no browser can check for you.
 * `scripts/design-lint.mjs` fails on the string so it cannot be written by
 * accident.
 *
 * The hook is not the expensive alternative it looks like.
 * `useReducedMotion` is not a subscription — it is a module constant read
 * at import time:
 *
 * ```js
 * const IS_REDUCED_MOTION_ENABLED_IN_SYSTEM = isReducedMotionEnabledInSystem();
 * export function useReducedMotion() { return IS_REDUCED_MOTION_ENABLED_IN_SYSTEM; }
 * ```
 *
 * so it is already correct on the first render on both surfaces (native
 * reads `global._REANIMATED_IS_REDUCED_MOTION`, set before JS runs; web
 * reads `matchMedia` at import). There is no frame of motion before it
 * resolves, and it never changes for the life of the process — which is
 * also what keeps this gate clear of `react-native-css`'s warning that a
 * className gaining or losing an animation re-mounts the subtree. That
 * warning cannot fire here, because the answer cannot change.
 *
 * ## Why layout animations are not in this file
 *
 * `entering` / `exiting` and the layout transitions need no gate.
 * Reanimated's `BaseAnimationBuilder` defaults `reduceMotionV` to
 * `ReduceMotion.System` for every builder, and the web implementation
 * mirrors it, so a list entrance is already reduced-motion aware. A gate
 * here would be a second opinion on a question Reanimated has answered.
 *
 * ## What reduced motion keeps, and what it drops
 *
 * "Fewer and gentler, not zero." A change of colour or opacity that
 * explains a state change is kept — a control that inverts when you answer
 * it still inverts, and it still takes 150ms to do it. What goes is
 * movement: translation, scale, rotation, overshoot. So three of the five
 * roles below are unchanged and only the two that move geometry have a
 * second form.
 *
 * The one place that needs care is `press`. Dropping the scale would leave
 * a button with no press state at all, which is not "fewer", it is an
 * affordance removed — so the scale becomes an opacity, which is on the
 * keep list and works on every `Button` variant without inventing a second
 * colour per variant.
 *
 * ## The roles
 *
 * Named for the interaction rather than the property, because a caller
 * knows what it is building and should not have to know which of
 * `transform`, `scale` and `backgroundColor` that implies. Five, and a
 * sixth gets added when something needs it rather than now.
 */

/**
 * A box that is pressed and does not change what it is: a button, a quiet
 * action, a chip link, the row inside a disclosure.
 *
 * `scale-[0.97]` rather than something smaller because the scale takes the
 * label and the icons with it, and that is what makes it read as physical;
 * `0.9` and below reads as a squash. 150ms is the top of the press range —
 * a press that takes longer has finished before it has drawn.
 */
const press = "transition-transform duration-150 ease-motion active:scale-[0.97]";

/**
 * A box that is pressed *and* inverts: a chip, a checkbox. Two properties,
 * so one `transition-property` list rather than two `transition-*` classes
 * — `transition-transform` and `transition-colors` both write
 * `transition-property`, and which one wins is decided by CSS source order
 * rather than by the order they are written in the className. That is a
 * coin flip that looks like it works.
 */
const pressFill =
  "transition-[transform,background-color,border-color,color] duration-150 ease-motion active:scale-[0.97]";

/**
 * A full-width row. It highlights rather than scaling, because a row that
 * scales reads as the whole screen squishing — the one exception to the
 * press rule, and it is the width that earns it.
 *
 * Gravel is the app's own inert fill and reads as a press rather than as a
 * state: it is not in the mark tier, so nothing here can be mistaken for
 * "this row is now selected".
 */
const row = "transition-colors duration-150 ease-motion active:bg-gravel";

/**
 * A control that inverts when its value changes, with no press of its own:
 * the cells of a `Segmented`, which are joined into one box and would break
 * the join if one of them moved.
 *
 * The lab's Feedback section is why this exists: an answer inverts the
 * control that gave it, and until this landed it inverted with no
 * transition at all — the one place the system's own stated principle was
 * not drawn.
 */
const state = "transition-colors duration-150 ease-motion";

/**
 * A glyph that turns to say which way something goes. `transform` and
 * `rotate` only: the triangle is an `Svg` inside a `View`, and the `View`
 * is what carries this.
 */
const disclosure = "transition-[transform,rotate] duration-150 ease-motion";

export const MOTION = { press, pressFill, row, state, disclosure } as const;

export type MotionRole = keyof typeof MOTION;

/**
 * The same five roles under reduced motion. Deliberately a full map rather
 * than a sparse override, so a caller reads one shape and cannot get a role
 * from one mode and not the other.
 *
 * `row` and `state` are the same string as above, and that is the point
 * rather than an omission: they are colour, and colour is kept.
 */
export const REDUCED_MOTION: Record<MotionRole, string> = {
  // The scale becomes a dim. Not nothing: a control with no press state is
  // a control that feels dead, and the rule is "fewer and gentler", not
  // "none".
  press: "transition-opacity duration-150 active:opacity-70",
  // No scale to replace. A chip that inverts on the tap has already said
  // what happened by inverting, so the colour transition is the whole of
  // the feedback and it stays.
  pressFill:
    "transition-[background-color,border-color,color] duration-150 ease-motion",
  row,
  state,
  // Turns are the thing being dropped, and there is no substitute: the row
  // it opens is the state change, and the trigger already announces whether
  // it is open. It snaps, which is what the setting asked for.
  disclosure: "",
};
