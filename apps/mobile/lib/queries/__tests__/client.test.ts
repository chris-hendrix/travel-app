import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queries/client";

describe("makeQueryClient", () => {
  it("returns defaults (retry 1, staleTime 30s)", () => {
    const client = makeQueryClient();
    expect(client).toBeInstanceOf(QueryClient);
    expect(client.getDefaultOptions().queries?.retry).toBe(1);
    expect(client.getDefaultOptions().queries?.staleTime).toBe(30_000);
  });

  it("returns a fresh client per call", () => {
    expect(makeQueryClient()).not.toBe(makeQueryClient());
  });
});
