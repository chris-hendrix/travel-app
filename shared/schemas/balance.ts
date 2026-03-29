// Balance validation schemas for the Journiful platform

import { z } from "zod";

/** A person involved in a balance (user or guest) */
const balancePersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  isGuest: z.boolean(),
});

/** A single simplified debt between two people */
const balanceEntrySchema = z.object({
  from: balancePersonSchema,
  to: balancePersonSchema,
  amount: z.number(),
});

/** GET /api/trips/:tripId/balances - Simplified balances for the trip */
export const balanceResponseSchema = z.object({
  success: z.literal(true),
  balances: z.array(balanceEntrySchema),
});

/** A detail entry for the current user's balance */
const myBalanceDetailSchema = z.object({
  person: balancePersonSchema,
  amount: z.number(), // positive = user owes this person, negative = this person owes user
});

/** GET /api/trips/:tripId/balances/me - Current user's net balance */
export const myBalanceResponseSchema = z.object({
  success: z.literal(true),
  netBalance: z.number(), // positive = owed money, negative = owes money
  details: z.array(myBalanceDetailSchema),
});

// Inferred TypeScript types from schemas
export type BalanceResponse = z.infer<typeof balanceResponseSchema>;
export type MyBalanceResponse = z.infer<typeof myBalanceResponseSchema>;
