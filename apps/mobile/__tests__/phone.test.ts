import { describe, expect, it } from "vitest";
import { formatPhoneForDisplay, phoneError, toE164 } from "@/lib/phone";

describe("toE164", () => {
  it("reads a bare ten-digit number as a home number", () => {
    expect(toE164("4155552671")).toBe("+14155552671");
    expect(toE164("(415) 555-2671")).toBe("+14155552671");
  });

  it("lets a leading + override the home country", () => {
    expect(toE164("+44 7700 900123")).toBe("+447700900123");
    expect(toE164("+34 600 123 456")).toBe("+34600123456");
  });

  it("takes the project's own test numbers, which are not real ones", () => {
    // 555 is not an assigned area code, so libphonenumber calls these
    // invalid. They are what every test credential in this repo uses, and
    // what the API accepts in dev, which is why the field asks whether a
    // number is *possible* rather than whether it is real.
    expect(toE164("+15550000001")).toBe("+15550000001");
    expect(toE164("5551234567")).toBe("+15551234567");
  });

  it("refuses something that is not a number yet", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("123")).toBeNull();
    expect(toE164("600 123 456")).toBeNull();
    expect(toE164("+1 555 123 4567 891 234")).toBeNull();
  });
});

describe("formatPhoneForDisplay", () => {
  it("writes a number the way a person does", () => {
    expect(formatPhoneForDisplay("+15550000001")).toBe("+1 555 000 0001");
    expect(formatPhoneForDisplay("+447700900123")).toBe("+44 7700 900123");
  });

  it("hands back what it cannot read, rather than punctuating it wrongly", () => {
    expect(formatPhoneForDisplay("+1555000")).toBe("+1555000");
    expect(formatPhoneForDisplay("not a number")).toBe("not a number");
  });
});

describe("phoneError", () => {
  it("asks for a number when there is nothing to read", () => {
    expect(phoneError("")).toBe("Enter a number.");
    expect(phoneError("   ")).toBe("Enter a number.");
    expect(phoneError("+1")).toBe("Enter a number.");
  });

  it("says so when there is something there and it does not add up", () => {
    expect(phoneError("600 123 456")).toBe("That does not look like a number.");
    expect(phoneError("+1 555 123 4567 891 234")).toBe(
      "That does not look like a number.",
    );
  });

  it("has nothing to say about a number it can read", () => {
    expect(phoneError("4155552671")).toBeUndefined();
    expect(phoneError("+15550000001")).toBeUndefined();
    expect(phoneError("+34 600 123 456")).toBeUndefined();
  });
});
