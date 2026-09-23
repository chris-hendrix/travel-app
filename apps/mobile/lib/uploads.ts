/**
 * Where the API lives on the wire, and what its relative paths mean.
 *
 * Split out of `lib/api.ts` on purpose: this module is pure (no
 * `fetch`, no `react-native`), so pure mappers can depend on it without
 * dragging the network boundary into their static graph. That matters
 * because `lib/mapping.ts` is the node-importable shape layer, and 28
 * test files replace `@/lib/api` wholesale with `vi.mock` — a mapper
 * that imports `@/lib/api` breaks every one of them.
 *
 * `lib/api.ts` re-exports `apiBase`, so existing call sites are
 * unchanged.
 */

function isDev(): boolean {
  const flag = (globalThis as { __DEV__?: boolean }).__DEV__;
  if (typeof flag === "boolean") return flag;
  return process.env.NODE_ENV === "development";
}

/**
 * The API origin. Same variable `lib/flights.ts` already reads
 * (`EXPO_PUBLIC_API_URL`); the localhost fallback exists for local
 * development only and throws loudly anywhere else, so a missing
 * production URL fails at the call site instead of silently hitting
 * a laptop that is not there.
 */
export function apiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (isDev()) return "http://localhost:8000/api";
  throw new Error(
    "EXPO_PUBLIC_API_URL is not configured. Set it to the API origin.",
  );
}

/**
 * Normalize an upload path into a renderable image URL. The API stores
 * uploads as relative paths (`/uploads/<uuid>.jpg`, both the local and
 * S3 storage backends) and serves them from its own origin. Rendered
 * as-is, an `<Image>` resolves them against whatever origin the app
 * happens to run on — `localhost:8081` under Expo web, which 404s — so
 * nothing but a blank avatar appears. Prefixing is what the web app
 * already does (`getUploadUrl` in `apps/web/src/lib/api.ts`); the
 * relative path is the API's contract, so the prefix belongs on the
 * client.
 *
 * Absolute URLs (`http/https`), local picker URIs (`blob:`, `file:`,
 * `data:`) and null/empty pass through unchanged — the optimistic
 * paint after a pick is a `blob:`/`file:` URI and must not be rewritten.
 *
 * Never throws: with no API origin configured (unit tests, a missing
 * production URL) the path is returned as-is rather than breaking
 * every mapper that renders an image.
 */
export function resolveUploadUrl(
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("blob:") ||
    path.startsWith("file:") ||
    path.startsWith("data:")
  ) {
    return path;
  }
  try {
    const origin = apiBase().replace(/\/api$/, "");
    return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  } catch {
    return path;
  }
}
