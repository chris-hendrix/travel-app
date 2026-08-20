// Tests for balance validation schemas

import { describe, it, expect } from "vitest";
import {
  balanceResponseSchema,
  myBalanceResponseSchema,
} from "../schemas/index.js";

describe("balanceResponseSchema", () => {
  it("should accept balances with member persons using isPlaceholder", () => {
    const response = {
      success: true,
      balances: [
        {
          from: { id: "member-1", name: "Alice", isPlaceholder: false },
          to: { id: "member-2", name: "Bob", isPlaceholder: true },
          amount: 1000,
        },
      ],
    };
    expect(() => balanceResponseSchema.parse(response)).not.toThrow();
  });

  it("should accept an empty balances array", () => {
    const response = { success: true, balances: [] };
    expect(() => balanceResponseSchema.parse(response)).not.toThrow();
  });

  it("should reject a person missing isPlaceholder", () => {
    const response = {
      success: true,
      balances: [
        {
          from: { id: "member-1", name: "Alice" },
          to: { id: "member-2", name: "Bob", isPlaceholder: false },
          amount: 1000,
        },
      ],
    };
    const result = balanceResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it("should reject a person using the old isGuest flag", () => {
    const response = {
      success: true,
      balances: [
        {
          from: { id: "member-1", name: "Alice", isGuest: false },
          to: { id: "member-2", name: "Bob", isGuest: true },
          amount: 1000,
        },
      ],
    };
    const result = balanceResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it("should reject a person missing id or name", () => {
    const response = {
      success: true,
      balances: [
        {
          from: { name: "Alice", isPlaceholder: false },
          to: { id: "member-2", name: "Bob", isPlaceholder: false },
          amount: 1000,
        },
      ],
    };
    const result = balanceResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });
});

describe("myBalanceResponseSchema", () => {
  it("should accept details with isPlaceholder persons", () => {
    const response = {
      success: true,
      netBalance: 2500,
      details: [
        {
          person: { id: "member-1", name: "Alice", isPlaceholder: false },
          amount: 2500,
        },
      ],
    };
    expect(() => myBalanceResponseSchema.parse(response)).not.toThrow();
  });

  it("should reject details where a person is missing isPlaceholder", () => {
    const response = {
      success: true,
      netBalance: 0,
      details: [
        {
          person: { id: "member-1", name: "Alice" },
          amount: 0,
        },
      ],
    };
    const result = myBalanceResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });
});
