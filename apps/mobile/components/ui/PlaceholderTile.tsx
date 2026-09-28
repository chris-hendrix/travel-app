import { View } from "react-native";
import Svg, {
  Circle,
  Line,
  Path,
  Polygon,
  Polyline,
  Rect,
} from "react-native-svg";
import { INK } from "@/lib/theme";
import type { PlaceholderKind } from "@/lib/placeholder";

/**
 * What a place looks like when nobody has a photo of it. The drawing
 * says which kind of thing it is, not which place: the nine event
 * types and a trip cover. Ink on sand, like everything else, and no
 * source link, because there is no source.
 *
 * The tile carries no label — the chip beside it names the category,
 * and a second label would be the same word twice.
 *
 * Contract: `kind` · fills its parent box (2:1 or square). The `Svg`
 * scales with `xMidYMid meet`, so the same drawing fills a 2:1 tile
 * and a square thumb without a second layout.
 */
export function PlaceholderTile({ kind }: { kind: PlaceholderKind }) {
  return (
    <View className="h-full w-full bg-sand">
      <Svg
        viewBox="0 0 200 100"
        preserveAspectRatio="xMidYMid meet"
        style={{ height: "100%", width: "100%" }}
      >
        {drawing(kind)}
      </Svg>
    </View>
  );
}

const STROKE = {
  stroke: INK,
  strokeWidth: 3.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

function drawing(kind: PlaceholderKind) {
  switch (kind) {
    case "lodging":
      // A bed: a frame, a mattress, one pillow.
      return (
        <>
          <Rect x={52} y={52} width={96} height={22} rx={3} {...STROKE} />
          <Rect x={58} y={42} width={26} height={10} rx={4} {...STROKE} />
          <Line x1={52} y1={52} x2={52} y2={34} {...STROKE} />
          <Line x1={148} y1={52} x2={148} y2={34} {...STROKE} />
          <Line x1={52} y1={74} x2={46} y2={86} {...STROKE} />
          <Line x1={148} y1={74} x2={154} y2={86} {...STROKE} />
        </>
      );
    case "food_and_drink":
      // A plate, a fork, a knife.
      return (
        <>
          <Circle cx={100} cy={52} r={26} {...STROKE} />
          <Circle cx={100} cy={52} r={16} {...STROKE} />
          <Line x1={58} y1={32} x2={58} y2={72} {...STROKE} />
          <Line x1={52} y1={32} x2={52} y2={46} {...STROKE} />
          <Line x1={58} y1={32} x2={58} y2={46} {...STROKE} />
          <Line x1={64} y1={32} x2={64} y2={46} {...STROKE} />
          <Line x1={52} y1={46} x2={64} y2={46} {...STROKE} />
          <Line x1={142} y1={32} x2={142} y2={72} {...STROKE} />
          <Line x1={136} y1={32} x2={148} y2={32} {...STROKE} />
        </>
      );
    case "travel":
      // A paper plane on a diagonal.
      return (
        <>
          <Polygon
            points="48,68 152,30 108,74 92,62"
            {...STROKE}
            strokeLinejoin="round"
          />
          <Polyline points="92,62 152,30 100,56" {...STROKE} />
          <Line
            x1={64}
            y1={80}
            x2={88}
            y2={80}
            stroke={INK}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeDasharray="2 8"
            fill="none"
          />
        </>
      );
    case "outdoors":
      // Two mountains and a sun.
      return (
        <>
          <Circle cx={138} cy={30} r={10} {...STROKE} />
          <Polyline points="36,78 74,36 100,64 118,44 164,78" {...STROKE} />
          <Line x1={36} y1={78} x2={164} y2={78} {...STROKE} />
        </>
      );
    case "nightlife":
      // A tumbler and a crescent moon.
      return (
        <>
          <Polygon points="70,34 114,34 106,76 78,76" {...STROKE} />
          <Line x1={74} y1={54} x2={110} y2={54} {...STROKE} />
          <Path
            d="M140 28 A14 14 0 1 0 140 62 A17 17 0 1 1 140 28 Z"
            fill={INK}
          />
        </>
      );
    case "wellness":
      // A lotus over two crossed leaves.
      return (
        <>
          <Path
            d="M100 30 C108 42 108 52 100 60 C92 52 92 42 100 30 Z"
            {...STROKE}
          />
          <Path
            d="M100 60 C88 56 80 46 78 36 C90 38 98 46 100 60 Z"
            {...STROKE}
          />
          <Path
            d="M100 60 C112 56 120 46 122 36 C110 38 102 46 100 60 Z"
            {...STROKE}
          />
          <Path d="M60 78 C76 70 90 70 100 76 C110 70 124 70 140 78" {...STROKE} />
        </>
      );
    case "shopping":
      // A bag with two handles.
      return (
        <>
          <Polygon points="72,44 128,44 134,80 66,80" {...STROKE} />
          <Path d="M84 44 L84 36 A16 16 0 0 1 116 36 L116 44" {...STROKE} />
          <Line x1={100} y1={56} x2={100} y2={68} {...STROKE} />
          <Circle cx={100} cy={56} r={1.5} fill={INK} />
        </>
      );
    case "arts_and_entertainment":
      // A framed picture on a nail.
      return (
        <>
          <Circle cx={100} cy={24} r={2.5} fill={INK} />
          <Line x1={100} y1={26} x2={100} y2={32} {...STROKE} />
          <Rect x={64} y={32} width={72} height={48} {...STROKE} />
          <Polyline points="70,74 92,52 104,64 112,56 130,74" {...STROKE} />
        </>
      );
    case "misc":
      // A map pin.
      return (
        <>
          <Path
            d="M100 22 C118 22 130 34 130 50 C130 68 100 84 100 84 C100 84 70 68 70 50 C70 34 82 22 100 22 Z"
            {...STROKE}
          />
          <Circle cx={100} cy={50} r={9} {...STROKE} />
        </>
      );
    case "trip":
      // A compass rose: the trip cover's own kind.
      return (
        <>
          <Circle cx={100} cy={52} r={28} {...STROKE} />
          <Polygon
            points="100,28 106,52 100,76 94,52"
            fill={INK}
            stroke={INK}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <Polygon
            points="76,52 94,46 124,52 94,58"
            {...STROKE}
            strokeWidth={2.5}
          />
          <Circle cx={100} cy={52} r={3} fill={INK} />
        </>
      );
  }
}
