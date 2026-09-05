// Payment validation schemas for the Journiful platform

import { z } from "zod";
import { stripControlChars } from "../utils/sanitize";

/** A participant in a payment (a trip member user) */
const participantSchema = z.object({
  userId: z.string().uuid(),
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
  userId: z.string().uuid(),
  participants: z
    .array(participantSchema)
    .min(1, { message: "At least one participant is required" }),
  date: z.string().datetime().optional(),
});

/**
 * Validates payment creation data
 * - description: 1-500 characters (required)
 * - amount: positive integer in cents (required)
 * - userId: payer (required)
 * - participants: array of {userId} (at least 1)
 * - date: ISO 8601 datetime (optional)
 */
export const createPaymentSchema = basePaymentSchema;

/**
 * Validates payment update data (all fields optional)
 * - Same validation rules as createPaymentSchema when fields are provided
 */
export const updatePaymentSchema = basePaymentSchema.partial();

// --- Response schemas ---

/** Payment participant as returned by the API */
const paymentParticipantEntitySchema = z.object({
  id: z.string(),
  paymentId: z.string(),
  userId: z.string(),
  shareAmount: z.number(),
  name: z.string().optional(),
  createdAt: z.date(),
});

/** Payment entity as returned by the API */
const paymentEntitySchema = z.object({
  id: z.string(),
  tripId: z.string(),
  description: z.string(),
  amount: z.number(),
  userId: z.string(),
  date: z.date(),
  createdBy: z.string(),
  deletedAt: z.date().nullable(),
  deletedBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  payerName: z.string().optional(),
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
