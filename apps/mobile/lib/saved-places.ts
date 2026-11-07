/**
 * A saved place, as the trip reads it.
 *
 * Shaped after the API's row (`shared/schemas/saved-place.ts`), because
 * that is what this is wired to: a name and an address in the saver's
 * own words, a type chip, the saver's prose, and the pin the sheet
 * toggles. The place behind it is the snapshot the picker committed —
 * the linked Google id when the row came from a suggestion, null when
 * the words were typed — with the photo the API proxies from Places.
 *
 * No React and no fetch — node-importable like `lib/payments.ts` and
 * `lib/mapping.ts`, so all of it is unit-testable in plain node (the
 * mobile suite has no renderer).
 */

import type { EventType } from "@/lib/itinerary";
import type { PlacePhotoCredit } from "@/lib/place-images";

/**
 * A saved place in the app's shape.
 *
 * Two id spaces live in here and they are not interchangeable:
 * `createdBy` is a **user** id (`saved_places.created_by` references
 * `users.id`), while the roster's `Member.id` is a **member** id.
 * Comparing one to the other is always a bug; `viewerOf` in
 * `lib/members.ts` is what turns a user id into the member row, and
 * the "You" read of `creatorName` lives at the render — the same
 * bargain `ExpenseDetail` makes for the payer — because the query
 * layer holds no viewer identity.
 */
export interface SavedPlace {
  id: string;
  tripId: string;
  /** A **user** id. */
  createdBy: string;
  /**
   * The saver's display name, resolved off the cached roster per
   * render (`useSavedPlaces`) — the entity carries no name, only
   * `createdBy`. Blank when the roster is cold or holds no row for
   * the saver, never a guessed id. "You" is the render's word, not
   * this field's: the sheet compares `createdBy` to `viewer.userId`.
   */
  creatorName: string;
  /** The saver's own words — never the picked place's name. */
  name: string;
  /** The saver's own address line; null when none was said. */
  address: string | null;
  /** The chip the card reads, off the picker's Google types. */
  type: EventType;
  /** The saver's note — their own words — null until someone writes some. */
  notes: string | null;
  /** The pin the sheet toggles. The wire carries no `pinnedAt`. */
  isPinned: boolean;
  /** The instant it was saved, as ISO — the card's byline. */
  createdAt: string;
  /**
   * The linked Google place id (`place.placeId`), null when the words
   * were typed or the row predates linking. Drives the pinned Maps
   * link.
   */
  placeId: string | null;
  /** The place's photo, which the API proxies from Places; null when there is none. */
  image: string | null;
  /**
   * The photo's required Google Maps source link, null for placeholders.
   * Every rendered photo reaches it: the tile through `PhotoCard`, the
   * detail through its own tap.
   */
  photoSourceUri: string | null;
  /** The photo's author credit for the detail surface; tiles render nothing. */
  photoCredit: PlacePhotoCredit | null;
}
