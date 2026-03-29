/**
 * Balance types and response interfaces
 */

/**
 * A person involved in a balance (user or guest)
 */
export interface BalancePerson {
  id: string;
  name: string;
  isGuest: boolean;
}

/**
 * A single simplified debt between two people
 */
export interface BalanceEntry {
  from: BalancePerson;
  to: BalancePerson;
  amount: number;
}

/**
 * A detail entry for the current user's balance
 */
export interface MyBalanceDetail {
  person: BalancePerson;
  amount: number;
}

/**
 * GET /api/trips/:tripId/balances
 */
export interface GetBalancesResponse {
  success: true;
  balances: BalanceEntry[];
}

/**
 * GET /api/trips/:tripId/balances/me
 */
export interface GetMyBalanceResponse {
  success: true;
  netBalance: number;
  details: MyBalanceDetail[];
}
