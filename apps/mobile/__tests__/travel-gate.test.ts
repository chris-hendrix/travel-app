/**
 * The travel form's opening rule, which is pure on purpose: this suite has
 * no renderer, and the decision it encodes is the one that decides whether
 * a save can clear a row the member already filed.
 */

import { describe, expect, it } from "vitest";
import { travelFormGate } from "@/lib/travelGate";

describe("travelFormGate", () => {
  it("keeps every door shut while the read is still out", () => {
    expect(
      travelFormGate({
        status: "loading",
        namesRecord: false,
        recordFound: false,
      }),
    ).toBe("loading");
    expect(
      travelFormGate({
        status: "loading",
        namesRecord: true,
        recordFound: false,
      }),
    ).toBe("loading");
  });

  it("keeps every door shut when the read lands nowhere, and names the failure", () => {
    // The state the rule exists for. A read that never landed leaves the
    // dialog seeding its panels from nothing — "Not shared yet" over a
    // member who has filed, `Add travel` offered for a taken pair — and
    // the save that follows posts a leg the server folds into the row the
    // panels never showed, clearing every field the body leaves out
    // (`toCreateRequest` omits an empty one, and the create path reads an
    // absent one as cleared). A `status === "loading"` check let both of
    // these through to the form.
    expect(
      travelFormGate({
        status: "error",
        namesRecord: false,
        recordFound: false,
      }),
    ).toBe("failed");
    expect(
      travelFormGate({
        status: "error",
        namesRecord: true,
        recordFound: false,
      }),
    ).toBe("failed");
    expect(
      travelFormGate({
        status: "offline",
        namesRecord: false,
        recordFound: false,
      }),
    ).toBe("offline");
    expect(
      travelFormGate({
        status: "offline",
        namesRecord: true,
        recordFound: false,
      }),
    ).toBe("offline");
  });

  it("opens the doors that name no row once the read has landed", () => {
    // `member=` and the bare add door look nothing up, so an empty landed
    // answer is the honest one: the member has filed nothing.
    expect(
      travelFormGate({
        status: "success",
        namesRecord: false,
        recordFound: false,
      }),
    ).toBe("open");
  });

  it("opens the door whose row the landed answer carries", () => {
    expect(
      travelFormGate({
        status: "success",
        namesRecord: true,
        recordFound: true,
      }),
    ).toBe("open");
  });

  it("says a row is gone only from a landed read", () => {
    // The other thing a landed read can say. From an unlanded one the same
    // sentence asserts a fact the read never established, which is why
    // `error` and `offline` answer for themselves above rather than
    // falling through to here.
    expect(
      travelFormGate({
        status: "success",
        namesRecord: true,
        recordFound: false,
      }),
    ).toBe("gone");
  });
});
