/**
 * The write mappers, which are the whole of "a field the patch is not about
 * must not reach the wire": a value the member took back has to reach the
 * wire as an explicit null, a field the patch is not about must not reach it
 * at all, and a create — the one write that states the whole leg — sends the
 * leg's mode where an edit sends it only when the patch carries one. That
 * distinction is the whole reason these are pure helpers with a test rather
 * than a handful of spread operators inline — there is no renderer in this
 * suite.
 */

import { describe, expect, it } from "vitest";
import type { MockTravel } from "@/mocks/travel";
import { toCreateRequest, toUpdateRequest } from "@/lib/travelStore";

/**
 * A leg the form built, in the store's create-path shape. The mode is the
 * record's own: the column is `NOT NULL`, so a row read back always has
 * one, and the form's chips pre-select `flight` until the mode is a
 * question the form asks.
 */
function record(overrides: Partial<MockTravel> = {}): MockTravel {
  return {
    id: "custom-arrival-1",
    memberId: "member-1",
    memberName: "Ana",
    travelType: "arrival",
    transportMode: "flight",
    departureTime: null,
    departureLocation: null,
    arrivalTime: "2026-09-18T15:40:00.000Z",
    arrivalLocation: "BCN T2",
    flightNumber: null,
    details: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("toCreateRequest", () => {
  it("sends the record's own mode, because a create states the whole leg", () => {
    // Optional on the wire but always sent by this client: the only
    // default the column has is its own, and a create body without a
    // mode would be asking the server to apply it to a row that already
    // carries one.
    expect(toCreateRequest(record({ transportMode: "train" }))).toMatchObject({
      transportMode: "train",
    });
  });
});

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

  it("carries the mode, which unlike the direction is editable", () => {
    // `travelType` is create-only; the mode is a column the update schema
    // takes, so a member who switches from the train to a car has an edit
    // that can say so.
    expect(toUpdateRequest({ transportMode: "bus" })).toEqual({
      transportMode: "bus",
    });
  });

  it("sends no transportMode at all for a patch that is not about it", () => {
    // Every `MockTravel` carries a mode, so a patch built from a full
    // record always hands one over — but a patch about the bag drop must
    // not volunteer the mode it happens to be holding, or an edit made
    // from a stale record would quietly rewrite the leg's mode.
    expect(
      toUpdateRequest({ arrivalTime: "2026-09-18T15:40:00.000Z" }),
    ).not.toHaveProperty("transportMode");
  });
});
