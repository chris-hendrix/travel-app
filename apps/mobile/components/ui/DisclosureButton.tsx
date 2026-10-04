import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import Animated, { FadeIn } from "react-native-reanimated";
import { Plus } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { useMotion } from "@/hooks/useMotion";
import { INK } from "@/lib/theme";

/**
 * The triangle, drawn rather than iconed.
 *
 * Every other icon in this app is a lucide outline, and lucide has no
 * filled triangle — the nearest thing is a stroked chevron, which is a
 * different shape saying the same thing less plainly. So it is a polygon,
 * which is also the only way to get one that is solid.
 *
 * It turns rather than swapping. The app's other disclosure, `TimeField`,
 * holds `ArrowDown` and `ArrowUp` and chooses between them; a triangle that
 * rotates says the same thing with one glyph instead of two, and the
 * direction is the whole of what it says. The glyph is `aria-hidden`: the
 * trigger already says what it is and which way
 * it goes through `aria-expanded`, and a mark that only repeats that is noise
 * in the tree.
 */
function Triangle({ open }: { open: boolean }) {
  const motion = useMotion();

  return (
    <View
      className={motion.disclosure}
      style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
    >
      <Svg width={12} height={8} viewBox="0 0 12 8" aria-hidden>
        <Polygon points="0,0 12,0 6,8" fill={INK} />
      </Svg>
    </View>
  );
}

export type DisclosureAction = {
  title: string;
  onPress: () => void;
};

/**
 * One action, as a row rather than a box.
 *
 * The first version of this made every child a `Button`, and a stack of
 * six full-width boxes under one trigger is a wall: six equal weights with
 * no hierarchy, and nothing to tell the trigger from the things it opened
 * except a 12pt triangle. A row is lighter, and the rule underneath it is a
 * line rather than a box drawn inside a box.
 *
 * The `+` is why this is not just a word. The system has twice concluded
 * that a bare label on this screen reads as prose rather than as something
 * to press — `profile.tsx` on the temperature cells ("a word with no box
 * and no underline is a label, not something a thumb can be asked to
 * press") and `TripActions` on the itinerary head ("an underlined label in
 * a head read as a link in a paragraph"). A row inside a disclosure that
 * was just opened has more context than either of those, but the mark is
 * what makes it an action rather than a line of text.
 *
 * `py-3` over a 20pt line is the 44pt floor, reached by the row growing
 * rather than by padding with a negative margin. The `px-4` is the
 * trigger's own `p-4`, so the `+` lines up with the label above it while
 * the rule under the row still runs the full width of the box.
 */
function ActionRow({
  title,
  onPress,
  last,
}: {
  title: string;
  onPress: () => void;
  last: boolean;
}) {
  const motion = useMotion();

  return (
    <Pressable
      role="button"
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3 ${
        last ? "" : "border-b border-ink"
      } ${motion.row}`}
    >
      <Plus color={INK} size={16} aria-hidden />
      <Text className="font-body-bold text-sm text-ink">{title}</Text>
    </Pressable>
  );
}

/**
 * A button that opens onto a list of actions, in the flow.
 *
 * **The rule it sits under is the disclosure rule: a route for content,
 * this component for verbs, a value picker for a value, and truncation for
 * long copy.** Disclosure is a route or a verb list, never content.
 *
 * Each half of that is here because a screen wanted it. Content gets a
 * route, because content opened in place pushes the page under it, is gone
 * the moment the row is pressed again, and has no place to be found from
 * afterwards. A value gets a picker — `TimeField` opens a column of slots,
 * `Dropdown` a capped list of matches — because a value is chosen rather
 * than read, and it is short enough to say on the row. Long copy gets
 * truncated, because the alternative is a disclosure somebody opens to find
 * out whether there is anything in it.
 *
 * What is left over is verbs: a short list of things that can be done from
 * here, each of which goes somewhere or changes something. That is this
 * component and nothing else, and the form it replaced — ruled, nested, and
 * opening onto content — had no caller for as long as it existed, because
 * the content it was built to hide is a route.
 *
 * One trigger, the label at the near edge and a triangle at the far one,
 * and the rows it opens sit directly under it at the same width — nothing
 * floating, no panel, no shadow, and no box drawn around the group. That
 * panel is what this app's own dropdown looks like (`SuggestionList`:
 * bordered, capped at five rows, scrolling), and it is the one thing this
 * must not be mistaken for.
 *
 * In the flow rather than over it, for the reason `Dropdown` and
 * `SuggestionList` both give: a floating list needs a `relative z-10` on
 * whichever section happens to hold it, every `View` here is z-index 0,
 * and the rule has been missed twice and fails silently. The cost is the
 * one they already accepted — the page below moves down when this opens.
 *
 * The trigger is the only box, and its rows are ruled lines with no side
 * borders, so the trigger never dissolves into what it opened — and the
 * triangle says which way it goes. It is not filled. It was, and a
 * saturated box is the loudest thing on the page saying only "there is
 * more here", which is a lie about what pressing it does: the fill is
 * this system's mark for the control that finishes a job (`Button`), and a
 * trigger reveals rather than finishes. Every other disclosure here is
 * unfilled for the same reason — `TimeField` is the field's own box, and
 * the travel row is a plain row that opens a screen rather than a trigger.
 *
 * Actions rather than children, because the row is the whole of the look:
 * a caller that could pass anything would eventually pass a `Button`, and
 * the stack of boxes is exactly what this replaced.
 *
 * `defaultOpen` is for the lab, which shows both states at once. On a
 * screen it is always shut, which is the point: the page arrives calm and
 * opens on request.
 */
export function DisclosureButton({
  title,
  actions,
  defaultOpen = false,
}: {
  title: string;
  actions: DisclosureAction[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // A trigger that opens onto nothing is a lie about what pressing it does,
  // so an empty list is not a disclosure at all. No caller can reach this
  // today (`TripActions` always appends Trip settings); it is here because
  // this is a `ui/` primitive and the next caller is the one that will.
  if (actions.length === 0) return null;

  return (
    <View>
      <Button
        title={title}
        variant="secondary"
        fullWidth
        expanded={open}
        onPress={() => setOpen((current) => !current)}
        trailing={<Triangle open={open} />}
      />
      {/* Open, the list is whatever the caller last handed over: a row that
          goes away while the box is open (Add travel, when somebody files
          their times elsewhere) leaves the stack shorter with nothing said.
          That is the accepted half of the "a shut box costs nothing"
          trade, and the alternative — freezing the list until it is closed
          — would leave a row on screen that no longer does anything. */}
      {/*
        The rows arrive rather than appearing.

        This is the one case in the app that is exactly what the skill's
        tool table names: an element mounting. Not a press, not a state
        change, but a thing that was not there and now is — so it is a
        layout animation rather than a class, and it is the only motion in
        this component that is not in `useMotion`. Reanimated's builders
        default their reduced-motion handling to the system setting, so
        there is nothing to gate.

        150ms, the system's one duration, and a fade rather than a rise:
        a disclosure is occasional rather than rare, and a rise would be
        the second thing in the page moving at once — the rows are in the
        flow, so the blocks under them move down as these arrive.

        **Closing does not animate, deliberately.** The rows are the only
        thing between the trigger and the page below, so collapsing them
        snaps that page up in the same frame an exit would start — a
        fading ghost travelling against content that has already moved.
        The jump is the dominant motion and a fade on top of it does not
        hide it, it just adds a second thing to look at. The `entering` is
        the half worth having; the exit would be worse than nothing.
      */}
      {open ? (
        <Animated.View entering={FadeIn.duration(150)}>
          {actions.map((action, index) => (
            <ActionRow
              // Title and index, not title alone: titles are display
              // strings, and two rows that happened to read the same would
              // collide on a key and reconcile into each other's handler.
              key={`${action.title}-${index}`}
              title={action.title}
              onPress={action.onPress}
              last={index === actions.length - 1}
            />
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}
