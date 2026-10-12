import { describe, expect, it } from "vitest";
import {
  CURRENCY,
  MAX_CENTS,
  amountError,
  formatCents,
  parseAmount,
} from "@/lib/money";

describe("parseAmount", () => {
  it("reads a whole number of dollars as cents", () => {
    expect(parseAmount("12")).toBe(1200);
  });

  it("reads one or two decimals, padding the short one", () => {
    expect(parseAmount("12.5")).toBe(1250);
    expect(parseAmount("12.50")).toBe(1250);
    expect(parseAmount("12.05")).toBe(1205);
  });

  it("tolerates a currency symbol, thousands separators and space", () => {
    expect(parseAmount("$1,234.56")).toBe(123456);
    expect(parseAmount("  12  ")).toBe(1200);
    expect(parseAmount("$12")).toBe(1200);
  });

  it("refuses three decimals rather than rounding them away", () => {
    expect(parseAmount("12.345")).toBeNull();
  });

  it("refuses empty, unparseable, zero and negative input", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("0.00")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("12.")).toBeNull();
    expect(parseAmount(".5")).toBeNull();
  });

  it("keeps every amount an integer number of cents", () => {
    for (const raw of ["12", "12.5", "12.50", "$1,234.56"]) {
      expect(Number.isInteger(parseAmount(raw))).toBe(true);
    }
  });
});

describe("formatCents", () => {
  it("prints cents as dollars with two decimals", () => {
    expect(formatCents(1234)).toBe("$12.34");
    expect(formatCents(1200)).toBe("$12.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(0)).toBe("$0.00");
  });

  it("groups thousands", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
  });

  it("prints a negative with a leading minus, for the owed side", () => {
    expect(formatCents(-1234)).toBe("-$12.34");
  });

  it("round-trips through parseAmount", () => {
    for (const cents of [1, 5, 100, 1234, 100_000, 99_999_999]) {
      expect(parseAmount(formatCents(cents))).toBe(cents);
    }
  });
});

describe("amountError", () => {
  it("says nothing when the amount is usable", () => {
    expect(amountError("12")).toBeUndefined();
    expect(amountError("$1,234.56")).toBeUndefined();
  });

  it("asks for an amount when the field is empty", () => {
    expect(amountError("")).toBe("Enter an amount.");
    expect(amountError("   ")).toBe("Enter an amount.");
  });

  it("says what looks wrong when it is not an amount", () => {
    expect(amountError("abc")).toBe("That does not look like an amount.");
    expect(amountError("12.345")).toBe("That does not look like an amount.");
    expect(amountError("0")).toBe("That does not look like an amount.");
    expect(amountError("-5")).toBe("That does not look like an amount.");
  });

  it("refuses a well-formed amount above the cap, and accepts the cap itself", () => {
    expect(amountError("1000000.00")).toBeUndefined();
    expect(parseAmount("1000000.00")).toBe(MAX_CENTS);
    expect(amountError("1000000.01")).toBe(
      "That is more than this trip can record.",
    );
  });
});

describe("the module's contract", () => {
  it("denominates the surface in dollars", () => {
    expect(CURRENCY).toBe("USD");
  });
});
