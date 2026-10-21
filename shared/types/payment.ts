/**
 * Payment types and response interfaces
 */

import type { SplitScope } from "../utils/split";

/**
 * Payment participant entity
 *
 * `id`, `paymentId` and `createdAt` are absent on a participant the API
 * resolved from a split scope: a scope stores no participant rows, so the
 * person is a fact about the roster, not a record of its own.
 */
export interface PaymentParticipant {
  id?: string;
  paymentId?: string;
  memberId: string;
  shareAmount: number;
  name?: string;
  createdAt?: Date;
}

/**
 * Payment entity
 */
export interface Payment {
  id: string;
  tripId: string;
  description: string;
  /** How it was paid ("Venmo") — separate from what it was. Null when unset. */
  note: string | null;
  amount: number;
  payerMemberId: string;
  /**
   * How the cost is shared: a fixed list (`custom`) or a rule re-resolved
   * against the roster on every read.
   */
  splitScope: SplitScope;
  date: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  payerName?: string;
  participants: PaymentParticipant[];
}

/**
 * API response for fetching multiple payments
 */
export interface GetPaymentsResponse {
  success: true;
  payments: Payment[];
}

/**
 * API response for fetching/creating/updating a single payment
 */
export interface PaymentResponse {
  success: true;
  payment: Payment;
}
