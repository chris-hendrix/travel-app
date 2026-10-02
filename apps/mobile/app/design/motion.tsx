import { useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { Checkbox, CheckboxLabel } from "@/components/ui/Checkbox";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { DisclosureButton } from "@/components/ui/DisclosureButton";
import { QuietAction } from "@/components/ui/QuietAction";
import { Segmented } from "@/components/ui/Segmented";
import { MOTION, REDUCED_MOTION } from "@/components/ui/motionClasses";
import { Section, Specimen } from "./frame";

/**
 * The six questions, in the order they are asked.
 *
 * Written as data rather than as six paragraphs so the *order* is the
 * thing on the page. The order is the whole of the method: the first
 * question is not "how does it move" but "should it move at all", and a
 * proposal that fails any one of these is not built.
 */
const MOTION_METHOD: Array<[string, string]> = [
  [
    "Should it move at all?",
    "By how often the reader meets it. Something hit a hundred times a day gets the platform default or nothing; tens of times a day gets under 150ms or nothing; the delight budget is spent on the rare things. Every role below is a press or a state change — the tens-of-a-day tier — so all of it is 150ms and none of it is a set piece.",
  ],
  [
    "What is it for?",
    "One word. Feedback, or a state indication, or preventing a jarring change. “It looks nice” is not one of them, and it is the reason most motion should not be written.",
  ],
  [
    "What is the cheapest thing that does it?",
    "A press, a toggle, or a colour flipping is a CSS transition: a class, and no JavaScript. A loop is a CSS animation. Something entering or leaving is a layout animation. Only a finger on a moving element needs a shared value and a worklet, and nothing in this app has one yet. A screen-to-screen transition is the stack's job and not ours.",
  ],
  [
    "Which properties?",
    "`transform` and `opacity` are the only two that do not cost a layout pass. `width`, `height`, `margin`, `flex`, `top` and `left` re-run layout for the node and its siblings on every frame, which is what turns a smooth animation into a 20fps one on a phone that is three years old. The one exception is an absolutely positioned element with no children, and nothing here uses it.",
  ],
  [
    "Spring or curve, and how long?",
    "A finger on the element means a spring, because a spring carries the gesture's velocity through an interruption and a curve restarts from nothing. Nothing here has a finger on it: a press is two states, not a drag. So everything here is one curve at 150ms, and it is `--ease-motion`. Never an ease-in on a control — it starts slow, and the start is the exact moment a thumb is watching.",
  ],
  [
    "Which thread?",
    "The question that decides whether any of it survives a slow phone. A className compiles through NativeWind into a Reanimated animation, so it runs on the UI thread and React never re-renders for it. One `setState` per frame in a gesture or a scroll handler is the single biggest cause of jank in a React Native app, and nothing in this vocabulary can cause one.",
  ],
];

/**
 * What each role is for, so the table below can print the purpose beside
 * the class it actually is. The class strings come from
 * `components/ui/motionClasses.ts` at render rather than being typed
 * here: a hardcoded class is a claim, and one read from the module the
 * components read from is a check.
 */
const MOTION_ROLE_PURPOSE: Record<keyof typeof MOTION, string> = {
  press: "A box that is pressed and does not change what it is: a button, a quiet action, a chip link, a calendar day, the bell and the avatar in the band.",
  pressFill:
    "A box that is pressed and inverts: a filter chip, a checkbox. Two properties, so one transition list — two transition classes would fight over it and CSS source order would decide.",
  pressDim:
    "A control that is pressed and must not change size. A full-bleed hero cannot scale — five per cent of a wide column reaches into the margins — and a fill is invisible under a photo, so it dims; and a segmented cell cannot scale either, because the join is shared with its neighbours.",
  row: "A full-width row. It highlights rather than scaling, because a row that scales reads as the whole screen squishing.",
  state:
    "A control that inverts when its value changes and is not itself the target: the inner box of a checkbox, whose fill goes to ink on the tick.",
  disclosure:
    "A glyph that turns to say which way something goes. Transform and rotate only.",
};





function MotionRow({ role }: { role: keyof typeof MOTION }) {
  const reduced = REDUCED_MOTION[role];
  return (
    <View className="gap-1 border-b border-gravel py-3">
      <Text className="font-body-bold text-base text-ink">{role}</Text>
      <Text className="font-body text-sm text-ink">
        {MOTION_ROLE_PURPOSE[role]}
      </Text>
      <Text className="font-body text-xs text-ink opacity-70">
        {MOTION[role]}
      </Text>
      <Text className="font-body text-xs text-ink opacity-70">
        {reduced === "" ? "reduced: nothing. It snaps." : `reduced: ${reduced}`}
      </Text>
    </View>
  );
}

/**
 * The motion section of the lab, in its own module.
 *
 * It was 300 lines of `index.tsx`, which is a 2000-line file for a
 * documentation page. The methodology is the longest argument in the
 * system and it belongs somewhere a reader can be sent on its own rather
 * than scrolling past the colour tokens to find it — and `onLog` is the
 * lab's interaction log, handed in rather than reached for, so this stays
 * presentational like everything else the lab renders.
 */
export function MotionSection({ onLog }: { onLog: (line: string) => void }) {
  const setLog = onLog;
  const [consent, setConsent] = useState(false);
  const [motionPick, setMotionPick] = useState<string | null>("b");
  // Bumped by the Enters specimen's button. A new key is a remount, and a
  // remount is what fires an `entering` animation — there is no other way
  // to watch one on demand.
  const [entersKey, setEntersKey] = useState(0);

  return (
    <Section title="Motion">
      <Text className="font-body text-base text-ink">
        Six questions, asked in this order. A proposed animation that
        fails one of them is not built, and the first question is the
        one that rejects the most: not how a thing moves, but whether
        it should move at all. The vocabulary that answers them is
        five roles in `components/ui/motionClasses.ts`, and the switch
        between its two forms is one hook.
      </Text>

      <View className="gap-3">
        {MOTION_METHOD.map(([question, answer], index) => (
          <View key={question} className="gap-1">
            <Text className="font-body-bold text-sm text-ink">
              {index + 1}. {question}
            </Text>
            <Text className="font-body text-sm text-ink">{answer}</Text>
          </View>
        ))}
      </View>

      <Text className="font-body text-base text-ink">
        The curve is one token in `global.css`. Tailwind's own ease-out
        is the curve CSS shipped in 2010, and it spends its first
        quarter almost stationary — which is exactly the quarter a
        thumb is watching. `--ease-motion` is that same family with the
        initial slope pulled up. A second curve gets added when a thing
        genuinely needs a different one, and the reason gets written
        beside it.
      </Text>

      <Text className="font-body text-base text-ink">
        Five roles, and the second line under each is what the role
        becomes when the device has reduced motion on.
      </Text>
      <View>
        {(Object.keys(MOTION) as Array<keyof typeof MOTION>).map(
          (role) => (
            <MotionRow key={role} role={role} />
          ),
        )}
      </View>

      <Text className="font-body text-base text-ink">
        Reduced motion is read with a hook and never with a media
        query, and that is a bug fix rather than a preference. The
        runtime under NativeWind evaluates a native media query
        against a fixed list of features, and the reduced-motion one
        is not in that list — it falls through to a false. So a media
        query block would work on the web export and silently never
        match on Android, which is the platform no browser can check
        for you. `scripts/design-lint.mjs` fails on the string so it
        cannot be written by accident, and the hook is nearly free:
        it is a value read once at import, already correct on the
        first render on both surfaces, and it cannot change.
      </Text>

      <Text className="font-body text-base text-ink">
        The rule is fewer and gentler, not zero. A change of colour or
        opacity that explains a state change is kept — a control that
        inverts when you answer it still inverts, and it still takes
        150ms. What goes is movement. That is why the pressed button
        below dims instead of shrinking when the setting is on:
        dropping the press state entirely would be an affordance
        removed rather than a motion reduced, and the dim works on
        every button variant without inventing a second colour for
        each.
      </Text>

      <Text className="font-body text-base text-ink">
        The list entrance is the one piece of motion that needs no
        help. Reanimated's layout-animation builders default their
        reduced-motion handling to the system setting, so an
        `entering` already answers it — which is why the hook does not
        cover it, and why a gate written for it would be a second
        opinion on a question that is already answered.
      </Text>

      <View className="gap-4">
        <Specimen
          name="Press"
          contract="motion.press · motion.pressFill"
          note="The baseline, and the thing every hover affordance in the world has to become on a phone: there is no hover, so the feedback lives in the press. Press-in rather than press-out, because waiting for the tap to finish before showing anything is the latency a thumb actually perceives, and 0.97 rather than something smaller because the scale takes the label and the icons with it, which is what makes it read as physical. The chip is the second form: it is pressed and it inverts, so it carries one transition list covering both rather than two classes fighting over the same property. The last one is off, so the chip's own inversion is visible against the press beside it."
        >
          <View className="gap-3">
            <Button
              title="Create trip"
              onPress={() => setLog("Motion: Create trip fired")}
            />
            <QuietAction
              label="Read more"
              onPress={() => setLog("Motion: Read more fired")}
            />
            <View className="flex-row gap-3">
              <ChipToggle
                label="Food"
                selected
                onPress={() => setLog("Motion: Food fired")}
              />
              <ChipToggle
                label="Stay"
                onPress={() => setLog("Motion: Stay fired")}
              />
            </View>
          </View>
        </Specimen>

        <Specimen
          name="Row"
          contract="motion.row"
          note="A full-width row is the one exception to the press rule: it highlights its background instead of scaling, because a row that scales reads as the whole screen squishing rather than as a row responding. The fill is gravel, the app's own inert tone, so a press cannot be mistaken for a selection — nothing in the mark tier is spent on this, which is what keeps a highlighted row from looking chosen. On a pointer the row takes the same fill on hover, and that is the whole of what hover is allowed to be in this system — it is added to a resting state that is already correct without it, never a control that hides and reveals. The same role is on the notification rows, the roster rows, the rows inside a disclosure, the suggestion list, the time column, and the run's own event and stay rows."
        >
          <Checkbox
            checked={consent}
            onToggle={() => setConsent((current) => !current)}
          >
            <CheckboxLabel>
              I have read how Journiful handles my number.
            </CheckboxLabel>
          </Checkbox>
        </Specimen>

        <Specimen
          name="State"
          contract="motion.state"
          note="A control that inverts when its value changes, with no press of its own. The cells of a segmented row share their borders, so scaling one would break the join — which is why this is colour only, and why it is a separate role from press rather than the same one with a flag. This is the lab's own Feedback principle finally drawn: an answer inverts the control that gave it, and until this role existed it inverted with no transition at all, in one frame."
        >
          <Segmented
            options={[
              { value: "a", label: "Going", tone: "primary" },
              { value: "b", label: "Maybe", tone: "highlight" },
              { value: "c", label: "Can't", tone: "danger" },
            ]}
            value={motionPick}
            onChange={setMotionPick}
          />
        </Specimen>

        <Specimen
          name="Turn"
          contract="motion.disclosure"
          note="A glyph that turns rather than a pair of glyphs that swap. The triangle says the same thing as an up arrow and a down arrow with one shape, and the direction is the whole of what it says — so the turn is not decoration, it is the state change itself. This is the only role with no reduced-motion form: the row it opens is the state change, the trigger already announces whether it is open, and there is nothing honest to put in a rotation's place, so it snaps. That is the setting being obeyed rather than an omission."
        >
          <DisclosureButton
            title="More"
            actions={[
              {
                title: "Add event",
                onPress: () => setLog("Motion: Add event fired"),
              },
              {
                title: "Add stay",
                onPress: () => setLog("Motion: Add stay fired"),
              },
            ]}
          />
        </Specimen>

        <Specimen
          name="Enters"
          contract="entering · the container, never the rows"
          note="What a screen does when its read comes back, which is the one moment the app could not previously say anything about: a sentence was replaced by a page in a single frame, and a page that arrives instantly reads as a flinch. It is 150ms on the container, not a stagger across the rows — a screen loads dozens of times a day, and the rule for anything met that often is that it is under a fifth of a second or it is not there. Fade rather than a fade-and-rise for the same reason: by the twentieth time today it should be nothing at all. It is on `TripGate`, so every trip screen in the app gets it from one wrapper, and on the trips list itself. Press the button to watch it again."
        >
          <View className="gap-3">
            <Button
              title="Load it again"
              variant="secondary"
              onPress={() => setEntersKey((current) => current + 1)}
            />
            <Animated.View
              key={entersKey}
              entering={FadeIn.duration(150)}
              className="gap-0"
            >
              {["One itinerary", "The hotel or Airbnb", "Everyone's travel"].map(
                (row) => (
                  <View
                    key={row}
                    className="border-b border-gravel py-3"
                  >
                    <Text className="font-body text-sm text-ink">
                      {row}
                    </Text>
                  </View>
                ),
              )}
            </Animated.View>
          </View>
        </Specimen>
      </View>

      <Text className="font-body text-base text-ink">
        What is deliberately not here, so the next person does not add
        it: a skeleton, which is a promise about the shape of content
        the request has not returned; a spinner, which is a shape
        borrowed from a system this one is not; a toast, because a
        message that disappears is not a record; a slide between tabs,
        which implies a depth that is not there and is paid for dozens
        of times a session; a screen transition rebuilt in
        JavaScript, which is the stack's job and on the web export is
        nothing at all; and a control that hides until a pointer
        reaches it, which on the phone this app is for is either
        absent or — worse, because it is announced — present and
        invisible. Hover here only ever adds. A finger on a moving
        element — a drag, a swipe, a sheet that follows the thumb —
        needs a shared value and a worklet, and is the one thing here
        that has not been built yet because nothing in the app asks for
        it.
      </Text>
    </Section>
  );
}
