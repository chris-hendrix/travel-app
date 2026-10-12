// Payment validation schemas for the Journiful platform

import { z } from "zod";
import { stripControlChars } from "../utils/sanitize";

/** A participant in a payment (a trip member — guests allowed) */
const participantSchema = z.object({
  memberId: z.string().uuid(),
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
  payerMemberId: z.string().uuid(),
  participants: z
    .array(participantSchema)
    .min(1, { message: "At least one participant is required" }),
  date: z.string().datetime().optional(),
  // "how was it paid" ("Venmo") — a separate fact from what it was.
  // Control chars are stripped first, then an empty-or-whitespace note is
  // null. Note the two consequences: the value is stored as typed
  // (padding included — `description` is not trimmed either), and the
  // clearing value is "", never null: `updatePaymentSchema` is
  // `basePaymentSchema.partial()`, so an explicit `null` is a 400 even
  // though the read side hands the client `null`. A form echoing a read
  // value back must map null -> "".
  note: z
    .string()
    .max(280, { message: "Note must not exceed 280 characters" })
    .transform(stripControlChars)
    .transform((s) => (s.trim() === "" ? null : s))
    .optional(),
});

/**
 * Validates payment creation data
 * - description: 1-500 characters (required)
 * - amount: positive integer in cents (required)
 * - payerMemberId: payer member (any trip member, guests allowed) (required)
 * - participants: array of {memberId} (at least 1)
 * - date: ISO 8601 datetime (optional)
 * - note: how it was paid, 1-280 characters (optional; "" becomes null)
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
  memberId: z.string(),
  shareAmount: z.number(),
  name: z.string().optional(),
  createdAt: z.date(),
});

/** Payment entity as returned by the API */
const paymentEntitySchema = z.object({
  id: z.string(),
  tripId: z.string(),
  description: z.string(),
  // Load-bearing: this is the response serializer, so a field absent here
  // never reaches the client whatever the service returns.
  note: z.string().nullable(),
  amount: z.number(),
  payerMemberId: z.string(),
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
