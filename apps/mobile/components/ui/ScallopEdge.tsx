import { View } from "react-native";
import Svg, { Defs, Path, Pattern, Rect } from "react-native-svg";

import {
  SCALLOP_DEPTH,
  SCALLOP_PATH,
  SCALLOP_PERIOD,
  SCALLOP_TILE,
  scallopPatternId,
  scallopTransform,
  type ScallopDirection,
} from "@/components/ui/scallopTiles";
import { INK } from "@/lib/theme";

/**
 * The perforated edge, drawn.
 *
 * The geometry, the curve and the reason there is only one of it are in
 * `scallopTiles.ts`. What is here is the box and the pattern, and three of
 * these lines are load-bearing rather than tidiness:
 *
 * - `height: SCALLOP_DEPTH` **in a style, not a class**. They are the same
 *   10px in a browser and not on a phone (A18), and the band's `paddingBottom`
 *   is the real-pixel depth, so a rem height would leave a seam of ground
 *   between the ink and its own wave — sand showing through, on the phone
 *   only, which is the measure-vs-paint class this repo keeps being bitten by.
 * - `overflow: hidden`, which is the **second** defence and not the first. The
 *   strip never draws outside its own depth whatever a fractional density does
 *   to the svg's box, and it is the one that holds if the slack row's
 *   diagnosis is wrong.
 * - `patternUnits="userSpaceOnUse"` with a fixed tile, so the period is the
 *   period at every width instead of stretching with the viewport.
 *
 * The fill is `INK` from `lib/theme.ts` rather than a class, for the reason
 * that module exists: an `Svg` takes values and not Tailwind, and a hex written
 * here would be a second copy of the palette.
 *
 * Placement is the caller's. The band hangs its wave out of layout over the
 * screen (`AppHeader`), because the screen's content has to pass under it; the
 * boot cover pins its edge to the bottom, because a page's perforation is where
 * the page stops.
 */
export function ScallopEdge({ direction }: { direction: ScallopDirection }) {
  const id = scallopPatternId(direction);
  return (
    <View
      style={{ height: SCALLOP_DEPTH, overflow: "hidden" }}
      className="w-full"
    >
      <Svg height={SCALLOP_DEPTH} width="100%">
        <Defs>
          <Pattern
            id={id}
            x="0"
            y="0"
            width={SCALLOP_PERIOD}
            height={SCALLOP_TILE}
            patternUnits="userSpaceOnUse"
            patternTransform={scallopTransform(direction)}
          >
            <Path d={SCALLOP_PATH} fill={INK} />
          </Pattern>
        </Defs>
        <Rect
          x="0"
          y="0"
          width="100%"
          height={SCALLOP_DEPTH}
          fill={`url(#${id})`}
        />
      </Svg>
    </View>
  );
}
