// Invitation validation schemas for the Journiful platform

import { z } from "zod";
import { phoneNumberSchema } from "./phone";

/**
 * Validates batch invitation creation data
 * - phoneNumbers: optional array of E.164 phone numbers, max 25
 * - userIds: optional array of user UUIDs (mutual invites), max 25
 * At least one phone number or user ID is required
 */
export const createInvitationsSchema = z
  .object({
    phoneNumbers: z
      .array(phoneNumberSchema)
      .max(25, {
        error: "Cannot invite more than 25 members at once",
      })
      .optional()
      .default([]),
    userIds: z
      .array(z.string().uuid("Each user ID must be a valid UUID"))
      .max(25, {
        error: "Cannot invite more than 25 members at once",
      })
      .optional()
      .default([]),
  })
  .refine((data) => data.phoneNumbers.length > 0 || data.userIds.length > 0, {
    message: "At least one phone number or user ID is required",
    path: ["phoneNumbers"],
  });

/**
 * Validates RSVP status update data
 * - status: one of "going", "not_going", "maybe"
 */
export const updateRsvpSchema = z.object({
  status: z.enum(["going", "not_going", "maybe"], {
    error: "Status must be one of: going, not_going, maybe",
  }),
  sharePhone: z.boolean().optional(),
});

// --- Response schemas ---

/** Invitation entity as returned by the API */
const invitationEntitySchema = z.object({
  id: z.string(),
  tripId: z.string(),
  inviterId: z.string(),
  inviteePhone: z.string(),
  status: z.enum(["pending", "accepted", "declined", "failed"]),
  sentAt: z.date(),
  respondedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  inviteeName: z.string().optional(),
});

/** Member with profile info (for member list and RSVP responses)
 *  Note: createdAt is pre-converted to ISO string by the service layer */
const memberWithProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string(),
  profilePhotoUrl: z.string().nullable(),
  handles: z.record(z.string(), z.string()).nullable().optional(),
  phoneNumber: z.string().optional(),
  status: z.enum(["going", "not_going", "maybe", "no_response"]),
  isOrganizer: z.boolean(),
  isMuted: z.boolean().optional(),
  sharePhone: z.boolean().optional(),
  createdAt: z.string(),
});

/** POST /api/trips/:tripId/invitations - Create invitations */
export const createInvitationsResponseSchema = z.object({
  success: z.literal(true),
  invitations: z.array(invitationEntitySchema),
  addedMembers: z
    .array(
      z.object({
        userId: z.string(),
        displayName: z.string(),
      }),
    )
    .optional()
    .default([]),
  skipped: z.array(z.string()),
});

/** GET /api/trips/:tripId/invitations - List invitations */
export const getInvitationsResponseSchema = z.object({
  success: z.literal(true),
  invitations: z.array(invitationEntitySchema),
});

/** POST /api/trips/:tripId/rsvp - Update RSVP */
export const updateRsvpResponseSchema = z.object({
  success: z.literal(true),
  member: memberWithProfileSchema,
});

/** GET /api/trips/:tripId/members - List members */
export const getMembersResponseSchema = z.object({
  success: z.literal(true),
  members: z.array(memberWithProfileSchema),
});

export const updateMySettingsSchema = z.object({
  sharePhone: z.boolean(),
});

export const mySettingsResponseSchema = z.object({
  success: z.literal(true),
  sharePhone: z.boolean(),
  calendarExcluded: z.boolean(),
});

// Inferred TypeScript types from schemas
export type CreateInvitationsInput = z.infer<typeof createInvitationsSchema>;
export type UpdateRsvpInput = z.infer<typeof updateRsvpSchema>;
export type UpdateMySettingsInput = z.infer<typeof updateMySettingsSchema>;
