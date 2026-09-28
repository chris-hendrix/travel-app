import { useState, type ReactNode } from "react";
import { View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { INK } from "@/lib/theme";

/**
 * The triangle, drawn rather than iconed.
 *
 * Every other icon in this app is a lucide outline, and lucide has no
 * filled triangle — the nearest thing is a stroked chevron, which is a
 * different shape saying the same thing less plainly. So it is a polygon,
 * which is also the only way to get one that is solid.
 *
 * It turns rather than swapping. The app's three other disclosures
 * (Accordion, TimeField, the travel row) all hold `ArrowDown` and
 * `ArrowUp` and choose between them, which is the same statement written
 * twice; a triangle that rotates is that statement written once, and the
 * direction is the whole of what it says.
 */
function Triangle({ open }: { open: boolean }) {
  return (
    <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
      <Svg width={12} height={8} viewBox="0 0 12 8">
        <Polygon points="0,0 12,0 6,8" fill={INK} />
      </Svg>
    </View>
  );
}

/**
 * A button that opens onto more buttons, in the flow.
 *
 * One trigger, the label at the near edge and a triangle at the far one,
 * and the stack it opens sits directly under it — same width, same left
 * edge, nothing floating. There is no card, no fill and no shadow around
 * the group: the children are already boxes, and a box drawn around boxes
 * is a panel. That panel is what this app's own dropdown looks like
 * (`SuggestionList`: bordered, capped at five rows, scrolling), and it is
 * the one thing this must not be mistaken for.
 *
 * In the flow rather than over it, for the reason `Dropdown` and
 * `SuggestionList` both give: a floating list needs a `relative z-10` on
 * whichever section happens to hold it, every `View` here is z-index 0,
 * and the rule has been missed twice and fails silently. The cost is the
 * one they already accepted — the page below moves down when this opens.
 *
 * The trigger is filled and its children are outlined, and that is not
 * decoration. Same width at the same weight would make the trigger and
 * everything it opened one stack of equal peers, with a 12pt triangle as
 * the only thing saying which one you pressed — and the trigger is not a
 * peer: it stays, it is the way back, and it is the only one of them that
 * is a category rather than a verb. One tier of fill is what separates a
 * parent from its children when nothing else can.
 *
 * `defaultOpen` is for the lab, which shows both states at once. On a
 * screen it is always shut, which is the point: the page arrives calm and
 * opens on request.
 */
export function DisclosureButton({
  title,
  variant = "primary",
  defaultOpen = false,
  children,
}: {
  title: string;
  /**
   * The trigger's fill. `primary` by default, which is one tier above the
   * `secondary` children the callers pass; a trigger wearing `secondary`
   * too is a trigger that has dissolved into its own contents.
   */
  variant?: ButtonVariant;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View className="gap-3">
      <Button
        title={title}
        variant={variant}
        fullWidth
        expanded={open}
        onPress={() => setOpen((current) => !current)}
        trailing={<Triangle open={open} />}
      />
      {open ? <View className="gap-3">{children}</View> : null}
    </View>
  );
}
