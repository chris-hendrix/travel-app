import { z } from "zod";

/**
 * Moderation: the bodies and payloads for `/blocks` and `/reports`.
 *
 * The reason vocabulary lives here and nowhere else. The mobile reason
 * list re-exports `REPORT_REASONS` rather than redeclaring the four
 * values, and the labels are the mobile layer's business — a reason is
 * a vocabulary, not a sentence.
 */

/** The four reasons a user can report somebody for. */
export const REPORT_REASONS = [
  "spam",
  "harassment",
  "impersonation",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const reportReasonSchema = z.enum(REPORT_REASONS);

// --- Request schemas ---

/** `POST /api/blocks` */
export const blockUserSchema = z.object({
  userId: z.string().uuid(),
});

export type BlockUserInput = z.infer<typeof blockUserSchema>;

/** `DELETE /api/blocks/:userId` */
export const unblockUserParamsSchema = z.object({
  userId: z.string().uuid(),
});

export type UnblockUserParams = z.infer<typeof unblockUserParamsSchema>;

/**
 * `POST /api/reports`. The trip is optional because a report has to
 * outlive the trip it was made in; the note is the reporter's own words
 * and is capped so the admin screen has something bounded to render.
 */
export const reportUserSchema = z.object({
  userId: z.string().uuid(),
  tripId: z.string().uuid().optional(),
  reason: reportReasonSchema,
  note: z.string().max(500).optional(),
});

export type ReportUserInput = z.infer<typeof reportUserSchema>;

// --- Response schemas ---

/**
 * A stored report, as it arrives over JSON (`createdAt` is ISO text).
 * Shared with `shared/schemas/admin.ts`, which hangs the same row off the
 * admin user detail response.
 */
export const userReportSchema = z.object({
  id: z.string().uuid(),
  reporterId: z.string().uuid(),
  reportedId: z.string().uuid(),
  tripId: z.string().uuid().nullable(),
  reason: reportReasonSchema,
  note: z.string().nullable(),
  status: z.enum(["open", "reviewed", "actioned", "dismissed"]),
  createdAt: z.coerce.date(),
});

export type UserReportRow = z.infer<typeof userReportSchema>;

/** The people the caller has blocked, enough to render a row each. */
export const blockedUsersResponseSchema = z.object({
  success: z.literal(true),
  blocks: z.array(
    z.object({
      userId: z.string().uuid(),
      displayName: z.string(),
      profilePhotoUrl: z.string().nullable(),
    }),
  ),
});

export type BlockedUsersResponse = z.infer<typeof blockedUsersResponseSchema>;
