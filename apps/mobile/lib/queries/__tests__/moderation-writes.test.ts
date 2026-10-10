import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same probe seam as `member-writes.test.ts`: `react-dom` ships no server
// types in this workspace, so the renderer is loaded through `require`
// (typed as `any`). This package's vitest is plain node, with no renderer.
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

// Keep the real `ApiError` (the failure test asserts `instanceof` and the
// copy mapper reads its status) and stub only the network at the module
// boundary.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ApiError, NetworkError, apiFetch } from "@/lib/api";
import type { Member } from "@/lib/members";
import { memberKeys } from "@/lib/queries/members";
import {
  blockUser,
  blockedUsersOptions,
  moderationKeys,
  reportUser,
  unblockUser,
  useBlockedUsers,
  useBlockUser,
  useReportUser,
  useUnblockUser,
  type BlockedUserRow,
} from "@/lib/queries/moderation";
import { makeQueryClient } from "@/lib/queries/client";

const mockedApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  mockedApiFetch.mockReset();
});

/**
 * One row of `GET /blocks`'s own shape (`blockedUsersResponseSchema` in
 * `shared/schemas/moderation.ts`): the account, a name to render, and the
 * photo the roster row would have used.
 */
function blockedRow(overrides: Partial<BlockedUserRow> = {}): BlockedUserRow {
  return {
    userId: "user-2",
    displayName: "Ava Reyes",
    profilePhotoUrl: null,
    ...overrides,
  };
}

function cachedMember(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-2",
    userId: "user-2",
    name: "Ava",
    status: "going",
    isOrganizer: false,
    phone: "+15550000002",
    sharePhone: true,
    handles: null,
    ...overrides,
  };
}

describe("blockUser", () => {
  it("POSTs /blocks with the account and resolves", async () => {
    mockedApiFetch.mockResolvedValue({ success: true });

    await expect(blockUser("user-2")).resolves.toBeUndefined();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user-2" }),
    });
  });
});

describe("unblockUser", () => {
  it("DELETEs /blocks/:userId and resolves", async () => {
    mockedApiFetch.mockResolvedValue({ success: true });

    await expect(unblockUser("user-2")).resolves.toBeUndefined();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/blocks/user-2", {
      method: "DELETE",
    });
  });
});

/**
 * The read half: the list of people the caller has blocked, which is the
 * only place an unblock can be reached from (the roster omits the blocked
 * pair in both directions, so the row is not there to undo from).
 */
describe("blockedUsersOptions", () => {
  it("reads GET /blocks and yields the rows, never the envelope", async () => {
    mockedApiFetch.mockResolvedValue({
      success: true,
      blocks: [blockedRow()],
    });

    const options = blockedUsersOptions();
    expect(options.queryKey).toEqual(moderationKeys.blocks());
    const envelope = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/blocks");
    // `{success, blocks}` is the transport's shape, and it stays there:
    // what a caller of this options factory renders is the rows.
    expect(options.select!(envelope)).toEqual([blockedRow()]);
  });
});

/**
 * The hook, mounted under a Suspense boundary with a fallback that says so.
 * A `useSuspenseQuery` here would render the fallback and never fill
 * `seen`, which is the failure this harness exists to catch.
 */
function renderBlocked(client: QueryClient = makeQueryClient()) {
  const seen: { blocked: BlockedUserRow[] | null } = { blocked: null };
  function Probe() {
    seen.blocked = useBlockedUsers().blocked;
    return null;
  }
  const html = renderToString(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        Suspense,
        { fallback: createElement("span", null, "suspended") },
        createElement(Probe),
      ),
    ),
  );
  return { seen, html };
}

describe("useBlockedUsers", () => {
  it("hands the rows to the render", async () => {
    mockedApiFetch.mockResolvedValue({
      success: true,
      blocks: [
        blockedRow(),
        blockedRow({ userId: "user-3", displayName: "Sam Okafor" }),
      ],
    });

    // Prefetch into the same client so the render finds fresh data and
    // never has to reach for it (`members.test.ts`'s own convention).
    const client = makeQueryClient();
    await client.fetchQuery(blockedUsersOptions());

    const { seen, html } = renderBlocked(client);
    expect(html).not.toContain("suspended");
    expect(seen.blocked).toMatchObject([
      { userId: "user-2", displayName: "Ava Reyes" },
      { userId: "user-3", displayName: "Sam Okafor" },
    ]);
  });

  it("neither throws nor suspends when the read failed", async () => {
    mockedApiFetch.mockRejectedValue(
      new NetworkError("Network request failed"),
    );

    const client = makeQueryClient();
    // Seed the failed read the way a screen meets it: the query has
    // already answered, and the answer was a rejection. `retry: false`
    // here mirrors the hook's own flag, so the seeding is one attempt.
    await expect(
      client.fetchQuery({ ...blockedUsersOptions(), retry: false }),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(mockedApiFetch).toHaveBeenCalledWith("/blocks");

    const { seen, html } = renderBlocked(client);

    // The roster above this read is the gate. A side read that can take
    // the roll call down with it is not a side read.
    expect(html).not.toContain("suspended");
    // And it hands back no rows: the screen draws the block only when
    // there are some, so this is the render that draws nothing at all.
    expect(seen.blocked).toEqual([]);
  });
});

describe("reportUser", () => {
  it("POSTs /reports with the reason alone when there is no trip and no note", async () => {
    mockedApiFetch.mockResolvedValue({ success: true });

    await reportUser({ userId: "user-2", reason: "harassment" });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    // The two optional keys are absent rather than null: the API's schema
    // takes them as `.optional()`, so an empty note is the absence of the
    // key and never a null it would have to read as one.
    expect(mockedApiFetch).toHaveBeenCalledWith("/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user-2", reason: "harassment" }),
    });
    expect(
      Object.keys(
        JSON.parse(
          String(mockedApiFetch.mock.calls[0]?.[1]?.body),
        ) as Record<string, unknown>,
      ),
    ).toEqual(["userId", "reason"]);
  });

  it("carries the trip and the note when they are given", async () => {
    mockedApiFetch.mockResolvedValue({ success: true });

    await reportUser({
      userId: "user-2",
      tripId: "trip-1",
      reason: "spam",
      note: "Advertising in the itinerary",
    });

    expect(mockedApiFetch).toHaveBeenCalledWith("/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "user-2",
        reason: "spam",
        tripId: "trip-1",
        note: "Advertising in the itinerary",
      }),
    });
  });
});

/**
 * Renders one moderation hook against a fresh client seeded with the two
 * caches a block touches, and hands the captured hook back, so the cache
 * assertions below read the same cache the mutation wrote.
 */
function capture<T>(use: (tripId: string) => T) {
  const client = makeQueryClient();
  client.setQueryData<Member[]>(memberKeys.list("trip-1"), [cachedMember()]);
  client.setQueryData<unknown[]>(moderationKeys.blocks(), []);

  const seen: { hook: T | null } = { hook: null };
  function Probe() {
    seen.hook = use("trip-1");
    return null;
  }
  function Wrapper() {
    return createElement(
      QueryClientProvider,
      { client },
      createElement(Suspense, { fallback: null }, createElement(Probe)),
    );
  }
  renderToString(createElement(Wrapper));
  if (!seen.hook) throw new Error("the moderation hook was not captured");
  return { client, hook: seen.hook };
}

describe("useBlockUser", () => {
  it("invalidates the roster and the blocked list, and removes nothing by hand", async () => {
    mockedApiFetch.mockResolvedValue({ success: true });

    const { client, hook } = capture(useBlockUser);

    await hook.mutateAsync({ userId: "user-2" });

    // Both keys go stale: the roster is what the server filters the pair
    // out of, and the blocked list is the other half of the same fact.
    expect(client.getQueryState(memberKeys.list("trip-1"))?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(moderationKeys.blocks())?.isInvalidated).toBe(
      true,
    );
    // The roster is still the server's own row until the invalidation's
    // refetch answers: a block is the server's decision, so the row leaves
    // when the next roster does not carry it, never before.
    expect(
      client
        .getQueryData<Member[]>(memberKeys.list("trip-1"))
        ?.map((row) => row.id),
    ).toEqual(["member-2"]);
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it("leaves the cache alone and invalidates nothing when the write fails", async () => {
    mockedApiFetch.mockRejectedValue(new ApiError(500, "Block failed"));

    const { client, hook } = capture(useBlockUser);

    await expect(hook.mutateAsync({ userId: "user-2" })).rejects.toBeInstanceOf(
      ApiError,
    );

    expect(
      client
        .getQueryData<Member[]>(memberKeys.list("trip-1"))
        ?.map((row) => row.id),
    ).toEqual(["member-2"]);
    expect(client.getQueryState(memberKeys.list("trip-1"))?.isInvalidated).toBe(
      false,
    );
    expect(client.getQueryState(moderationKeys.blocks())?.isInvalidated).toBe(
      false,
    );
    // One attempt, and no settle: a failed write is not a reason to ask
    // the server for the whole roster again.
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });
});

describe("useUnblockUser", () => {
  it("settles through the same two keys", async () => {
    mockedApiFetch.mockResolvedValue({ success: true });

    const { client, hook } = capture(useUnblockUser);

    await hook.mutateAsync({ userId: "user-2" });

    expect(mockedApiFetch).toHaveBeenCalledWith("/blocks/user-2", {
      method: "DELETE",
    });
    expect(client.getQueryState(memberKeys.list("trip-1"))?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(moderationKeys.blocks())?.isInvalidated).toBe(
      true,
    );
  });
});

describe("useReportUser", () => {
  it("POSTs the report for this trip and settles through the domain's own keys", async () => {
    mockedApiFetch.mockResolvedValue({ success: true });

    const { client, hook } = capture(useReportUser);

    await hook.mutateAsync({ userId: "user-2", reason: "impersonation" });

    expect(mockedApiFetch).toHaveBeenCalledWith("/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "user-2",
        reason: "impersonation",
        tripId: "trip-1",
      }),
    });
    expect(client.getQueryState(memberKeys.list("trip-1"))?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(moderationKeys.blocks())?.isInvalidated).toBe(
      true,
    );
  });
});
