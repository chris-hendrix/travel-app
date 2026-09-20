/**
 * The palette, for the places a class cannot reach.
 *
 * `global.css` holds the tokens and is the source of truth for everything
 * styled with a class. Two things cannot take one: an icon's `color`
 * prop, which react-native-svg reads as a value rather than a style, and
 * a field's `placeholderTextColor`. Both used to be hex literals at the
 * call site, which meant the palette lived in twelve files and a colour
 * change was a find and replace.
 *
 * Keep these in step with `@theme` in global.css. There is no way to read
 * a CSS variable into a React Native prop, so this mirror is the price of
 * one palette rather than twelve.
 *
 * `PLACEHOLDER` has no counterpart there: it is only ever a prop, so
 * there is no class that would name it.
 */
export const INK = "#000000";
export const SAND = "#f5eacc";
export const PLACEHOLDER = "#707070";
