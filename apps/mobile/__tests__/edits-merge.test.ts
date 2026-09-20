import { describe, expect, it } from "vitest";
import {
  mergeEventDelete,
  mergeEventEdit,
} from "@/lib/eventsStore";
import {
  mergeTravelDelete,
  mergeTravelEdit,
} from "@/lib/travelStore";
import { mergeStayDelete, mergeStayEdit } from "@/lib/staysStore";
import type { ItineraryEvent } from "@/lib/itinerary";
import type { MockTravel } from "@/mocks/travel";
import type { Stay } from "@/lib/stays";

describe("edit and soft-delete compose", () => {
  it("events: delete-then-update keeps deletedAt", () => {
    const slot = mergeEventDelete(undefined, "2026-09-20T00:00:00.000Z");
    const merged = mergeEventEdit(slot, { name: "Renamed" } as Partial<ItineraryEvent>);
    expect(merged.deletedAt).toBe("2026-09-20T00:00:00.000Z");
    expect(merged.name).toBe("Renamed");
  });

  it("events: update-then-delete keeps the patch", () => {
    const slot = mergeEventEdit(undefined, { name: "Renamed" } as Partial<ItineraryEvent>);
    const merged = mergeEventDelete(slot, "2026-09-20T00:00:00.000Z");
    expect(merged.name).toBe("Renamed");
    expect(merged.deletedAt).toBe("2026-09-20T00:00:00.000Z");
  });

  it("travel: delete-then-update keeps deletedAt", () => {
    const slot = mergeTravelDelete(undefined, "2026-09-20T00:00:00.000Z");
    const merged = mergeTravelEdit(slot, { details: "Late" } as Partial<MockTravel>);
    expect(merged.deletedAt).toBe("2026-09-20T00:00:00.000Z");
    expect(merged.details).toBe("Late");
  });

  it("travel: update-then-delete keeps the patch", () => {
    const slot = mergeTravelEdit(undefined, { details: "Late" } as Partial<MockTravel>);
    const merged = mergeTravelDelete(slot, "2026-09-20T00:00:00.000Z");
    expect(merged.details).toBe("Late");
    expect(merged.deletedAt).toBe("2026-09-20T00:00:00.000Z");
  });

  it("stays: delete-then-update keeps deletedAt", () => {
    const slot = mergeStayDelete(undefined, "2026-09-20T00:00:00.000Z");
    const merged = mergeStayEdit(slot, { name: "Renamed" } as Partial<Stay>);
    expect(merged.deletedAt).toBe("2026-09-20T00:00:00.000Z");
    expect(merged.name).toBe("Renamed");
  });

  it("stays: update-then-delete keeps the patch", () => {
    const slot = mergeStayEdit(undefined, { name: "Renamed" } as Partial<Stay>);
    const merged = mergeStayDelete(slot, "2026-09-20T00:00:00.000Z");
    expect(merged.name).toBe("Renamed");
    expect(merged.deletedAt).toBe("2026-09-20T00:00:00.000Z");
  });
});
