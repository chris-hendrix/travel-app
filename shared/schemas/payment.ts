// Payment validation schemas for the Journiful platform

import { z } from "zod";
import { stripControlChars } from "../utils/sanitize";

/** A participant in a payment (either a user or a guest) */
const participantSchema = z
  .object({
    userId: z.string().uuid().optional(),
    guestId: z.string().uuid().optional(),
  })
  .refine((data) => (data.userId != null) !== (data.guestId != null), {
    message: "Each participant must have exactly one of userId or guestId",
  });

/**
 * Base payment data schema (without cross-field validation)
 */
const basePaymentSchema = z.object({
  description: z
    .string()
    .min(1, {
      error: "Description must be at least 1 character",
    })
    .max(500, {
      error: "Description must not exceed 500 characters",
    })
    .transform(stripControlChars),
  amount: z
    .number()
    .int({ message: "Amount must be a whole number (cents)" })
    .positive({ message: "Amount must be greater than 0" }),
  userId: z.string().uuid().optional(),
  guestId: z.string().uuid().optional(),
  participants: z
    .array(participantSchema)
    .min(1, { message: "At least one participant is required" }),
  date: z.string().datetime().optional(),
});

/**
 * Validates payment creation data
 * - description: 1-500 characters (required)
 * - amount: positive integer in cents (required)
 * - userId or guestId: payer (exactly one required)
 * - participants: array of {userId} or {guestId} (at least 1)
 * - date: ISO 8601 datetime (optional)
 */
export const createPaymentSchema = basePaymentSchema.refine(
  (data) => (data.userId != null) !== (data.guestId != null),
  {
    message: "Payer must have exactly one of userId or guestId",
    path: ["userId"],
  },
);

/**
 * Validates payment update data (all fields optional)
 * - Same validation rules as createPaymentSchema when fields are provided
 */
export const updatePaymentSchema = basePaymentSchema.partial().refine(
  (data) => {
    // If either payer field is provided, exactly one must be set
    if (data.userId !== undefined || data.guestId !== undefined) {
      return (data.userId != null) !== (data.guestId != null);
    }
    return true;
  },
  {
    message: "Payer must have exactly one of userId or guestId",
    path: ["userId"],
  },
);

// --- Response schemas ---

/** Payment participant as returned by the API */
const paymentParticipantEntitySchema = z.object({
  id: z.string(),
  paymentId: z.string(),
  userId: z.string().nullable(),
  guestId: z.string().nullable(),
  shareAmount: z.number(),
  name: z.string().optional(),
  isGuest: z.boolean().optional(),
  createdAt: z.date(),
});

/** Payment entity as returned by the API */
const paymentEntitySchema = z.object({
  id: z.string(),
  tripId: z.string(),
  description: z.string(),
  amount: z.number(),
  userId: z.string().nullable(),
  guestId: z.string().nullable(),
  date: z.date(),
  createdBy: z.string(),
  deletedAt: z.date().nullable(),
  deletedBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  payerName: z.string().optional(),
  payerIsGuest: z.boolean().optional(),
  participants: z.array(paymentParticipantEntitySchema),
});

/** GET /api/trips/:tripId/payments - Payment list */
export const paymentListResponseSchema = z.object({
  success: z.literal(true),
  payments: z.array(paymentEntitySchema),
});

/** GET/POST/PUT/restore single payment */
export const paymentResponseSchema = z.object({
  success: z.literal(true),
  payment: paymentEntitySchema,
});

// Inferred TypeScript types from schemas
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
