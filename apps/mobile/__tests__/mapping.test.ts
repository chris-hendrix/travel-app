import { describe, expect, it } from "vitest";
import type { Accommodation } from "@journiful/shared/types";
import type { Event } from "@journiful/shared/types";
import type { MemberTravel } from "@journiful/shared/types";
import type { MemberWithProfile } from "@journiful/shared/types";
import type { Notification as ApiNotification } from "@journiful/shared/types";
import type { TripDetail, TripSummary } from "@journiful/shared/types";
import type { User } from "@journiful/shared/types";
import {
  placeholderPhoto,
  toEvent,
  toMember,
  toNotification,
  toProfile,
  toStay,
  toTravel,
  toTrip,
  toTripSummary,
} from "@/lib/mapping";

const tripDetail: TripDetail = {
  id: "trip-1",
  name: "Los Picos Trail",
  destination: "Mallorca",
  destinationLat: 39.6,
  destinationLon: 2.9,
  startDate: "2026-09-20",
  endDate: "2026-09-27",
  preferredTimezone: "Europe/Madrid",
  description: "Hut to hut.",
  coverImageUrl: "https://cdn.example/cover.jpg",
  createdBy: "user-1",
  allowMembersToAddEvents: true,
  showAllMembers: true,
  themeId: null,
  themeFont: null,
  cancelled: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
  organizers: [],
  memberCount: 6,
};

const tripSummary: TripSummary = {
  id: "trip-1",
  name: "Los Picos Trail",
  destination: "Mallorca",
  startDate: "2026-09-20",
  endDate: "2026-09-27",
  coverImageUrl: null,
  themeId: null,
  themeFont: null,
  isOrganizer: true,
  rsvpStatus: "going",
  organizerInfo: [],
  memberCount: 11,
  eventCount: 4,
};

const apiEvent: Event = {
  id: "event-1",
  tripId: "trip-1",
  createdBy: "user-1",
  name: "Dinner in town",
  description: "Table for eight.",
  eventType: "food_and_drink",
  location: "Trattoria Nuova",
  locationLat: 41.3,
  locationLon: 2.1,
  startTime: new Date("2026-09-21T20:30:00Z"),
  endTime: new Date("2026-09-21T22:30:00Z"),
  allDay: false,
  links: null,
  deletedAt: null,
  deletedBy: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

describe("toTrip", () => {
  it("maps TripDetail onto the mobile Trip shape", () => {
    expect(toTrip(tripDetail)).toEqual({
      id: "trip-1",
      title: "Los Picos Trail",
      location: "Mallorca",
      image: "https://cdn.example/cover.jpg",
      going: 6,
      startDate: "2026-09-20",
      endDate: "2026-09-27",
      description: "Hut to hut.",
      preferredTimezone: "Europe/Madrid",
    });
  });

  it("falls back to placeholderPhoto when there is no cover", () => {
    expect(toTrip({ ...tripDetail, coverImageUrl: null }).image).toBe(
      placeholderPhoto("trip-1"),
    );
  });

  it("prefixes a relative upload path with the API origin", () => {
    process.env.EXPO_PUBLIC_API_URL = "http://localhost:8000/api";
    expect(
      toTrip({ ...tripDetail, coverImageUrl: "/uploads/abc.jpg" }).image,
    ).toBe("http://localhost:8000/uploads/abc.jpg");
    delete process.env.EXPO_PUBLIC_API_URL;
  });
});

describe("toTripSummary", () => {
  it("maps going from memberCount", () => {
    const mapped = toTripSummary(tripSummary);
    expect(mapped.going).toBe(11);
    expect(mapped.title).toBe("Los Picos Trail");
    expect(mapped.location).toBe("Mallorca");
  });

  it("falls back to placeholderPhoto when there is no cover", () => {
    expect(toTripSummary(tripSummary).image).toBe(placeholderPhoto("trip-1"));
  });
});

describe("toEvent", () => {
  it("maps eventType to type and location to place", () => {
    const mapped = toEvent(apiEvent);
    expect(mapped.type).toBe("food_and_drink");
    expect(mapped.place).toBe("Trattoria Nuova");
    expect(mapped.name).toBe("Dinner in town");
    expect(mapped.startTime).toBe("2026-09-21T20:30:00.000Z");
    expect(mapped.endTime).toBe("2026-09-21T22:30:00.000Z");
  });

  it("maps image to placeholderPhoto()", () => {
    expect(toEvent(apiEvent).image).toBe(placeholderPhoto("event-1"));
  });

  it("keeps the coordinates an event is read back with", () => {
    // The API stores what the picker resolved, so a read keeps them
    // and an edit round-trip starts from them rather than losing them.
    const mapped = toEvent(apiEvent);
    expect(mapped.locationLat).toBe(41.3);
    expect(mapped.locationLon).toBe(2.1);
  });

  it("reads missing coordinates as absent, never 0", () => {
    const mapped = toEvent({ ...apiEvent, locationLat: null, locationLon: null });
    expect(mapped.locationLat).toBeNull();
    expect(mapped.locationLon).toBeNull();
  });
});

describe("toStay", () => {
  const accommodation: Accommodation = {
    id: "stay-1",
    tripId: "trip-1",
    createdBy: "user-1",
    name: "Casa Marina",
    address: "Via Umberto I 22, Praiano",
    addressLat: 40.6,
    addressLon: 14.5,
    description: "Keypad 7788.",
    checkIn: "2026-09-20T15:00:00.000Z",
    checkOut: "2026-09-25T10:00:00.000Z",
    links: [{ url: "https://example.com/listing", name: "Listing" }],
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
  };

  it("maps address, times, and links through", () => {
    expect(toStay(accommodation)).toEqual({
      id: "stay-1",
      name: "Casa Marina",
      address: "Via Umberto I 22, Praiano",
      addressLat: 40.6,
      addressLon: 14.5,
      description: "Keypad 7788.",
      checkIn: "2026-09-20T15:00:00.000Z",
      checkOut: "2026-09-25T10:00:00.000Z",
      image: placeholderPhoto("stay-1"),
      links: [{ url: "https://example.com/listing", name: "Listing" }],
      deletedAt: null,
    });
  });

  it("maps null times to the untimed stay", () => {
    const mapped = toStay({ ...accommodation, checkIn: null, checkOut: null });
    expect(mapped.checkIn).toBeNull();
    expect(mapped.checkOut).toBeNull();
  });
});

describe("toTravel", () => {
  const travel: MemberTravel = {
    id: "travel-1",
    tripId: "trip-1",
    memberId: "member-1",
    travelType: "arrival",
    departureLocation: "JFK T4",
    departureTime: new Date("2026-09-20T07:00:00Z"),
    arrivalLocation: "BCN T2",
    arrivalTime: new Date("2026-09-20T15:40:00Z"),
    details: "Bags take twenty minutes.",
    flightNumber: "UA 1842",
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    memberName: "Dana Mercer",
  };

  it("maps both ends of the leg and the member name", () => {
    expect(toTravel(travel)).toEqual({
      id: "travel-1",
      memberId: "member-1",
      memberName: "Dana Mercer",
      travelType: "arrival",
      departureTime: "2026-09-20T07:00:00.000Z",
      departureLocation: "JFK T4",
      arrivalTime: "2026-09-20T15:40:00.000Z",
      arrivalLocation: "BCN T2",
      flightNumber: "UA 1842",
      details: "Bags take twenty minutes.",
      deletedAt: null,
    });
  });
});

describe("toMember", () => {
  const member: MemberWithProfile = {
    id: "member-1",
    userId: "user-2",
    displayName: "Dana Mercer",
    profilePhotoUrl: null,
    handles: { venmo: "dana-mercer", instagram: "dana.mercer" },
    phoneNumber: "+15551234567",
    status: "going",
    isOrganizer: true,
    sharePhone: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("maps displayName to name and keeps organizer status", () => {
    const mapped = toMember(member);
    expect(mapped).toMatchObject({
      id: "member-1",
      name: "Dana Mercer",
      status: "going",
      isOrganizer: true,
      phone: "+15551234567",
      sharePhone: true,
      handles: { venmo: "dana-mercer", instagram: "dana.mercer" },
    });
  });

  it("tolerates an absent phoneNumber (visibility is server-side)", () => {
    const { phoneNumber: _dropped, ...withoutPhone } = member;
    expect(toMember(withoutPhone).phone).toBe("");
  });
});

describe("toNotification", () => {
  const notification: ApiNotification = {
    id: "notif-1",
    userId: "user-1",
    tripId: "trip-1",
    type: "mutual_invite",
    title: "Trip invitation",
    body: "Dana invited you to Los Picos Trail",
    data: { inviterId: "user-dana" },
    readAt: null,
    createdAt: "2026-09-20T10:00:00.000Z",
  };

  it("maps 1:1 minus the caller-owned userId", () => {
    expect(toNotification(notification)).toEqual({
      id: "notif-1",
      type: "mutual_invite",
      title: "Trip invitation",
      body: "Dana invited you to Los Picos Trail",
      tripId: "trip-1",
      data: { inviterId: "user-dana" },
      readAt: null,
      createdAt: "2026-09-20T10:00:00.000Z",
    });
  });
});

describe("toProfile", () => {
  const user: User = {
    id: "user-1",
    phoneNumber: "+15550000001",
    displayName: "Ada Lovelace",
    timezone: "America/New_York",
    handles: { venmo: "ada-lovelace", instagram: "ada.lovelace" },
    temperatureUnit: "fahrenheit",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };

  it("maps the user onto the flat profile shape", () => {
    expect(toProfile(user)).toEqual({
      id: "user-1",
      displayName: "Ada Lovelace",
      phoneNumber: "+15550000001",
      profilePhotoUrl: null,
      handles: { venmo: "ada-lovelace", instagram: "ada.lovelace" },
      timezone: "America/New_York",
      temperatureUnit: "fahrenheit",
    });
  });

  it("flattens nested handles back for partial handle sets", () => {
    expect(
      toProfile({ ...user, handles: { instagram: "ada.lovelace" } }).handles,
    ).toEqual({ instagram: "ada.lovelace" });
    expect(toProfile({ ...user, handles: null }).handles).toBeNull();
  });
});
