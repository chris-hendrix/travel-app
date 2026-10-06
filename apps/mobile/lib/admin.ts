/**
 * Pure admin rules for the user-management screens.
 *
 * Everything here is a value or a string the screens would otherwise
 * eyeball: the list filter and its query string, which actions a row
 * offers, the count line, the empty sentences, the pending labels,
 * the reason labels, and the three-way route guard. No dates: join-date
 * formatting lives in `lib/dateRange.ts` (`joinedDay`, which reads its
 * day through `lib/timezone.ts`), never here.
 *
 * Node-importable by design: no `react`, no `react-native`.
 */

import type { ReportReason } from "@journiful/shared/schemas";

/** An admin user row, mirroring `adminUserResponseSchema` in `shared/schemas/admin.ts`. */
export type AdminRowUser = {
  id: string;
  role: string;
  status: string;
};

/** The actions the record screen can offer for a row. */
export type AdminAction = "ban" | "unban" | "promote" | "demote" | "impersonate";

/** The user-list filter. Three tabs send `status`; only `admins` sends `role`. */
export type AdminFilter = "all" | "active" | "banned" | "admins";

/** The filter tabs in order, with their labels. */
export const FILTERS: readonly { value: AdminFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "banned", label: "Banned" },
  { value: "admins", label: "Admins" },
];

/**
 * The query params a filter contributes. `active` and `banned` narrow
 * `status`; only `admins` sends `role` — sending `role` for the banned
 * tab would silently return the wrong set.
 */
export function filterParams(
  filter: AdminFilter,
): { status?: string; role?: string } {
  if (filter === "active") return { status: "active" };
  if (filter === "banned") return { status: "banned" };
  if (filter === "admins") return { role: "admin" };
  return {};
}

export type AdminListQuery = {
  page: number;
  limit: number;
  search: string;
  filter: AdminFilter;
};

/**
 * The query string for `GET /admin/users`. A search that is empty or
 * whitespace only is dropped, never sent; anything else is trimmed
 * and encoded. The order is page, limit, search, then the filter, so
 * the string is the same whatever the caller passes.
 */
export function listQuery({ page, limit, search, filter }: AdminListQuery): string {
  const parts = [`page=${page}`, `limit=${limit}`];
  const trimmed = search.trim();
  if (trimmed !== "") parts.push(`search=${encodeURIComponent(trimmed)}`);
  const params = filterParams(filter);
  if (params.status !== undefined) parts.push(`status=${encodeURIComponent(params.status)}`);
  if (params.role !== undefined) parts.push(`role=${encodeURIComponent(params.role)}`);
  return parts.join("&");
}

/**
 * Which actions a row offers. Your own record offers none: ban and
 * demote refuse it (`AdminSelfActionError`), and impersonation refuses
 * any admin row including your own (`Cannot impersonate an admin
 * user`), so neither is shown rather than answered with a 4xx.
 */
export function adminActionsFor(
  user: AdminRowUser,
  viewerId: string,
): AdminAction[] {
  if (user.id === viewerId) return [];
  const actions: AdminAction[] = [user.status === "banned" ? "unban" : "ban"];
  if (user.role === "admin") {
    actions.push("demote");
    return actions;
  }
  actions.push("promote", "impersonate");
  return actions;
}

/** A counted line: `1 user`, `23 users`, `1 trip`, `3 trips`. */
export function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export type AdminEmptyState = {
  search: string;
  filter: AdminFilter;
};

/**
 * The empty sentence for the user list. Any narrowing — a search, or
 * a filter other than All — points at the search; only the wide-open
 * list says no one is here yet.
 */
export function emptyCopy({ search, filter }: AdminEmptyState): string {
  if (search.trim() !== "" || filter !== "all") return "No users match that search.";
  return "No users yet.";
}

/**
 * The labels for the reason vocabulary, in the order `REPORT_REASONS`
 * gives them, so a list of reasons reads the same here and anywhere else
 * it is drawn.
 *
 * The vocabulary itself is not restated: it comes from
 * `REPORT_REASONS` in `shared/schemas/moderation.ts`, which is the one
 * place the four reasons exist. What lives here is the mobile layer's
 * half — saying them.
 */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment",
  impersonation: "Impersonation",
  other: "Something else",
};

/** One reason, as the screen says it. */
export function reportReasonLabel(reason: ReportReason): string {
  return REPORT_REASON_LABELS[reason];
}

/** The in-flight label for an action button. */
export function pendingLabel(action: AdminAction): string {
  switch (action) {
    case "ban":
      return "Banning…";
    case "unban":
      return "Unbanning…";
    case "promote":
      return "Promoting…";
    case "demote":
      return "Demoting…";
    case "impersonate":
      return "Starting…";
  }
}

/** Where the admin session stands. */
export type AdminGuardStatus = "restoring" | "signed-out" | "signed-in";

export type AdminGuardState = {
  status: AdminGuardStatus;
  isAdmin: boolean;
};

/**
 * Where the admin guard sends a reader. `null` renders the loading
 * block; `"admin"` renders the screen; anything else is a redirect
 * target.
 */
export function guardDestination({
  status,
  isAdmin,
}: AdminGuardState): "/" | "/trips" | "admin" | null {
  if (status === "restoring") return null;
  if (status === "signed-out") return "/";
  if (!isAdmin) return "/trips";
  return "admin";
}
