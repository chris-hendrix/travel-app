import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { BandTone } from "@/components/ui/bandClasses";

/**
 * The ground that sits directly under the chrome, declared by the screen.
 *
 * `AppHeader`'s bottom edge is a scalloped wave, and the wave is a
 * silhouette on transparent — the gaps between the crests show whatever is
 * behind the header. The header is a flex *sibling* of the screen rather
 * than an overlay (`_layout.tsx`), so "behind the header" is the shell's
 * own ground, sand. That was right until a screen put a band at the top:
 * on `/trips/detail` the wave's cut-outs showed sand while the band
 * directly beneath them was lilac, which reads as a torn edge rather than
 * as the chrome biting into colour.
 *
 * `AppHeader.tsx` predicted this in a comment before it happened ("it stops
 * being right the moment a screen whose ground is not sand sits under this
 * band, and a full bleed photo or a coloured edge is exactly that"). This
 * is the plumbing it asked for.
 *
 * **Why the screen declares it rather than the shell looking it up.** A
 * route table in `_layout.tsx` was the obvious alternative and it does not
 * work: two of the five banded screens are data-dependent. `/trips` is
 * baltic only when the list is empty, and `/invite` is lilac while the
 * invitation is live and baltic once it is gone. Only the screen knows
 * which state it is in.
 *
 * A tone is a literal union rather than a CSS variable, so nothing here
 * runs into A5 — React Native cannot read a custom property into a prop,
 * but it can take a string.
 *
 * `null` is the default and means "nothing of my own", which is sand: the
 * fourteen screens that are not banded need to call nothing at all.
 */
type HeaderToneValue = {
  tone: BandTone | null;
  set: (next: BandTone | null | ((current: BandTone | null) => BandTone | null)) => void;
};

const HeaderToneContext = createContext<HeaderToneValue>({
  tone: null,
  set: () => {},
});

export function HeaderToneProvider({ children }: { children: ReactNode }) {
  const [tone, setTone] = useState<BandTone | null>(null);
  const set = useCallback<HeaderToneValue["set"]>((next) => {
    setTone(next);
  }, []);
  const value = useMemo(() => ({ tone, set }), [tone, set]);
  return (
    <HeaderToneContext.Provider value={value}>
      {children}
    </HeaderToneContext.Provider>
  );
}

/** What the chrome reads. `AppHeader` is the only caller. */
export function useHeaderToneValue() {
  return useContext(HeaderToneContext);
}

/**
 * A banded screen says what is under the chrome.
 *
 * Called by the screen and read by the header, which are siblings — the
 * provider sits above both in `_layout.tsx`.
 *
 * The cleanup is conditional on purpose. Two screens can be mounted at once
 * (a dialog over a list, a screen the router keeps alive), and an
 * unconditional `set(null)` on unmount would blank the tone the *other*
 * screen had set, which shows up as the wave flickering back to sand. So a
 * screen only clears a tone it still owns.
 */
export function useHeaderTone(tone: BandTone | null) {
  const { set } = useHeaderToneValue();
  useEffect(() => {
    set(tone);
    return () => {
      set((current) => (current === tone ? null : current));
    };
  }, [tone, set]);
}
