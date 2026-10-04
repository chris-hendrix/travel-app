import { Text } from "react-native";
import { RuledBlock } from "@/components/ui/RuledBlock";

/**
 * A screen that is getting there says so where its content will be.
 *
 * A plain line, not a spinner and not a skeleton: there is no motion
 * language in this system, and a skeleton is a promise about the shape
 * of content the request has not returned yet. The line sits in the
 * block the content will fill, ruled the same way, so arrival does not
 * rearrange the page.
 *
 * The label is what is arriving, in the product's own voice: the
 * person's verb and the actual thing — "Getting the run", not
 * "Loading…" on its own, and not a category the reader already knows
 * ("trip details"). A bare "Loading…" is a screen that will not say
 * what is late; a bare noun reads as a broken heading while it loads.
 *
 * The label is also the only thing on the page a screen-reader user
 * can be told about, so it is a polite live region: without one they
 * hear nothing at all while the page is empty, which is the one
 * audience the rule above does not reach on its own. React Native maps
 * `aria-live` to `accessibilityLiveRegion` on Android and to the
 * `aria-live` attribute on the web export, so the `role` + `aria-*`
 * spelling is the one that announces on both surfaces.
 */
export function LoadingBlock({ label }: { label: string }) {
  return (
    <RuledBlock>
      <Text
        aria-live="polite"
        className="font-body text-sm text-ink opacity-60"
      >
        {label}
      </Text>
    </RuledBlock>
  );
}

