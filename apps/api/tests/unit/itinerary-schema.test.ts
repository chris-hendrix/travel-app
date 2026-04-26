import { describe, it, expect } from "vitest";
import {
  events,
  accommodations,
  memberTravel,
  eventTypeEnum,
  memberTravelTypeEnum,
  type Event,
  type NewEvent,
  type Accommodation,
  type NewAccommodation,
  type MemberTravel,
  type NewMemberTravel,
} from "@/db/schema/index.js";
import { getTableName, getTableColumns } from "drizzle-orm";

describe("Itinerary Schema", () => {
  describe("Events Table", () => {
    it("should have events table defined", () => {
      expect(events).toBeDefined();
      expect(getTableName(events)).toBe("events");
    });

    it("should have correct columns", () => {
      const columns = getTableColumns(events);

      expect(columns.id).toBeDefined();
      expect(columns.tripId).toBeDefined();
      expect(columns.createdBy).toBeDefined();
      expect(columns.name).toBeDefined();
      expect(columns.description).toBeDefined();
      expect(columns.eventType).toBeDefined();
      expect(columns.location).toBeDefined();
      expect(columns.startTime).toBeDefined();
      expect(columns.endTime).toBeDefined();
      expect(columns.allDay).toBeDefined();
      expect(columns.links).toBeDefined();
      expect(columns.deletedAt).toBeDefined();
      expect(columns.deletedBy).toBeDefined();
      expect(columns.createdAt).toBeDefined();
      expect(columns.updatedAt).toBeDefined();
    });

    it("should have required fields marked as not null", () => {
      const columns = getTableColumns(events);
      expect(columns.tripId.notNull).toBe(true);
      expect(columns.createdBy.notNull).toBe(true);
      expect(columns.name.notNull).toBe(true);
      expect(columns.eventType.notNull).toBe(true);
      expect(columns.startTime.notNull).toBe(true);
      expect(columns.allDay.notNull).toBe(true);
      expect(columns.createdAt.notNull).toBe(true);
      expect(columns.updatedAt.notNull).toBe(true);
    });

    it("should have default values for boolean fields", () => {
      const columns = getTableColumns(events);
      expect(columns.allDay.default).toBeDefined();
    });

    it("should have type exports", () => {
      const selectType: Event = {} as Event;
      const insertType: NewEvent = {} as NewEvent;

      expect(selectType).toBeDefined();
      expect(insertType).toBeDefined();
    });
  });

  describe("Accommodations Table", () => {
    it("should have accommodations table defined", () => {
      expect(accommodations).toBeDefined();
      expect(getTableName(accommodations)).toBe("accommodations");
    });

    it("should have correct columns", () => {
      const columns = getTableColumns(accommodations);

      expect(columns.id).toBeDefined();
      expect(columns.tripId).toBeDefined();
      expect(columns.createdBy).toBeDefined();
      expect(columns.name).toBeDefined();
      expect(columns.address).toBeDefined();
      expect(columns.description).toBeDefined();
      expect(columns.checkIn).toBeDefined();
      expect(columns.checkOut).toBeDefined();
      expect(columns.links).toBeDefined();
      expect(columns.deletedAt).toBeDefined();
      expect(columns.deletedBy).toBeDefined();
      expect(columns.createdAt).toBeDefined();
      expect(columns.updatedAt).toBeDefined();
    });

    it("should have required fields marked as not null", () => {
      const columns = getTableColumns(accommodations);
      expect(columns.tripId.notNull).toBe(true);
      expect(columns.createdBy.notNull).toBe(true);
      expect(columns.name.notNull).toBe(true);
      expect(columns.createdAt.notNull).toBe(true);
      expect(columns.updatedAt.notNull).toBe(true);
    });

    it("should have type exports", () => {
      const selectType: Accommodation = {} as Accommodation;
      const insertType: NewAccommodation = {} as NewAccommodation;

      expect(selectType).toBeDefined();
      expect(insertType).toBeDefined();
    });
  });

  describe("Member Travel Table", () => {
    it("should have member_travel table defined", () => {
      expect(memberTravel).toBeDefined();
      expect(getTableName(memberTravel)).toBe("member_travel");
    });

    it("should have correct columns", () => {
      const columns = getTableColumns(memberTravel);

      expect(columns.id).toBeDefined();
      expect(columns.tripId).toBeDefined();
      expect(columns.memberId).toBeDefined();
      expect(columns.travelType).toBeDefined();
      expect(columns.time).toBeDefined();
      expect(columns.location).toBeDefined();
      expect(columns.details).toBeDefined();
      expect(columns.deletedAt).toBeDefined();
      expect(columns.deletedBy).toBeDefined();
      expect(columns.createdAt).toBeDefined();
      expect(columns.updatedAt).toBeDefined();
    });

    it("should have required fields marked as not null", () => {
      const columns = getTableColumns(memberTravel);
      expect(columns.tripId.notNull).toBe(true);
      expect(columns.memberId.notNull).toBe(true);
      expect(columns.travelType.notNull).toBe(true);
      expect(columns.time.notNull).toBe(true);
      expect(columns.createdAt.notNull).toBe(true);
      expect(columns.updatedAt.notNull).toBe(true);
    });

    it("should have type exports", () => {
      const selectType: MemberTravel = {} as MemberTravel;
      const insertType: NewMemberTravel = {} as NewMemberTravel;

      expect(selectType).toBeDefined();
      expect(insertType).toBeDefined();
    });
  });

  describe("Enums", () => {
    it("should have event_type enum defined", () => {
      expect(eventTypeEnum).toBeDefined();
      expect(eventTypeEnum.enumName).toBe("event_type");
    });

    it("should have member_travel_type enum defined", () => {
      expect(memberTravelTypeEnum).toBeDefined();
      expect(memberTravelTypeEnum.enumName).toBe("member_travel_type");
    });
  });
});
