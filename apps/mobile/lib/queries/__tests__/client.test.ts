import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queries/client";

describe("makeQueryClient", () => {
  it("returns defaults (a retry predicate, staleTime 30s)", () => {
    const client = makeQueryClient();
    expect(client).toBeInstanceOf(QueryClient);
    // The policy itself is asserted where it is specified, in
    // `__tests__/query-client.test.ts`; this file only pins the shape
    // of the defaults the app is wired to.
    expect(typeof client.getDefaultOptions().queries?.retry).toBe("function");
    expect(client.getDefaultOptions().queries?.staleTime).toBe(30_000);
  });

  it("returns a fresh client per call", () => {
    expect(makeQueryClient()).not.toBe(makeQueryClient());
  });
});
