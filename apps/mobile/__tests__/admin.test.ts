import { describe, expect, it } from "vitest";
import {
  FILTERS,
  adminActionsFor,
  emptyCopy,
  filterParams,
  guardDestination,
  listQuery,
  pendingLabel,
  plural,
  type AdminFilter,
} from "@/lib/admin";

describe("FILTERS", () => {
  it("carries the four tabs with their labels", () => {
    expect(FILTERS.map((filter) => filter.value)).toEqual([
      "all",
      "active",
      "banned",
      "admins",
    ]);
    expect(FILTERS.map((filter) => filter.label)).toEqual([
      "All",
      "Active",
      "Banned",
      "Admins",
    ]);
  });
});

describe("filterParams", () => {
  it("sends status for the active and banned tabs, role only for admins", () => {
    expect(filterParams("all")).toEqual({});
    expect(filterParams("active")).toEqual({ status: "active" });
    expect(filterParams("banned")).toEqual({ status: "banned" });
    expect(filterParams("admins")).toEqual({ role: "admin" });
  });
});

describe("listQuery", () => {
  it("produces the page and limit", () => {
    expect(
      listQuery({ page: 1, limit: 20, search: "", filter: "all" }),
    ).toBe("page=1&limit=20");
  });

  it("sends the filter's param", () => {
    expect(
      listQuery({ page: 2, limit: 20, search: "", filter: "banned" }),
    ).toBe("page=2&limit=20&status=banned");
    expect(
      listQuery({ page: 1, limit: 20, search: "", filter: "admins" }),
    ).toBe("page=1&limit=20&role=admin");
  });

  it("encodes a search with a space", () => {
    expect(
      listQuery({ page: 1, limit: 20, search: "ada lovelace", filter: "all" }),
    ).toBe("page=1&limit=20&search=ada%20lovelace");
  });

  it("drops a search that is empty or whitespace only", () => {
    expect(
      listQuery({ page: 1, limit: 20, search: "   ", filter: "all" }),
    ).toBe("page=1&limit=20");
  });
});

describe("adminActionsFor", () => {
  const other = "viewer-id";

  it("offers ban, promote and impersonate for another active non-admin", () => {
    expect(
      adminActionsFor(
        { id: "u1", status: "active", role: "user" },
        other,
      ),
    ).toEqual(["ban", "promote", "impersonate"]);
  });

  it("offers unban instead of ban for a banned non-admin", () => {
    expect(
      adminActionsFor(
        { id: "u1", status: "banned", role: "user" },
        other,
      ),
    ).toEqual(["unban", "promote", "impersonate"]);
  });

  it("offers ban and demote, never impersonate, for an admin", () => {
    expect(
      adminActionsFor(
        { id: "u1", status: "active", role: "admin" },
        other,
      ),
    ).toEqual(["ban", "demote"]);
  });

  it("offers nothing for your own record", () => {
    expect(
      adminActionsFor(
        { id: "viewer-id", status: "active", role: "admin" },
        "viewer-id",
      ),
    ).toEqual([]);
  });
});

describe("plural", () => {
  it("counts rows and trips with the caller's noun", () => {
    expect(plural(1, "user")).toBe("1 user");
    expect(plural(23, "user")).toBe("23 users");
    expect(plural(1, "trip")).toBe("1 trip");
    expect(plural(3, "trip")).toBe("3 trips");
  });
});

describe("emptyCopy", () => {
  it("says no one is here yet for the wide-open list", () => {
    expect(emptyCopy({ search: "", filter: "all" })).toBe("No users yet.");
  });

  it("points at the search once the list is narrowed", () => {
    expect(emptyCopy({ search: "ada", filter: "all" })).toBe(
      "No users match that search.",
    );
    expect(emptyCopy({ search: "", filter: "banned" satisfies AdminFilter })).toBe(
      "No users match that search.",
    );
  });
});

describe("pendingLabel", () => {
  it("names the action in flight", () => {
    expect(pendingLabel("ban")).toBe("Banning…");
    expect(pendingLabel("unban")).toBe("Unbanning…");
    expect(pendingLabel("promote")).toBe("Promoting…");
    expect(pendingLabel("demote")).toBe("Demoting…");
    expect(pendingLabel("impersonate")).toBe("Starting…");
  });
});

describe("guardDestination", () => {
  it("renders the loading block while restoring", () => {
    expect(
      guardDestination({ status: "restoring", isAdmin: false }),
    ).toBeNull();
  });

  it("sends a signed-out reader to the sign-in screen", () => {
    expect(
      guardDestination({ status: "signed-out", isAdmin: false }),
    ).toBe("/");
  });

  it("sends a signed-in non-admin back to the app", () => {
    expect(
      guardDestination({ status: "signed-in", isAdmin: false }),
    ).toBe("/trips");
  });

  it("renders for a signed-in admin", () => {
    expect(
      guardDestination({ status: "signed-in", isAdmin: true }),
    ).toBe("admin");
  });

  it("still renders the loading block while restoring, even for an admin", () => {
    expect(
      guardDestination({ status: "restoring", isAdmin: true }),
    ).toBeNull();
  });
});
