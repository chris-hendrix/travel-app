import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import * as Clipboard from "expo-clipboard";

/**
 * How long the copy word stays answered. Long enough to read the word, short
 * enough that nobody presses it twice wondering whether it took.
 */
const COPIED_MS = 2000;

/**
 * The clipboard's answer: the word that took the string inverts, then goes
 * back.
 *
 * **An invert because there is nothing else to report.** A clipboard write
 * changes nothing on screen — the string goes somewhere the screen does not
 * show — so the control that made it carries the whole of the confirmation
 * the app can give. `Copied` replaces the verb's own label for the beat and
 * then stops being true again, which is the lab's feedback rule (feedback is
 * state, not a message) read at its smallest. The flip side is that the word
 * *is* the confirmation, so a write that fails confirms nothing: the label
 * stays exactly as it was, because a reader told `Copied` about a clipboard
 * that never took the string has been lied to.
 *
 * **Two seconds is the beat.** One word takes no time to read; the reason it
 * is not instantaneous is that the reader has to see it change, and the
 * reason it does not linger is that a control still saying `Copied` five
 * seconds later has stopped answering the press and started describing the
 * past. Two seconds catches the change and leaves trying again the obvious
 * next thing rather than a puzzle.
 *
 * **The announcement is for the reader who cannot see the word.** The invert
 * is the entire confirmation this action gives, and a label that changed for
 * two seconds and changed back is, to a screen reader, indistinguishable
 * from a press that did nothing — the `aria-label` is static on purpose (it
 * names what the copy takes, not what it just did), so the confirmation
 * arrives as a spoken announcement instead of a re-read label.
 *
 * Shared because it was written three times — the place verbs, a stay's
 * arrival details, an expense's note — and the third copy arrived with a
 * comment arguing that a module for it was more plumbing than the fact was
 * worth. Three copies answering at three speeds is a difference nobody could
 * give a reason for, which is the point at which `InlineAction`'s header
 * says to stop arguing and share it.
 */
export function useCopied(): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false);
  // The timer is a ref rather than an effect keyed on `copied`, because a
  // second press while the answer is still up has to restart the beat: the
  // first press's timer must never be what takes the second one's word back.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unmount takes the pending timer with it, so a copy answered on a screen
  // that has since closed is not written to a component that is gone.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback((text: string) => {
    void Clipboard.setStringAsync(text).then(
      () => {
        setCopied(true);
        AccessibilityInfo.announceForAccessibility("Copied");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          setCopied(false);
        }, COPIED_MS);
      },
      // Nothing was copied, so nothing is confirmed: the word stays as it
      // was, which is the answer a write that never landed gets.
      () => undefined,
    );
  }, []);

  return { copied, copy };
}
