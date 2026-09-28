/**
 * Admin query domain: keys, reads, writes, and the token-taking pair.
 *
 * Same test seam as `lib/queries/trips.ts` and `lib/queries/auth.ts`:
 * stub the network at the `@/lib/api` module boundary with
 * `vi.mock("@/lib/api")`, then assert the exact path passed to
 * `apiFetch`. The base URL, timeout, auth header, and error shape all
 * live in `lib/api.ts`, so these tests see only the path-level
 * contract. `setToken` is mocked the same way, at the `@/lib/session`
 * module boundary.
 *
 * The row type below is a local mirror of `adminUserResponseSchema`
 * in `shared/schemas/admin.ts`, and that is deliberate, not an
 * omission: `lib/mapping.ts` exists to translate an API shape into
 * the shape a screen reads, and an admin user row already IS that
 * shape — these two screens render the response fields directly — so
 * a mapping would be a second copy of the same fields. The `select()`
 * on the list query is identity for the same reason: the API
 * response is the screen's shape.
 *
 * Over JSON `createdAt`/`updatedAt` arrive as ISO strings (zod's
 * `z.coerce.date()` accepts them server-side but the wire carries
 * text), so they are typed as strings here — the same convention as
 * `MemberWithProfile.createdAt` in `@journiful/shared/types`. The row
 * must satisfy `joinedDay(row.createdAt)` downstream, which takes an
 * ISO string.
 *
 * Node-importable by design: plain functions plus
 * `infiniteQueryOptions`/`queryOptions`, no `react-native`. The
 * `useAdminUsers` hook (a `useInfiniteQuery` wrapper) is the one
 * React seam, following the `useMembers` precedent in
 * `lib/queries/members.ts`.
 */

import {
  infiniteQueryOptions,
  mutationOptions,
  useInfiniteQuery,
} from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  listQuery,
  type AdminAction,
  type AdminFilter,
} from "@/lib/admin";
import { setToken } from "@/lib/session";

/**
 * Mirrors `adminUserResponseSchema` (`shared/schemas/admin.ts`) as it
 * arrives over JSON: dates are ISO strings, not `Date` objects. No
 * mapping step — see the module doc comment.
 */
export type AdminUserRow = {
  id: string;
  phoneNumber: string;
  displayName: string;
  profilePhotoUrl: string | null;
  handles: Record<string, string> | null;
  timezone: string | null;
  temperatureUnit: string | null;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

/** The detail read adds the trip count to the row. */
export type AdminUserDetailRow = AdminUserRow & {
  tripCount: number;
};

/** Mirrors `adminUserListResponseSchema` minus the envelope. */
export type AdminUsersPage = {
  success: true;
  users: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
};

/** Mirrors `adminUserDetailResponseSchema` minus the envelope. */
export type AdminUserDetailResult = {
  success: true;
  user: AdminUserDetailRow;
};

/** Mirrors `adminUpdateUserResponseSchema` minus the envelope. */
export type AdminUpdateUserResult = {
  success: true;
  user: AdminUserRow;
};

/** Mirrors `adminSuccessResponseSchema`: action replies carry no row. */
export type AdminActionResult = {
  success: true;
  message?: string;
};

/** Mirrors `adminImpersonationTokenResponseSchema`. */
export type AdminImpersonationTokenResult = {
  success: true;
  message: string;
  token: string;
};

/** The list identity: page size, raw search text, and the tab. */
export type AdminListFilters = {
  limit: number;
  search: string;
  filter: AdminFilter;
};

/** Key factory for the admin domain: `all` / `users(filters)` / `user(id)`. */
export const adminKeys = {
  all: ["admin"] as const,
  users: (filters: AdminListFilters) =>
    [...adminKeys.all, "users", filters] as const,
  user: (id: string) => [...adminKeys.all, "user", id] as const,
};

/**
 * `GET /admin/users?page=&limit=&…`. The query string comes from
 * `listQuery()` in `@/lib/admin`, which owns the param order (page,
 * limit, search, then the filter) and drops a blank search.
 */
export async function fetchAdminUsers(
  filters: AdminListFilters,
  page: number,
): Promise<AdminUsersPage> {
  const query = listQuery({
    page,
    limit: filters.limit,
    search: filters.search,
    filter: filters.filter,
  });
  return apiFetch<AdminUsersPage>(`/admin/users?${query}`);
}

/**
 * The `getNextPageParam` for the user list: the page after `last`
 * while rows remain uncovered (`page * limit < total`), `undefined`
 * once the last page is in. Three boundaries pin it: a search that
 * matched nothing (`total: 0`), one full page exactly exhausted
 * (`total === limit`), and one row past it (`total === limit + 1`).
 */
export function nextAdminPage(last: {
  page: number;
  limit: number;
  total: number;
}): number | undefined {
  if (last.page * last.limit < last.total) return last.page + 1;
  return undefined;
}

/**
 * The infinite-list options: `initialPageParam` 1, pages threaded
 * through `fetchAdminUsers`, `select` identity (the API response is
 * the screen's shape — see the module doc comment). No `enabled`
 * gate, on purpose: the hook lives in a child of the guard, never in
 * the component that branches on `useAuth()`, so once it mounts the
 * reader is a signed-in admin and the query cannot be asked
 * anonymously.
 */
export const adminUsersOptions = (filters: AdminListFilters) =>
  infiniteQueryOptions({
    queryKey: adminKeys.users(filters),
    queryFn: ({ pageParam }) => fetchAdminUsers(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: nextAdminPage,
    select: (data: InfiniteData<AdminUsersPage>) => data,
  });

/**
 * The user-list read. Mounts only past the admin guard (see
 * `adminUsersOptions` for why there is no `enabled` flag).
 */
export function useAdminUsers(filters: AdminListFilters) {
  return useInfiniteQuery(adminUsersOptions(filters));
}

/** `GET /admin/users/:id`, returning the row with its trip count. */
export async function fetchAdminUser(id: string): Promise<AdminUserDetailRow> {
  const body = await apiFetch<AdminUserDetailResult>(`/admin/users/${id}`);
  return body.user;
}

/**
 * Mirrors `adminUpdateUserSchema` (`shared/schemas/admin.ts`): exactly
 * `displayName` and `timezone`, and the API rejects a body with
 * neither — so only the fields given are sent, never an empty object.
 */
export type UpdateAdminUserInput = {
  id: string;
  displayName?: string;
  timezone?: string;
  temperatureUnit?: "celsius" | "fahrenheit";
};

/** `PUT /admin/users/:id` with only the fields given. */
export async function updateAdminUser(
  input: UpdateAdminUserInput,
): Promise<AdminUserRow> {
  const { id, ...fields } = input;
  const patch: {
    displayName?: string;
    timezone?: string;
    temperatureUnit?: "celsius" | "fahrenheit";
  } = {};
  if (fields.displayName !== undefined) patch.displayName = fields.displayName;
  if (fields.timezone !== undefined) patch.timezone = fields.timezone;
  if (fields.temperatureUnit !== undefined)
    patch.temperatureUnit = fields.temperatureUnit;
  const body = await apiFetch<AdminUpdateUserResult>(`/admin/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return body.user;
}

/** The row actions that hit the API: ban, unban, promote, demote. */
export type AdminUserAction = Exclude<AdminAction, "impersonate">;

/**
 * `POST /admin/users/:id/:action` for `ban | unban | promote |
 * demote`. A 403 surfaces as `ApiError` with `status: 403` — never
 * swallowed, never mapped to a friendlier shape.
 */
export async function userAction(
  id: string,
  action: AdminUserAction,
): Promise<AdminActionResult> {
  return apiFetch<AdminActionResult>(`/admin/users/${id}/${action}`, {
    method: "POST",
  });
}

/** Mutation wrapper for screens that fire `userAction` via TanStack Query. */
export const userActionOptions = () =>
  mutationOptions({
    mutationKey: ["admin", "userAction"],
    mutationFn: ({ id, action }: { id: string; action: AdminUserAction }) =>
      userAction(id, action),
  });

/**
 * `POST /admin/impersonate/:userId` with `{code}`.
 *
 * Follows the `verifyCode` shape in `lib/queries/auth.ts`: validate,
 * request, persist the token, return. The token is persisted via
 * `setToken` BEFORE resolving — and a response with no `token` field
 * throws rather than leaving the session silently unchanged.
 */
export async function startImpersonation(input: {
  userId: string;
  code: string;
}): Promise<AdminImpersonationTokenResult> {
  if (!/^\d{6}$/.test(input.code)) {
    throw new Error("That code is not right, or it has expired.");
  }
  const body = await apiFetch<AdminImpersonationTokenResult>(
    `/admin/impersonate/${input.userId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: input.code }),
    },
  );
  if (!body.token) {
    throw new Error("Impersonation started without a session. Try again.");
  }
  await setToken(body.token);
  return body;
}

/** Mutation wrapper for screens that fire `startImpersonation` via TanStack Query. */
export const startImpersonationOptions = () =>
  mutationOptions({
    mutationKey: ["admin", "startImpersonation"],
    mutationFn: startImpersonation,
  });

/**
 * `POST /admin/stop-impersonate`, persisting the returned admin token
 * via `setToken` the same way `startImpersonation` does. A response
 * with no `token` field throws rather than leaving the session
 * silently unchanged.
 *
 * The `useStopImpersonation` hook lives in `lib/impersonation.ts`,
 * not here: this module is node-importable (its test imports it
 * under plain vitest), and the hook's `expo-router` import breaks
 * that surface. See that module's doc comment.
 */
export async function stopImpersonation(): Promise<AdminImpersonationTokenResult> {
  const body = await apiFetch<AdminImpersonationTokenResult>(
    "/admin/stop-impersonate",
    { method: "POST" },
  );
  if (!body.token) {
    throw new Error("Could not return to your session. Try again.");
  }
  await setToken(body.token);
  return body;
}
