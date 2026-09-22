import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { AppHeader } from "@/components/ui/AppHeader";
import { ActionBar } from "@/components/ui/ActionBar";
import { Button } from "@/components/ui/Button";
import {
  FieldErrorRegistry,
  type Measurable,
} from "@/components/ui/FieldError";
import { useDismiss } from "@/hooks/useDismiss";

/**
 * Fullscreen dialog scaffold. Dialogs are routes, not overlays:
 * opening one switches screens, so dialogs can never stack.
 *
 * Header and action bar span the screen like app chrome; only the body
 * content sits in the centred column.
 */
export function FullscreenDialog({
  title,
  primaryTitle,
  onPrimary,
  primaryDisabled = false,
  pending = false,
  dangerTitle,
  onDanger,
  dismissHref = "/trips",
  children,
}: {
  title: string;
  /** The dialog's one primary action. Omit it on a read-only dialog:
   *  a bar with nothing worth pressing is chrome for its own sake.
   *  Explicitly nullable so a caller can pass an optional lookup
   *  straight through — who is looking decides whether there is one. */
  primaryTitle?: string | undefined;
  onPrimary?: (() => void) | undefined;
  /** Present, not yet available. */
  primaryDisabled?: boolean;
  /**
   * A write is in flight for this dialog. Both the primary action and the
   * destructive one stop while it is, because both send one.
   *
   * This is not `primaryDisabled`, which says an action is real but has
   * nothing to act on yet and says nothing about the destructive one.
   * Measured, an Add event form with neither sent two POSTs from two
   * presses a second and a half apart, and again from two presses eighty
   * milliseconds apart: two events where the person meant one. Every
   * other form in the app had guarded itself and these three had not, so
   * the guard belongs where the buttons are rather than in six callers.
   */
  pending?: boolean;
  /**
   * The destructive action, when there is one. It is the scaffold's
   * rather than the form's because its position is the point: the foot
   * of the body, under a rule, as far from the primary button as the
   * dialog allows. Three dialogs drew that footer by hand and they had
   * already started to differ.
   */
  dangerTitle?: string | undefined;
  onDanger?: (() => void) | undefined;
  /** Where to land when there is no history to go back to. The app's
   *  own home by default: a dialog opened from nowhere belongs to the
   *  app, not to a document. */
  dismissHref?: string;
  children: ReactNode;
}) {
  const dismiss = useDismiss(dismissHref);

  /**
   * The first error to appear takes the scroll with it.
   *
   * The registry is the body's, and it watches for the moment a form that
   * had nothing to complain about starts to: that transition only happens
   * on a submit that did not go through, because every form here validates
   * on submit and a submit that works leaves the dialog. So the scaffold
   * can react to it without any form having to tell it. Nothing registers
   * outside a dialog, so this is inert in the auth screens.
   */
  const body = useRef<ScrollView | null>(null);
  const errors = useRef(new Set<Measurable>());
  const [hasErrors, setHasErrors] = useState(false);

  const register = useCallback((node: Measurable | null) => {
    if (!node) return;
    // A Set keeps insertion order, and react runs a row of siblings'
    // effects in order, so the first entry is the topmost error.
    const first = errors.current.size === 0;
    errors.current.add(node);
    if (first) setHasErrors(true);
  }, []);

  const unregister = useCallback((node: Measurable | null) => {
    if (!node) return;
    errors.current.delete(node);
    if (errors.current.size === 0) setHasErrors(false);
  }, []);

  useEffect(() => {
    if (!hasErrors) return;
    const scroller = body.current;
    const content = scroller?.getInnerViewNode();
    const [first] = errors.current;
    if (!scroller || !content || !first) return;
    // Where it is, not how far down: the error and the body's content are
    // measured against each other, so the answer does not depend on where
    // the body happens to be scrolled when the form is sent.
    first.measureLayout(
      content,
      (_x, y) =>
        scroller.scrollTo({ y: Math.max(y - 16, 0), animated: true }),
      () => {},
    );
  }, [hasErrors]);

  return (
    <FieldErrorRegistry.Provider value={{ register, unregister }}>
      <View className="flex-1 bg-gravel">
        <AppHeader title={title} onClose={dismiss} />
        <ScrollView ref={body} className="flex-1">
          <View className="mx-auto w-full max-w-[960px] gap-5 p-6 md:px-12 md:py-10">
            {children}
            {dangerTitle && onDanger ? (
              <View className="border-t border-ink pt-6">
                <Button
                  title={dangerTitle}
                  variant="danger"
                  fullWidth
                  disabled={pending}
                  onPress={onDanger}
                />
              </View>
            ) : null}
          </View>
        </ScrollView>
        {primaryTitle && onPrimary ? (
          <ActionBar
            primaryTitle={primaryTitle}
            onPrimary={onPrimary}
            disabled={primaryDisabled || pending}
          />
        ) : null}
      </View>
    </FieldErrorRegistry.Provider>
  );
}
