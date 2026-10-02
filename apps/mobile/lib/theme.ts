/**
 * The palette, for the places a class cannot reach.
 *
 * `global.css` holds the tokens and is the source of truth for everything
 * styled with a class. Three things cannot take one: an icon's `color`
 * prop, which react-native-svg reads as a value rather than a style; a
 * field's `placeholderTextColor`; and the bar of the `Animated.View` a
 * centred field draws its caret with, which takes a style object. All
 * three used to be hex literals at the call site, which meant the palette
 * lived in twelve files and a colour change was a find and replace.
 *
 * Keep these in step with `@theme` in global.css. There is no way to read
 * a CSS variable into a React Native prop, so this mirror is the price of
 * one palette rather than twelve.
 *
 * `PLACEHOLDER` has no counterpart there: it is only ever a prop, so
 * there is no class that would name it. Its value is the same as the
 * `grey-quiet` token, and `__tests__/palette.test.ts` asserts that, so
 * the duplicate cannot drift.
 */
export const INK = "#000000";
export const SAND = "#f5eacc";
/** An empty field's placeholder text. Was #707070, which is 4.13:1 on
 *  sand and 3.69:1 on gravel — under the body floor on both grounds. */
export const PLACEHOLDER = "#5f5f5f";
