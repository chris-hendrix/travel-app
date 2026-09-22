import { createContext, useContext, useEffect, useRef, type ComponentRef } from "react";
import { Text } from "react-native";

/**
 * A node that can say where it is. `Text` is one; this is the part of it
 * a scroll needs, which keeps the registry from depending on the shape
 * of a react-native internal.
 */
export type Measurable = {
  measureLayout: (
    relativeTo: unknown,
    onSuccess: (x: number, y: number) => void,
    onFail?: () => void,
  ) => void;
};

/**
 * The dialog body's registry of what is currently complaining.
 *
 * It exists so that an error cannot be born off-screen unseen. The
 * primary button is pinned to the foot of the dialog and the fields are
 * in the body above it, so the further down a person had scrolled to
 * reach it, the further above them their answer appears: measured, a
 * form submitted from a scrolled position put two of its three errors
 * above the viewport with nothing moving to them. A form that looks like
 * it did nothing when you pressed it is worse than one that shouts.
 *
 * `null` — no provider — is the normal case outside a dialog, and then
 * this does nothing at all.
 */
export const FieldErrorRegistry = createContext<{
  register: (node: Measurable | null) => void;
  unregister: (node: Measurable | null) => void;
} | null>(null);

/**
 * What a field says about what it is missing.
 *
 * It sits under its field, where the field's own helper line sits, and
 * it is the one line down there that is not ink. That is the whole of
 * the component: a complaint set in the same black, at the same size,
 * in the same face as the helper sentence above it does not read as a
 * complaint — it reads as a second sentence of the help. The trip form
 * said `Tap the first day, then the last.` and then, on submit,
 * `Pick the first day.` under it, and the pair read as one paragraph
 * with a stutter in it.
 *
 * The colour is the alert at the weight text can be read in. Plain
 * strawberry on the dialog's own ground measures 2.19:1, which is under
 * half of what small text needs; this is 4.7:1 and still the same hue.
 * Nothing else marks an error — no icon, no border on the field, no
 * rule. A field is wrong in one place, which is here.
 *
 * No message means no line, and also no registration: callers hold a
 * validator's output, which is `string | undefined` by construction, so
 * the absent case is the common one and belongs in the component rather
 * than in every caller's `{error ? ... : null}`.
 *
 * A field's own complaint, not a request's: a save that failed, or a
 * lookup that came back empty, is a sentence about the request and is
 * still ink — `InlineError` for the block, a plain line where the
 * failure belongs to a field but the fault is not the field's.
 */
export function FieldError({ message }: { message?: string | undefined }) {
  const registry = useContext(FieldErrorRegistry);
  const ref = useRef<ComponentRef<typeof Text> | null>(null);

  useEffect(() => {
    if (!message || !registry) return;
    const node = ref.current as unknown as Measurable | null;
    registry.register(node);
    return () => registry.unregister(node);
  }, [message, registry]);

  if (!message) return null;

  return (
    <Text ref={ref} className="font-body text-sm text-strawberry-deep">
      {message}
    </Text>
  );
}
