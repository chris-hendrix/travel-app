// Integration test to verify all exports are accessible

import { describe, it, expect } from "vitest";
import {
  // Types
  type User,
  type AuthResponse,
  // Schema inferred types
  type RequestCodeInput,
  type VerifyCodeInput,
  type CompleteProfileInput,
  type CreateTripInput,
  type UpdateTripInput,
  type AddCoOrganizerInput,
  // Schemas
  requestCodeSchema,
  verifyCodeSchema,
  completeProfileSchema,
  createTripSchema,
  updateTripSchema,
  addCoOrganizerSchema,
  phoneNumberSchema,
  emailSchema,
  uuidSchema,
  // Utils
  convertToUTC,
  formatInTimeZone,
} from "../index.js";

import {
  type CreateEventInput,
  type UpdateEventInput,
  type CreateAccommodationInput,
  type UpdateAccommodationInput,
  type CreateMemberTravelInput,
  type UpdateMemberTravelInput,
  type CreateInvitationsInput,
  type UpdateRsvpInput,
  type UpdateMySettingsInput,
  createEventSchema,
  updateEventSchema,
  createAccommodationSchema,
  updateAccommodationSchema,
  createMemberTravelSchema,
  updateMemberTravelSchema,
  createInvitationsSchema,
  updateRsvpSchema,
  updateMySettingsSchema,
  mySettingsResponseSchema,
  getMutualsQuerySchema,
  getMutualSuggestionsQuerySchema,
  dailyForecastSchema,
  tripWeatherResponseSchema,
} from "../schemas/index.js";

describe("Package Exports", () => {
  it("should export all auth schemas", () => {
    expect(requestCodeSchema).toBeDefined();
    expect(verifyCodeSchema).toBeDefined();
    expect(completeProfileSchema).toBeDefined();
  });

  it("should export all trip schemas", () => {
    expect(createTripSchema).toBeDefined();
    expect(updateTripSchema).toBeDefined();
    expect(addCoOrganizerSchema).toBeDefined();
  });

  it("should export all event schemas", () => {
    expect(createEventSchema).toBeDefined();
    expect(updateEventSchema).toBeDefined();
  });

  it("should export all accommodation schemas", () => {
    expect(createAccommodationSchema).toBeDefined();
    expect(updateAccommodationSchema).toBeDefined();
  });

  it("should export all member travel schemas", () => {
    expect(createMemberTravelSchema).toBeDefined();
    expect(updateMemberTravelSchema).toBeDefined();
  });

  it("should export all invitation schemas", () => {
    expect(createInvitationsSchema).toBeDefined();
    expect(updateRsvpSchema).toBeDefined();
    expect(updateMySettingsSchema).toBeDefined();
    expect(mySettingsResponseSchema).toBeDefined();
  });

  it("should export all mutuals schemas", () => {
    expect(getMutualsQuerySchema).toBeDefined();
    expect(getMutualSuggestionsQuerySchema).toBeDefined();
  });

  it("should export all weather schemas", () => {
    expect(dailyForecastSchema).toBeDefined();
    expect(tripWeatherResponseSchema).toBeDefined();
  });

  it("should export existing schemas", () => {
    expect(phoneNumberSchema).toBeDefined();
    expect(emailSchema).toBeDefined();
    expect(uuidSchema).toBeDefined();
  });

  it("should export utils", () => {
    expect(convertToUTC).toBeDefined();
    expect(formatInTimeZone).toBeDefined();
  });

  it("should allow type usage", () => {
    // This test verifies types can be used (compile-time check)
    const user: User = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      phoneNumber: "+14155552671",
      displayName: "Test User",
      timezone: "America/New_York",
      handles: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    expect(user).toBeDefined();

    const authResponse: AuthResponse = {
      token: "jwt-token",
      user,
      requiresProfile: false,
    };
    expect(authResponse).toBeDefined();

    const requestInput: RequestCodeInput = {
      phoneNumber: "+14155552671",
      smsConsent: true,
    };
    expect(requestInput).toBeDefined();

    const verifyInput: VerifyCodeInput = {
      phoneNumber: "+14155552671",
      code: "123456",
      smsConsent: true,
    };
    expect(verifyInput).toBeDefined();

    const profileInput: CompleteProfileInput = {
      displayName: "Test User",
      timezone: "America/New_York",
    };
    expect(profileInput).toBeDefined();

    const createTripInput: CreateTripInput = {
      name: "Summer Vacation",
      destination: "Hawaii",
      timezone: "Pacific/Honolulu",
      allowMembersToAddEvents: true,
      showAllMembers: false,
    };
    expect(createTripInput).toBeDefined();

    const updateTripInput: UpdateTripInput = {
      name: "Updated Trip Name",
    };
    expect(updateTripInput).toBeDefined();

    const addCoOrganizerInput: AddCoOrganizerInput = {
      phoneNumber: "+14155552671",
    };
    expect(addCoOrganizerInput).toBeDefined();

    const createEventInput: CreateEventInput = {
      name: "Dinner",
      eventType: "meal",
      startTime: "2026-07-15T19:00:00Z",
      allDay: false,
      isOptional: false,
    };
    expect(createEventInput).toBeDefined();

    const updateEventInput: UpdateEventInput = {
      name: "Updated Dinner",
    };
    expect(updateEventInput).toBeDefined();

    const createAccommodationInput: CreateAccommodationInput = {
      name: "Beach Hotel",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-20T11:00:00.000Z",
    };
    expect(createAccommodationInput).toBeDefined();

    const updateAccommodationInput: UpdateAccommodationInput = {
      name: "Updated Hotel",
    };
    expect(updateAccommodationInput).toBeDefined();

    const createMemberTravelInput: CreateMemberTravelInput = {
      travelType: "arrival",
      time: "2026-07-15T10:00:00Z",
    };
    expect(createMemberTravelInput).toBeDefined();

    const updateMemberTravelInput: UpdateMemberTravelInput = {
      location: "Airport Terminal 3",
    };
    expect(updateMemberTravelInput).toBeDefined();

    const createInvitationsInput: CreateInvitationsInput = {
      phoneNumbers: ["+14155552671"],
      userIds: [],
    };
    expect(createInvitationsInput).toBeDefined();

    const updateRsvpInput: UpdateRsvpInput = {
      status: "going",
    };
    expect(updateRsvpInput).toBeDefined();

    const updateMySettingsInput: UpdateMySettingsInput = {
      sharePhone: true,
    };
    expect(updateMySettingsInput).toBeDefined();
  });

  it("should validate schemas with inferred types", () => {
    const requestInput: RequestCodeInput = {
      phoneNumber: "+14155552671",
      smsConsent: true,
    };
    const validated = requestCodeSchema.parse(requestInput);
    expect(validated.phoneNumber).toBe("+14155552671");

    const verifyInput: VerifyCodeInput = {
      phoneNumber: "+14155552671",
      code: "123456",
      smsConsent: true,
    };
    const validatedVerify = verifyCodeSchema.parse(verifyInput);
    expect(validatedVerify.code).toBe("123456");

    const profileInput: CompleteProfileInput = {
      displayName: "Test User",
    };
    const validatedProfile = completeProfileSchema.parse(profileInput);
    expect(validatedProfile.displayName).toBe("Test User");

    const invitationInput: CreateInvitationsInput = {
      phoneNumbers: ["+14155552671"],
      userIds: [],
    };
    const validatedInvitation = createInvitationsSchema.parse(invitationInput);
    expect(validatedInvitation.phoneNumbers).toHaveLength(1);

    const rsvpInput: UpdateRsvpInput = {
      status: "going",
    };
    const validatedRsvp = updateRsvpSchema.parse(rsvpInput);
    expect(validatedRsvp.status).toBe("going");
  });
});
