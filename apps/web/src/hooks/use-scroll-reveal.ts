"use client";

import { useCallback, useEffect, useState } from "react";

interface UseScrollRevealOptions {
  /** Intersection threshold (0-1). Default: 0.1 */
  threshold?: number;
  /** Root margin for IntersectionObserver. Default: "0px" */
  rootMargin?: string;
}

/**
 * Hook that reveals an element once it scrolls into the viewport.
 *
 * Uses IntersectionObserver with a one-shot pattern: once the element
 * is intersecting, `isRevealed` becomes true and the observer disconnects.
 *
 * Uses a callback ref so it works correctly with conditionally rendered elements.
 *
 * @param options - Optional threshold and rootMargin for the observer
 * @returns Object with a ref callback to attach to the target element and the revealed state
 */
export function useScrollReveal(options?: UseScrollRevealOptions) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  const ref = useCallback((node: HTMLElement | null) => {
    setElement(node);
  }, []);

  useEffect(() => {
    if (!element || isRevealed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsRevealed(true);
          observer.disconnect();
        }
      },
      {
        threshold: options?.threshold ?? 0.1,
        rootMargin: options?.rootMargin ?? "0px",
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [element, isRevealed, options?.threshold, options?.rootMargin]);

  return { ref, isRevealed };
}
