/**
 * The single image seam: every event/stay cover and every trip-cover
 * fallback comes from here, so real photos are a one-file swap.
 *
 * NOTE: `mocks/events.ts` still exports `placePhoto()` for the mock/lab
 * fixtures (Phase 8 keeps mocks as lab fixtures). It has the same URL
 * shape, but it is mock-only — app code must import from here.
 */

/** Deterministic stand-in photo for a seed (trip, event, or stay id). */
export function placeholderPhoto(seed: string): string {
  const slug = seed.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `https://picsum.photos/seed/${slug}/900/450`;
}
