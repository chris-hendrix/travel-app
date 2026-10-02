import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { MOTION, REDUCED_MOTION, type MotionRole } from "@/components/ui/motionClasses";

/**
 * The reduced-motion rule, asserted rather than described.
 *
 * The rule is "fewer and gentler, not zero": a change of colour or opacity
 * that explains a state change is kept, and movement is dropped. That is a
 * sentence anyone can agree with and then break by adding a role, which is
 * exactly the kind of rule that needs a machine — the drift is silent, and
 * it drifts in the direction of *less* accessibility, so nobody notices it
 * on their own device.
 *
 * Imported from `motionClasses.ts` and never from `useMotion.ts`: the hook
 * imports `react-native-reanimated`, and `apps/mobile/vitest.config.ts` is
 * plain node with no renderer, so a value import of the hook would pull in
 * `react-native`'s Flow source and fail to parse. That split is the reason
 * the maps are a module of their own.
 */
const ROLES = Object.keys(MOTION) as MotionRole[];

/** The properties that cost a layout pass or move the reader's eye. */
const MOVEMENT = /scale|rotate|translate|transform/;

describe("the motion vocabulary", () => {
  it("answers every role in both modes", () => {
    // A full map rather than a sparse override, so a caller reads one shape
    // and cannot get a role from one mode and not the other.
    expect(Object.keys(REDUCED_MOTION).sort()).toEqual([...ROLES].sort());
  });

  it("names every role for the interaction rather than the property", () => {
    expect(ROLES).toEqual([
      "press",
      "pressFill",
      "pressDim",
      "row",
      "state",
      "disclosure",
    ]);
  });

  it("gives every role a duration and no role a bare default", () => {
    for (const role of ROLES) {
      expect(MOTION[role], role).toContain("duration-150");
    }
  });

  it("uses the one curve the system declares", () => {
    // `global.css` declares `--ease-motion`; a role that reached for
    // Tailwind's own `ease-out` would be a second curve nobody chose.
    for (const role of ROLES) {
      expect(MOTION[role], role).not.toMatch(/\bease-(out|in|in-out)\b/);
    }
  });
});

/**
 * The curve has to exist, and nothing else checks that.
 *
 * `ease-motion` is a class name Tailwind generates from a `@theme` token.
 * If the token is missing the class resolves to nothing at all, Tailwind
 * falls back to its own default timing function, and every animation in the
 * app runs on a curve nobody chose — with the type checker, the linter and
 * every other test passing, because a className that means nothing is still
 * a valid string.
 *
 * This is not hypothetical. The token was deleted by an unrelated revert
 * during the change that added this vocabulary, and it took reading the
 * built stylesheet to notice. So the file is read here.
 */
describe("the motion curve", () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, "..", "global.css"),
    "utf8",
  );

  it("is declared once, in @theme, with the value the roles expect", () => {
    expect(css).toMatch(
      /--ease-motion:\s*cubic-bezier\(0\.23,\s*1,\s*0\.32,\s*1\);/,
    );
  });

  it("is the curve every role that names a curve names", () => {
    // A role may name it or leave it out; what it may not do is name
    // something else, because there is only one curve to name.
    const curves = [...ROLES.flatMap((role) => [MOTION[role], REDUCED_MOTION[role]])]
      .join(" ")
      .match(/ease-[a-z-]+/g);
    expect(new Set(curves)).toEqual(new Set(["ease-motion"]));
  });

  it("keeps Tailwind's own curve out of the vocabulary", () => {
    // `--ease-out` is still declared by Tailwind and still reachable by
    // anyone who types `ease-out`; the roles are the only places that
    // spend a curve, so this is the whole of the guard.
    for (const role of ROLES) {
      expect(MOTION[role], role).not.toContain("ease-out");
      expect(REDUCED_MOTION[role], role).not.toContain("ease-out");
    }
  });
});

describe("reduced motion", () => {
  it("drops every role that moves geometry", () => {
    for (const role of ROLES) {
      expect(REDUCED_MOTION[role], role).not.toMatch(MOVEMENT);
    }
  });

  it("keeps colour and opacity, because those explain a state change", () => {
    // The two that only change colour are the same string in both modes,
    // and that is the rule rather than an omission.
    expect(REDUCED_MOTION.row).toBe(MOTION.row);
    expect(REDUCED_MOTION.state).toBe(MOTION.state);
    expect(REDUCED_MOTION.row).toContain("transition-colors");
  });

  it("leaves a pressed control with a press state", () => {
    // "Fewer and gentler, not zero." Dropping the scale without a
    // replacement would be an affordance removed, not a motion reduced —
    // so every press role keeps one.
    expect(REDUCED_MOTION.press).toContain("active:opacity-70");
    expect(REDUCED_MOTION.pressDim).toContain("active:opacity-70");
    // A chip that inverts on the tap has already said what happened by
    // inverting, so its colour transition is the whole of the feedback.
    expect(REDUCED_MOTION.pressFill).toContain("transition-[background-color");
  });

  it("leaves a dimming control unchanged, because opacity is kept", () => {
    // The one role with no reduced form of its own: it only ever dims.
    expect(REDUCED_MOTION.pressDim).toBe(MOTION.pressDim);
  });

  it("lets the disclosure snap rather than turn", () => {
    // There is no substitute for a turn: the row it opens is the state
    // change, and `aria-expanded` is already on the trigger.
    expect(REDUCED_MOTION.disclosure).toBe("");
  });
});

/**
 * Hover, held to the one thing it is allowed to be.
 *
 * The tempting use of hover is a control that hides until a pointer reaches
 * it, and on a phone that is either a control that does not exist or — worse,
 * because it is announced — one that exists, is tappable, and cannot be seen.
 * So the rule is that hover only ever *adds* to a resting state that is
 * already correct without it. The assertion is that it appears on one role,
 * beside the press it accompanies, and never as a reveal.
 */
describe("hover", () => {
  it("adds a pointer state to a row, and appears on no other role", () => {
    expect(ROLES.filter((role) => MOTION[role].includes("hover:"))).toEqual([
      "row",
    ]);
    // The press it accompanies is still there: hover is the second state,
    // not the only one.
    expect(MOTION.row).toContain("active:bg-gravel");
    expect(MOTION.row).toContain("md:hover:bg-gravel");
  });

  it("never hides anything", () => {
    for (const role of ROLES) {
      expect(MOTION[role], role).not.toMatch(
        /hover:(opacity-0|hidden|invisible|scale-0)/,
      );
    }
  });
});
