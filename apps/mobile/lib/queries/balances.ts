import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toBalance } from "@/lib/mapping";
import { isOffline } from "@/lib/queries/errors";
import { balanceKeys } from "@/lib/queries/moneyKeys";
import type { BalanceMove, MyBalance } from "@/lib/payments";
import type {
  GetBalancesResponse,
  GetMyBalanceResponse,
} from "@journiful/shared/types";

/**
 * The money reads, and nothing else.
 *
 * No `*Store.tsx`: the same call the people made (`lib/queries/members.ts`'s
 * module note) applies here — a store provider is for a domain that holds
 * client state a provider must own, and balances hold none. The ledger is
 * server truth read through TanStack Query, so plain `queryOptions` plus
 * the two section hooks are the whole surface.
 *
 * Both reads are gated server-side on trip membership (Phase 1 Task 3), so
 * a non-member gets a 403 `ApiError` rather than an empty ledger.
 */

/**
 * Key factory for the money domain: `all` / `trip(tripId)` / `me(tripId)`.
 *
 * Declared in `lib/queries/moneyKeys.ts` and re-exported here, alongside
 * the expenses' keys, so a roster write can mark both stale without
 * importing this module (`moneyKeys.ts`'s module note).
 */
export { balanceKeys };

/**
 * The trip's simplified moves: `GET /trips/:tripId/balances`
 * (`apps/api/src/routes/balance.routes.ts:29`, response
 * `balanceResponseSchema`).
 *
 * Rows map through `toBalance`, which is where the server's
 * `{from: {id, name}, to: {id, name}, amount}` becomes the mobile
 * `BalanceMove`. The server already simplified the debts
 * (`BalanceService.simplifyDebts`) and supplies no order of its own, so
 * nothing here depends on the array as it arrives.
 */
export const balancesOptions = (tripId: string) =>
  queryOptions({
    queryKey: balanceKeys.trip(tripId),
    queryFn: async (): Promise<BalanceMove[]> =>
      (
        await apiFetch<GetBalancesResponse>(`/trips/${tripId}/balances`)
      ).balances.map(toBalance),
  });

/**
 * The reader's own position: `GET /trips/:tripId/balances/me`
 * (`apps/api/src/routes/balance.routes.ts:46`, response
 * `myBalanceResponseSchema`).
 *
 * `details` pass through as they arrive — they are already the reader's
 * side of each move, so there is nothing to map.
 */
export const myBalanceOptions = (tripId: string) =>
  queryOptions({
    queryKey: balanceKeys.me(tripId),
    queryFn: async (): Promise<MyBalance> => {
      const response = await apiFetch<GetMyBalanceResponse>(
        `/trips/${tripId}/balances/me`,
      );
      return { netBalance: response.netBalance, details: response.details };
    },
  });

export type BalancesStatus = "loading" | "error" | "offline" | "success";

/** The trip's moves, in the section-hook shape (`lib/queries/stays.ts`). */
export function useBalances(tripId: string | undefined): {
  balances: BalanceMove[];
  status: BalancesStatus;
  retry: () => void;
} {
  const enabled = typeof tripId === "string" && tripId.length > 0;
  const query = useQuery({
    ...balancesOptions(tripId ?? ""),
    enabled,
  });
  const status: BalancesStatus =
    !enabled || query.isPending
      ? "loading"
      : query.isError
        ? isOffline(query.error)
          ? "offline"
          : "error"
        : "success";
  return {
    balances: query.data ?? [],
    status,
    retry: () => {
      void query.refetch();
    },
  };
}

/**
 * The reader's own position, in the same shape. A trip that is settled
 * reports zero rather than nothing, so the headline has a number to
 * print once the query has answered.
 */
export function useMyBalance(tripId: string | undefined): {
  balance: MyBalance;
  status: BalancesStatus;
  retry: () => void;
} {
  const enabled = typeof tripId === "string" && tripId.length > 0;
  const query = useQuery({
    ...myBalanceOptions(tripId ?? ""),
    enabled,
  });
  const status: BalancesStatus =
    !enabled || query.isPending
      ? "loading"
      : query.isError
        ? isOffline(query.error)
          ? "offline"
          : "error"
        : "success";
  return {
    balance: query.data ?? { netBalance: 0, details: [] },
    status,
    retry: () => {
      void query.refetch();
    },
  };
}
