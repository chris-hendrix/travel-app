/**
 * The one network boundary every future store talks through.
 *
 * Never a bare `fetch` at a call site: the base URL, the timeout, the
 * auth header and the error shape all live here, so the wiring phase
 * inherits one contract instead of re-deriving it per store.
 *
 * Node-importable by design: the token is read through a dynamic
 * `await import("@/lib/session")`, never a static import, so this
 * module's static graph stays free of `react-native`,
 * `expo-secure-store` and every other native module. Unit tests run in
 * plain node with no renderer; keep it that way.
 */

export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The server answered with a non-2xx status. `code`/`message` come
 * from the API error envelope `{success:false,error:{code,message}}`;
 * both fall back when the body is missing or is not JSON.
 */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message?: string, code?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** The response did not arrive before the timeout fired. */
export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

/** The request never reached the server (DNS, refused, offline). */
export class NetworkError extends Error {
  constructor(message = "Network request failed") {
    super(message);
    this.name = "NetworkError";
  }
}

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

function isAbort(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  return error instanceof Error && error.name === "AbortError";
}

type ErrorEnvelope = {
  success?: boolean;
  error?: { code?: unknown; message?: unknown };
};

/**
 * Build the `ApiError` for a non-ok response. Reads the API error
 * envelope; a non-JSON or missing body falls back to the status text
 * (or the status-number default in `ApiError`), never a parse crash.
 */
async function toApiError(response: Response): Promise<ApiError> {
  const fallback = response.statusText || undefined;
  try {
    const body = (await response.json()) as ErrorEnvelope | null;
    const code =
      typeof body?.error?.code === "string" ? body.error.code : undefined;
    const message =
      typeof body?.error?.message === "string"
        ? body.error.message
        : undefined;
    return new ApiError(response.status, message ?? fallback, code);
  } catch {
    return new ApiError(response.status, fallback);
  }
}

/**
 * `fetch` against the API origin with a ~10s `AbortController` timeout,
 * the staged session token as `Authorization: Bearer <token>`, and
 * typed failures: `ApiError { status, code?, message }` for non-ok
 * responses, `TimeoutError` past the timeout, `NetworkError` for
 * anything else.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = apiBase();
  // Dynamic on purpose — see the module doc comment.
  const { getToken } = await import("@/lib/session");
  const token = await getToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isAbort(error, controller.signal)) throw new TimeoutError();
    throw new NetworkError(
      error instanceof Error ? error.message : undefined,
    );
  } finally {
    clearTimeout(timer);
  }
}
