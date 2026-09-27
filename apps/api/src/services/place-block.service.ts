/**
 * The place block's update rule, in one place.
 *
 * Trips, events and accommodations carry the same four columns — the
 * `place_provider`/`place_id` pair and the `place_name`/`place_address`
 * snapshot that describes it — and the same rule governs a request that
 * changes them. It lives here rather than in each update service so the
 * three cannot drift apart, and because the rule is the whole of the
 * behaviour: a REPLACED pair must never inherit the old place's text.
 *
 * Absent, replaced and cleared are three different requests, and the
 * patch is where that difference is expressible: a column the patch
 * omits is left untouched, while a column it names is written with its
 * value — including an explicit null. The caller's update payload
 * starts as `{...data}`, so the omitted columns must also be dropped
 * from it; that is what {@link applyPlaceBlockPatch} is for.
 */

/** The place columns as an update request carries them. */
export type PlaceBlockFields = {
  placeProvider?: string | null | undefined;
  placeId?: string | null | undefined;
  placeName?: string | null | undefined;
  placeAddress?: string | null | undefined;
};

/** The stored pair. Read only when the request carries a real pair. */
export type StoredPlacePair = {
  placeProvider: string | null;
  placeId: string | null;
};

/** Columns to write. An omitted key leaves that column untouched. */
export type PlaceBlockPatch = {
  placeProvider?: string | null | undefined;
  placeId?: string | null | undefined;
  placeName?: string | null | undefined;
  placeAddress?: string | null | undefined;
};

const PLACE_BLOCK_KEYS = [
  "placeProvider",
  "placeId",
  "placeName",
  "placeAddress",
] as const;

/**
 * The place block's patch for one update request.
 *
 * `loadStoredPair` is called only when the request carries a complete
 * pair, so an update that does not touch the place costs no extra read.
 * The text is cleared only when that read shows a REPLACEMENT: a
 * client re-sending the identical pair keeps the stored snapshot, and a
 * request that supplies `placeName`/`placeAddress` always wins.
 */
export async function placeBlockPatch(
  incoming: PlaceBlockFields,
  loadStoredPair: () => Promise<StoredPlacePair | undefined>,
): Promise<PlaceBlockPatch> {
  const pairComplete =
    incoming.placeProvider != null && incoming.placeId != null;
  const pairAbsent =
    incoming.placeProvider === undefined && incoming.placeId === undefined;

  // A half pair, or an explicit null pair, clears the whole block: the
  // link and the text that described it go together.
  if (!pairAbsent && !pairComplete) {
    return {
      placeProvider: null,
      placeId: null,
      placeName: null,
      placeAddress: null,
    };
  }

  let replaced = false;
  if (pairComplete) {
    const stored = await loadStoredPair();
    replaced =
      stored != null &&
      (stored.placeProvider !== incoming.placeProvider ||
        stored.placeId !== incoming.placeId);
  }

  const patch: PlaceBlockPatch = {};
  if (pairComplete) {
    patch.placeProvider = incoming.placeProvider;
    patch.placeId = incoming.placeId;
  }
  if (incoming.placeName !== undefined) patch.placeName = incoming.placeName;
  else if (replaced) patch.placeName = null;
  if (incoming.placeAddress !== undefined) {
    patch.placeAddress = incoming.placeAddress;
  } else if (replaced) {
    patch.placeAddress = null;
  }
  return patch;
}

/**
 * Writes the patch onto an update payload and drops every column the
 * patch omits. The delete is the half that matters: the payload began
 * as `{...data}`, so an omitted key sits there as `undefined` and would
 * otherwise be sent as a column write.
 */
export function applyPlaceBlockPatch(
  target: Record<string, unknown>,
  patch: PlaceBlockPatch,
): void {
  for (const key of PLACE_BLOCK_KEYS) {
    if (key in patch) target[key] = patch[key];
    else delete target[key];
  }
}
