import { describe, it, expect } from "vitest";
import { buildPushPayload } from "@/services/push-payload.builder.js";

describe("buildPushPayload", () => {
  describe("trip_cancelled", () => {
    it("points at the trip list rather than the deleted trip", () => {
      const payload = buildPushPayload(
        "trip_cancelled",
        "Trip deleted",
        "Sam deleted Los Picos Trail",
        { tripId: "t-1" },
      );

      // Not `/trips?id=t-1`: a cancelled trip now answers 404, so the push
      // would land on the app's "Nothing here".
      expect(payload.url).toBe("/trips");
      expect(payload.tag).toBe("cancelled-t-1");
      expect(payload.title).toBe("Trip deleted");
      expect(payload.body).toBe("Sam deleted Los Picos Trail");
    });

    it("falls back to the root url and a bare tag without a tripId", () => {
      const payload = buildPushPayload(
        "trip_cancelled",
        "Trip deleted",
        "A trip was deleted",
      );

      expect(payload.url).toBe("/");
      expect(payload.tag).toBe("cancelled");
    });
  });
});
