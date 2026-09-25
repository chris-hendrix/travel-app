/**
 * The API emits web urls (`push-payload.builder.ts`); the app routes
 * them to screens. Pure mapping, no navigation side effects.
 *
 * - `/` -> `/` (landing; the signed-in app redirects onward)
 * - `/trips?id=<id>` -> `/trips/detail?id=<id>` (this app's trip
 *   screen lives at trips/detail and reads `id`)
 * - `&tab=itinerary` -> the same trip screen (it owns the run)
 * - `tab=messages` -> the trip screen too: this app has no messages
 *   surface, so it degrades rather than dead-ends
 * - anything unrecognised -> null (caller stays put)
 */
export function pushTarget(url: string | undefined | null): string | null {
  if (!url) return null;
  // Absolute urls from another origin are never ours.
  if (/^https?:\/\//i.test(url)) {
    let absolute: URL;
    try {
      absolute = new URL(url);
    } catch {
      return null;
    }
    if (absolute.host !== "journiful.app") return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url, "https://journiful.app");
  } catch {
    return null;
  }
  const path = parsed.pathname;
  if (path === "/" || path === "") return "/";
  if (path !== "/trips") return null;
  const id = parsed.searchParams.get("id");
  if (!id) return "/trips";
  return `/trips/detail?id=${encodeURIComponent(id)}`;
}
