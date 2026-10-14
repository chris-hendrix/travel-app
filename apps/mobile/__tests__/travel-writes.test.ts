/**
 * The update mapper, which is one half of "the server's fields are
 * nullable now": a value the member took back has to reach the wire as an
 * explicit null, and a field the patch is not about must not reach it at
 * all. That distinction is the whole reason this is a pure helper with a
 * test rather than four spread operators inline — there is no renderer in
 * this suite.
 */

import { describe, expect, it } from "vitest";
import { toUpdateRequest } from "@/lib/travelStore";

describe("toUpdateRequest", () => {
  it("sends an explicit null for a field the leg emptied", () => {
    // Cleared in the form: the key is present, and the value is empty.
    // Before this, all four were dropped and the column kept its old
    // value, so a field could never be taken back.
    expect(
      toUpdateRequest({
        arrivalLocation: "",
        departureLocation: null,
        details: "",
        flightNumber: "",
      }),
    ).toEqual({
      arrivalLocation: null,
      departureLocation: null,
      details: null,
      flightNumber: null,
    });
  });

  it("sends no key at all for a field the patch is not about", () => {
    // Absent is not empty: this patch is about the time, and the mapper
    // must not volunteer a null for the four clearable fields.
    expect(
      toUpdateRequest({ arrivalTime: "2026-09-18T15:40:00.000Z" }),
    ).toEqual({ arrivalTime: "2026-09-18T15:40:00.000Z" });
  });

  it("never sends a time as null", () => {
    // The two time columns stay non-nullable and `pertinentTimeRefine`
    // reads them, so removing a direction is what Delete is for.
    const body = toUpdateRequest({ departureTime: "", arrivalTime: null });
    expect(body).not.toHaveProperty("departureTime");
    expect(body).not.toHaveProperty("arrivalTime");
  });

  it("keeps a real value, and never rides a direction change", () => {
    // The API's update schema drops `travelType` (a direction is
    // create-only), so sending it would be a key the server throws away —
    // and the one key that could ask it to put a second live row on the
    // pair. The patch still builds from a full leg record, which is why
    // this is asserted rather than left to the type.
    expect(
      toUpdateRequest({
        travelType: "departure",
        departureLocation: "BCN T2",
        details: "Bag drop",
      }),
    ).toEqual({
      departureLocation: "BCN T2",
      details: "Bag drop",
    });
  });

  it("carries no memberId, whose membership is fixed at create", () => {
    expect(
      toUpdateRequest({ memberId: "m-1", details: "x" }),
    ).not.toHaveProperty("memberId");
  });
});
