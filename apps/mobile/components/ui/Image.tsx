import { styled } from "nativewind";
import { Image as ExpoImage } from "expo-image";

/**
 * The app's image, and the only `expo-image` in it.
 *
 * `className` on a *third-party* component is not a style here, and this file
 * is the fix for the one place that bit us. react-native-css's
 * `globalClassNamePolyfill` (set in `metro.config.cjs`) rewrites imports of
 * `react-native` — and of `react-native-safe-area-context` — to its own
 * components, which resolve a class list into a style object. Nothing else is
 * rewritten, so `expo-image`'s `Image` never had its `className` resolved: the
 * component spreads its unknown props onto the native view, and the native view
 * drops the prop. `w-full aspect-[2/1]` sized nothing, the height collapsed to
 * zero, and every photo in the app was invisible on Android — while the stock
 * photo beside it, a plain `View` carrying the same class, still drew. Photos
 * missing, layout intact, which is why it read as an image bug rather than a
 * layout one.
 *
 * The web export hid the bug, and that is worth writing down because it is
 * where the search starts: on web `ExpoImage` spreads the same props onto a
 * react-native-web `View`, which *is* rewritten, so the class names landed on
 * the container div and the CSS sized it. One prop, two behaviours, and only
 * the surface the product ships on failed.
 *
 * `styled` is react-native-css's own API for a component it does not rewrite:
 * it resolves the classes into the style object every `View` in the app already
 * receives, and on web it hands react-native-web the same `$$css` object its
 * components use. So this one file is one behaviour on both surfaces, and the
 * class strings stay written at the call site, where Tailwind's scanner still
 * finds them — which is why the fix is here and not twelve `style={{...}}`
 * objects. Those would have had to re-type the rem-based sizes by hand, and
 * NativeWind's rem is 14 on a phone against 16 in a browser, so the two
 * surfaces would have drifted apart by design rather than by accident.
 *
 * Import `Image` from here and never from `expo-image`;
 * `__tests__/image-classes.test.ts` reads the tree and holds that.
 *
 * `styled` wraps rather than copies, so the class's statics (`prefetch`,
 * `clearDiskCache`, `loadAsync`) do not come with it. Nothing uses one. If
 * something ever does, it belongs here, not as a second `expo-image` import at
 * the call site.
 */
export const Image = styled(ExpoImage, { className: "style" });
