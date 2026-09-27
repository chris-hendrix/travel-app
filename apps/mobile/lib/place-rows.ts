/**
 * The place display block's visibility decision, as a pure helper so it
 * stays unit-testable (no React Native Testing Library on purpose).
 *
 * The block reads the entity's own snapshot columns: `placeName` on the
 * Place row, `placeAddress` on the Address row. A row hides when its
 * value is missing — null, undefined, or blank — which is the owner's
 * explicit requirement. A stay's own `address` column is the Address
 * row's fallback, so every stay created before this feature keeps its
 * address; an event has no such fallback, so a typed place with no
 * snapshot shows neither row. Place above Address; never two addresses.
 */

export type PlaceRowSource = {
  /** The entity's own `place_name` snapshot column. */
  placeName?: string | null;
  /** The entity's own `place_address` snapshot column. */
  placeAddress?: string | null;
  /**
   * A stay's own `address` column: the Address row's fallback when no
   * snapshot is stored. Absent on events, which have no fallback.
   */
  address?: string | null;
};

export type PlaceRows = {
  /** The Place row's value, null when the row hides. */
  name: string | null;
  /** The Address row's value, null when the row hides. */
  address: string | null;
};

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Which place rows an entity shows. Blank reads as missing, and the
 * snapshot wins over a stay's own address — the snapshot is what the
 * user picked, the column is what predates the pick.
 */
export function placeRows(entity: PlaceRowSource): PlaceRows {
  return {
    name: text(entity.placeName),
    address: text(entity.placeAddress) ?? text(entity.address),
  };
}
