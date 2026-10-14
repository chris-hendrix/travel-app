import type { TravelStatus } from "@/lib/queries/travel";

/**
 * What the travel form shows before it can show the form.
 *
 * `open` is the only state that draws the dialog. The rest are the ways a
 * door can be shut, and each says why.
 */
export type TravelFormGate = "loading" | "offline" | "failed" | "gone" | "open";

/**
 * Whether the form may open, from the section read's state.
 *
 * The rule is that the read *landed* — not that it is not currently
 * fetching. The difference is the whole reason this is a function rather
 * than a `status === "loading"` check inline in the screen, and it is not
 * cosmetic: the dialog seeds its panels from the rows it is handed, in a
 * `useState` keyed on the member alone (`components/trip/TravelDialog.tsx`,
 * the effect's dep list). An empty read is therefore not a blank that
 * fills in later — it *is* the seed, and it stays the seed while the
 * member types over it.
 *
 * That makes the two other ways a read can end un-landed — `error` and
 * `offline` — as dangerous as still loading, and more quietly so. The
 * panels say "Not shared yet" over a member who has filed, `Add travel`
 * is offered for a pair that is taken, and the save that follows posts a
 * leg the server folds into the row the panels never showed. The form's
 * own write is what turns that into loss rather than a duplicate: an
 * absent field is a cleared one on the create path, and `toCreateRequest`
 * omits every empty one.
 *
 * `gone` is the other thing a *landed* read can say: this door named a
 * row and the row is not in the answer. Only a landed read gets to say
 * it — from an unlanded one, "that travel is not on this trip any more"
 * asserts a fact the read never established.
 *
 * Everything else the screen derives — whether the member already holds a
 * direction (`filed`), who the picker may name, whether the verb is add or
 * edit — reads the same rows, so gating the door on the rows having landed
 * is what makes all of them trustworthy at once.
 */
export function travelFormGate(input: {
  /** The section read's state (`lib/queries/travel.ts`). */
  status: TravelStatus;
  /** The door named a record to open on (`travel=`). */
  namesRecord: boolean;
  /** That record is in the landed rows. */
  recordFound: boolean;
}): TravelFormGate {
  if (input.status === "loading") return "loading";
  if (input.status === "offline") return "offline";
  if (input.status === "error") return "failed";
  return input.namesRecord && !input.recordFound ? "gone" : "open";
}
