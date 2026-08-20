/**
 * Payment types and response interfaces
 */

/**
 * Payment participant entity
 */
export interface PaymentParticipant {
  id: string;
  paymentId: string;
  memberId: string;
  shareAmount: number;
  name?: string;
  isPlaceholder?: boolean;
  createdAt: Date;
}

/**
 * Payment entity
 */
export interface Payment {
  id: string;
  tripId: string;
  description: string;
  amount: number;
  memberId: string;
  date: Date;
  createdBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  payerName?: string;
  payerIsPlaceholder?: boolean;
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
