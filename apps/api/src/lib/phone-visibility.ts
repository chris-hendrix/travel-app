/**
 * Who may read a phone number, in one place.
 *
 * Two rules decide whether a payload may carry a number, and they are answered
 * together because every reader that carries one needs both:
 *
 *  - a soft-deleted account has no number to show. `users.phone_number` *is*
 *    the account, so deletion cannot blank it — it becomes a `deleted:<uuid>`
 *    marker, an internal note that the number was released, never a number for
 *    a viewer's eyes. Columns that *copy* that value carry the same marker,
 *    which is why the marker is checked as well as the row behind it;
 *  - a number belongs to its owner. An organizer sees every number on the trip
 *    and a member sees the ones shared with them, which is the rule the roster
 *    has always had.
 *
 * The rule lived at each call site until it was enforced at two of three
 * readers and missed the third. `phoneForViewer` returns `null` for "not a
 * number this viewer may read", and a reader renders that the way its own
 * response schema allows: omit an optional field, or withhold a required one.
 */

/** The marker a released number leaves behind in the column that held it. */
const TOMBSTONE_PREFIX = "deleted:";

/** True for a `deleted:<uuid>` marker rather than a number. */
export function isPhoneTombstone(phone: string | null): boolean {
  return phone !== null && phone.startsWith(TOMBSTONE_PREFIX);
}

/**
 * What a *required* phone field carries when the viewer may not read the
 * number. The member-side schemas type their number fields as optional, so
 * those readers omit the field; `invitationEntitySchema.inviteePhone` is a
 * required string, so its reader withholds the number instead — the same "no
 * number" the client's own `Member.phone` collapses an absent field to, and a
 * value no client can read a digit out of.
 */
export const WITHHELD_PHONE = "";

/**
 * The number this viewer may read, or `null` when there is none to read.
 *
 * `deletedAt` is the account's deletion stamp when the payload has the row
 * behind the number. A value that is itself a marker needs no row: the marker
 * is what the deletion wrote, so a copied number is withheld even where the
 * join that would supply `deletedAt` no longer matches.
 */
export function phoneForViewer(
  row: { phoneNumber: string | null; deletedAt: Date | null },
  viewer: { isOrg: boolean; sharePhone?: boolean },
): string | null {
  const phone = row.phoneNumber;
  if (phone === null || phone === "" || isPhoneTombstone(phone)) return null;
  if (row.deletedAt !== null) return null;
  if (!viewer.isOrg && viewer.sharePhone !== true) return null;
  return phone;
}
