/**
 * Path-level contracts for the admin domain (`lib/queries/admin.ts`).
 *
 * Same seam as the other `lib/queries/__tests__/` suites: the network
 * is stubbed at the `@/lib/api` module boundary and the session at
 * the `@/lib/session` module boundary, and every assertion is on the
 * exact path passed to `apiFetch` — never on `fetch` internals. Plain
 * async function calls throughout; the hook itself needs no renderer,
 * so the infinite-list assertions are on the option object (key
 * stability, `initialPageParam`, `getNextPageParam` behaviour,
 * identity `select`) rather than a render.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock("@/lib/session", () => ({ setToken: vi.fn() }));

import { ApiError, apiFetch } from "@/lib/api";
import { setToken } from "@/lib/session";
import {
  adminKeys,
  adminUsersOptions,
  fetchAdminUser,
  fetchAdminUsers,
  nextAdminPage,
  startImpersonation,
  stopImpersonation,
  updateAdminUser,
  userAction,
} from "@/lib/queries/admin";

const mockedApiFetch = vi.mocked(apiFetch);
const mockedSetToken = vi.mocked(setToken);

function listPage(overrides: Record<string, unknown> = {}) {
  return {
    success: true as const,
    users: [],
    total: 0,
    page: 1,
    limit: 20,
    ...overrides,
  };
}

describe("fetchAdminUsers", () => {
  it("builds the pinned path through listQuery", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(listPage());

    await fetchAdminUsers(
      { limit: 20, search: "ada", filter: "banned" },
      2,
    );

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/admin/users?page=2&limit=20&search=ada&status=banned",
    );
  });

  it("drops a blank search and sends role for the admins tab", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(listPage());

    await fetchAdminUsers({ limit: 20, search: "   ", filter: "admins" }, 1);

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/admin/users?page=1&limit=20&role=admin",
    );
  });

  it("returns the page untouched (select is identity downstream)", async () => {
    const page = listPage({ total: 1, users: [{ id: "u1" }] });
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(page);

    await expect(
      fetchAdminUsers({ limit: 20, search: "", filter: "all" }, 1),
    ).resolves.toEqual(page);
  });
});

describe("adminKeys", () => {
  it("is stable for equal filters", () => {
    expect(
      adminKeys.users({ limit: 20, search: "ada", filter: "banned" }),
    ).toEqual(adminKeys.users({ limit: 20, search: "ada", filter: "banned" }));
  });

  it("differs across tabs", () => {
    expect(
      adminKeys.users({ limit: 20, search: "", filter: "all" }),
    ).not.toEqual(adminKeys.users({ limit: 20, search: "", filter: "banned" }));
  });

  it("keys a single record by id", () => {
    expect(adminKeys.user("u1")).toEqual(["admin", "user", "u1"]);
  });
});

describe("nextAdminPage", () => {
  it("returns undefined when a search matched nothing", () => {
    expect(nextAdminPage({ page: 1, limit: 20, total: 0 })).toBeUndefined();
  });

  it("returns undefined when one full page is exactly exhausted", () => {
    expect(nextAdminPage({ page: 1, limit: 20, total: 20 })).toBeUndefined();
  });

  it("returns 2 when one row spills past the first page", () => {
    expect(nextAdminPage({ page: 1, limit: 20, total: 21 })).toBe(2);
  });

  it("threads the page after the last one while rows remain", () => {
    expect(nextAdminPage({ page: 2, limit: 20, total: 41 })).toBe(3);
    expect(nextAdminPage({ page: 3, limit: 20, total: 41 })).toBeUndefined();
  });
});

describe("adminUsersOptions", () => {
  it("carries the stable key, initialPageParam 1, and nextAdminPage", () => {
    const filters = { limit: 20, search: "", filter: "all" as const };
    const options = adminUsersOptions(filters);

    expect(options.queryKey).toEqual(adminKeys.users(filters));
    expect(options.initialPageParam).toBe(1);
    expect(options.getNextPageParam).toBe(nextAdminPage);
  });

  it("pages through fetchAdminUsers and leaves pages untouched", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(listPage({ page: 2, total: 41 }));

    const filters = { limit: 20, search: "ada", filter: "banned" as const };
    const options = adminUsersOptions(filters);
    const page = await options.queryFn!({
      pageParam: 2,
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/admin/users?page=2&limit=20&search=ada&status=banned",
    );
    expect(page).toEqual(listPage({ page: 2, total: 41 }));
    expect(options.select!({ pages: [page], pageParams: [2] } as never)).toEqual({
      pages: [page],
      pageParams: [2],
    });
  });

  it("sets no enabled gate", () => {
    const options = adminUsersOptions({
      limit: 20,
      search: "",
      filter: "all",
    });
    expect(options).not.toHaveProperty("enabled");
  });
});

describe("fetchAdminUser", () => {
  it("reads GET /admin/users/:id", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      user: { id: "u1", tripCount: 3, openReports: [] },
    });

    await expect(fetchAdminUser("u1")).resolves.toMatchObject({
      id: "u1",
      tripCount: 3,
    });
    expect(mockedApiFetch).toHaveBeenCalledWith("/admin/users/u1");
  });

  it("hands back the open reports the detail read carries", async () => {
    // The detail row and the list row stopped being the same type when
    // `openReports` arrived. This pins that the read passes them through
    // untouched rather than dropping or reshaping them.
    mockedApiFetch.mockReset();
    const report = {
      id: "r1",
      reporterId: "u2",
      reportedId: "u1",
      tripId: null,
      reason: "harassment",
      note: "Kept messaging after being asked to stop.",
      status: "open",
      createdAt: "2026-09-30T10:00:00.000Z",
    };
    mockedApiFetch.mockResolvedValue({
      success: true,
      user: { id: "u1", tripCount: 3, openReports: [report] },
    });

    await expect(fetchAdminUser("u1")).resolves.toMatchObject({
      openReports: [report],
    });
  });

  it("lets a 403 surface as ApiError with status 403", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(403, "You can't do that here"),
    );

    const failure = await fetchAdminUser("u1").catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(403);
  });
});

describe("updateAdminUser", () => {
  it("PUTs only the displayName when only it is given", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      user: { id: "u1" },
    });

    await updateAdminUser({ id: "u1", displayName: "Ada Lovelace" });

    expect(mockedApiFetch).toHaveBeenCalledWith("/admin/users/u1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Ada Lovelace" }),
    });
  });

  it("PUTs only the timezone when only it is given", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      user: { id: "u1" },
    });

    await updateAdminUser({ id: "u1", timezone: "America/New_York" });

    expect(mockedApiFetch).toHaveBeenCalledWith("/admin/users/u1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: "America/New_York" }),
    });
  });

  it("lets a 403 surface as ApiError with status 403", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(403, "You can't do that here"),
    );

    const failure = await updateAdminUser({
      id: "u1",
      displayName: "Ada",
    }).catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(403);
  });
});

describe("userAction", () => {
  it.each(["ban", "unban", "promote", "demote"] as const)(
    "POSTs /admin/users/:id/%s",
    async (action) => {
      mockedApiFetch.mockReset();
      mockedApiFetch.mockResolvedValue({ success: true });

      await userAction("u1", action);

      expect(mockedApiFetch).toHaveBeenCalledWith(
        `/admin/users/u1/${action}`,
        { method: "POST" },
      );
    },
  );

  it("lets a 403 surface as ApiError with status 403", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(403, "You can't do that here"),
    );

    const failure = await userAction("u1", "ban").catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(403);
  });
});

describe("startImpersonation", () => {
  it("posts the code and persists the token before resolving", async () => {
    mockedApiFetch.mockReset();
    mockedSetToken.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      message: "Impersonation started",
      token: "impersonation-jwt",
    });

    const result = await startImpersonation({ userId: "u1", code: "123456" });

    expect(mockedApiFetch).toHaveBeenCalledWith("/admin/impersonate/u1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    });
    expect(mockedSetToken).toHaveBeenCalledWith("impersonation-jwt");
    expect(result).toMatchObject({ token: "impersonation-jwt" });
  });

  it("throws when the response carries no token", async () => {
    mockedApiFetch.mockReset();
    mockedSetToken.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, message: "ok" });

    await expect(
      startImpersonation({ userId: "u1", code: "123456" }),
    ).rejects.toThrow();
    expect(mockedSetToken).not.toHaveBeenCalled();
  });

  it("rejects a malformed code before the network", async () => {
    mockedApiFetch.mockReset();
    mockedSetToken.mockReset();

    await expect(
      startImpersonation({ userId: "u1", code: "12" }),
    ).rejects.toThrow();
    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(mockedSetToken).not.toHaveBeenCalled();
  });

  it("lets a 403 surface as ApiError with status 403", async () => {
    mockedApiFetch.mockReset();
    mockedSetToken.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(403, "You can't do that here"),
    );

    const failure = await startImpersonation({
      userId: "u1",
      code: "123456",
    }).catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(403);
    expect(mockedSetToken).not.toHaveBeenCalled();
  });
});

describe("stopImpersonation", () => {
  it("posts stop-impersonate and persists the admin token", async () => {
    mockedApiFetch.mockReset();
    mockedSetToken.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      message: "Impersonation stopped",
      token: "admin-jwt",
    });

    await stopImpersonation();

    expect(mockedApiFetch).toHaveBeenCalledWith("/admin/stop-impersonate", {
      method: "POST",
    });
    expect(mockedSetToken).toHaveBeenCalledWith("admin-jwt");
  });

  it("throws when the response carries no token", async () => {
    mockedApiFetch.mockReset();
    mockedSetToken.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, message: "ok" });

    await expect(stopImpersonation()).rejects.toThrow();
    expect(mockedSetToken).not.toHaveBeenCalled();
  });
});
