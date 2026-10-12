import { describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same pattern as `stays.test.ts`: stub the network at the module
// boundary and keep the real `NetworkError` (the offline status is an
// `instanceof` check).
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NetworkError, apiFetch } from "@/lib/api";
import type { GetBalancesResponse } from "@journiful/shared/types";
import {
  balanceKeys,
  balancesOptions,
  myBalanceOptions,
  useBalances,
  useMyBalance,
} from "@/lib/queries/balances";
import { makeQueryClient } from "@/lib/queries/client";

const mockedApiFetch = vi.mocked(apiFetch);

/** The simplified-move shape `GET /balances` returns. */
function balancesBody(): GetBalancesResponse {
  return {
    success: true,
    balances: [
      {
        from: { id: "member-2", name: "Priya" },
        to: { id: "member-1", name: "Ava" },
        amount: 4500,
      },
    ],
  };
}

describe("balanceKeys", () => {
  it("namespaces the two reads under one domain, per trip", () => {
    expect(balanceKeys.all).toEqual(["balances"]);
    expect(balanceKeys.trip("t1")).toEqual(["balances", "trip", "t1"]);
    expect(balanceKeys.me("t1")).toEqual(["balances", "me", "t1"]);
  });

  it("keeps the trip's moves and the reader's position apart", () => {
    expect(balanceKeys.trip("t1")).not.toEqual(balanceKeys.me("t1"));
    expect(balanceKeys.trip("t1")).not.toEqual(balanceKeys.trip("t2"));
  });
});

describe("balancesOptions", () => {
  it("reads the trip's balances and maps them to {from, to} people", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(balancesBody());

    const options = balancesOptions("t1");
    expect(options.queryKey).toEqual(balanceKeys.trip("t1"));

    const moves = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/t1/balances");
    expect(moves).toEqual([
      {
        from: { id: "member-2", name: "Priya" },
        to: { id: "member-1", name: "Ava" },
        amount: 4500,
      },
    ]);
  });

  it("keeps the amount in cents", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(balancesBody());

    const moves = await balancesOptions("t1").queryFn!({
      queryKey: balanceKeys.trip("t1"),
    } as never);

    expect(Number.isInteger(moves[0]!.amount)).toBe(true);
    expect(moves[0]!.amount).toBe(4500);
  });
});

describe("myBalanceOptions", () => {
  it("reads the reader's own position", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      netBalance: -4500,
      details: [{ person: { id: "member-2", name: "Priya" }, amount: 4500 }],
    });

    const options = myBalanceOptions("t1");
    expect(options.queryKey).toEqual(balanceKeys.me("t1"));

    const balance = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/t1/balances/me");
    expect(balance.netBalance).toBe(-4500);
    expect(balance.details).toEqual([
      { person: { id: "member-2", name: "Priya" }, amount: 4500 },
    ]);
  });
});

describe("the section hooks", () => {
  function captureWithClient<T>(
    client: QueryClient,
    render: () => T,
  ): T {
    const seen = { value: null as T | null };
    function Probe() {
      seen.value = render();
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
    if (seen.value === null) throw new Error("the hook was not captured");
    return seen.value;
  }

  it("reports loading for an absent trip id, without asking the server", () => {
    mockedApiFetch.mockReset();
    const client = makeQueryClient();

    const moves = captureWithClient(client, () => useBalances(undefined));
    const mine = captureWithClient(client, () => useMyBalance(undefined));

    expect(moves.status).toBe("loading");
    expect(moves.balances).toEqual([]);
    expect(mine.status).toBe("loading");
    expect(mine.balance).toEqual({ netBalance: 0, details: [] });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("reports offline for a NetworkError", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new NetworkError());

    // `retry: false` isolates the status mapping from the retry policy.
    // `retryOnMount: false` matters just as much: an errored query with
    // no data is re-fetched on mount by default, and during that in-flight
    // fetch the observer reports `pending` again — so without this the
    // hook says "loading" and the offline branch is unreachable from a
    // synchronous render. `staleTime: Infinity` keeps the cached error
    // from being treated as stale.
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryOnMount: false, staleTime: Infinity },
      },
    });
    await client.prefetchQuery(balancesOptions("t1"));

    const moves = captureWithClient(client, () => useBalances("t1"));

    expect(moves.status).toBe("offline");
  });

  it("reports success and hands back the moves once they arrive", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(balancesBody());

    const client = makeQueryClient();
    await client.prefetchQuery(balancesOptions("t1"));

    const moves = captureWithClient(client, () => useBalances("t1"));

    expect(moves.status).toBe("success");
    expect(moves.balances).toHaveLength(1);
    expect(moves.balances[0]!.from.name).toBe("Priya");
  });

  it("reports success with a zero position for a settled trip", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      netBalance: 0,
      details: [],
    });

    const client = makeQueryClient();
    await client.prefetchQuery(myBalanceOptions("t1"));

    const mine = captureWithClient(client, () => useMyBalance("t1"));

    expect(mine.status).toBe("success");
    expect(mine.balance.netBalance).toBe(0);
  });
});
