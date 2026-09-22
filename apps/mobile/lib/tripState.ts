
/**
 * Where a member's own state for a trip lives: the clock its times are
 * read on, and whether its past is showing.
 *
 * Neither is a secret and neither is the server's — no row anywhere holds
 * them — so this is not `lib/session.ts`'s problem. It is the same
 * *shape* of problem though: a value that has to survive a reload with no
 * backend to hold it, on a platform whose web export has no secure store.
 * Hence the same two answers, and the same lazy `require` for the native
 * module: a static import of `expo-secure-store` would pull it into the
 * web bundle and break `expo export --platform web`.
 *
 * Which platform this is, is answered by `localStorage` rather than by
 * `Platform.OS`, and that is deliberate: `react-native`'s entry point is
 * Flow, which this project's unit tests cannot parse, and
 * `lib/queries/__tests__/trip-settings.test.ts` renders the settings
 * provider through `react-dom/server` — so a static import of
 * `react-native` here takes that whole suite down with it. There is no
 * third platform to be wrong about: the web export has a `localStorage`
 * and native has none.
 *
 * One key rather than one per trip: these are read and written together,
 * and a member has a handful of trips rather than thousands. Lost on a
 * failed read or write, deliberately: the defaults in the settings store
 * are live answers (a finished trip opens with its past showing), so a
 * store that cannot be read is a store that has not been written yet.
 */

const KEY = "journiful.tripState";

function nativeStore() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-secure-store") as typeof import("expo-secure-store");
}

/** The web export is the one with a `localStorage`; native has none. */
function onWeb(): boolean {
  return typeof localStorage !== "undefined";
}

/** Whatever was stored, as JSON. Unreadable is unset. */
export async function readTripState(): Promise<unknown> {
  try {
    const raw = onWeb()
      ? localStorage.getItem(KEY)
      : await nativeStore().getItemAsync(KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeTripState(value: unknown): Promise<void> {
  try {
    const raw = JSON.stringify(value);
    if (onWeb()) {
      localStorage.setItem(KEY, raw);
      return;
    }
    await nativeStore().setItemAsync(KEY, raw);
  } catch {
    // A preference that cannot be written is one this device will not
    // remember. Failing the update over it would be the tail wagging the
    // run: what the person asked for is already on screen.
  }
}
