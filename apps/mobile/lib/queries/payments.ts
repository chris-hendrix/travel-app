import {
  mutationOptions,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toPayment } from "@/lib/mapping";
import { balanceKeys } from "@/lib/queries/balances";
import { isOffline } from "@/lib/queries/errors";
import { memberKeys } from "@/lib/queries/members";
import type { Payment } from "@/lib/payments";
import { splitPreview } from "@/lib/payments";
import type { Member } from "@/lib/members";
import type { Payment as ApiPayment } from "@journiful/shared/types";

/**
 * The money writes.
 *
 * No `*Store.tsx`, for the same reason the people have none
 * (`lib/queries/members.ts`'s module note): payments hold no client
 * state a provider must own. They are server truth read through
 * TanStack Query, so plain writers plus mutation hooks are the whole
 * surface.
 *
 * Every write settles through `invalidateTripMoney` — a payment moves
 * the ledger *and* both balance reads, so a write that invalidated only
 * its own list would leave the position headline and the debt rows
 * showing the old arithmetic.
 */

/** Key factory for the payments domain: `all` / `list(tripId)`. */
export const paymentKeys = {
  all: ["payments"] as const,
  list: (tripId: string) => [...paymentKeys.all, "list", tripId] as const,
};

/**
 * The trip's expenses: `GET /trips/:tripId/payments`
 * (`apps/api/src/routes/payment.routes.ts:57`, response
 * `paymentListResponseSchema`).
 *
 * Rows map through `toPayment`. **The server supplies no order**
 * (`getPaymentsByTrip` has no `ORDER BY`), so nothing here may depend on
 * the array as it arrives — the reader's order comes from
 * `paymentsInOrder` at the screen. Soft-deleted rows are not requested
 * (`includeDeleted` stays off; there is no Deleted-items view).
 */
export const paymentsOptions = (tripId: string) =>
  queryOptions({
    queryKey: paymentKeys.list(tripId),
    queryFn: async (): Promise<Payment[]> =>
      (
        await apiFetch<{ success: true; payments: ApiPayment[] }>(
          `/trips/${tripId}/payments`,
        )
      ).payments.map(toPayment),
  });

export type PaymentsStatus = "loading" | "error" | "offline" | "success";

/** The trip's expenses, in the section-hook shape (`lib/queries/stays.ts`). */
export function usePayments(tripId: string | undefined): {
  payments: Payment[];
  status: PaymentsStatus;
  retry: () => void;
} {
  const enabled = typeof tripId === "string" && tripId.length > 0;
  const query = useQuery({
    ...paymentsOptions(tripId ?? ""),
    enabled,
  });
  const status: PaymentsStatus =
    !enabled || query.isPending
      ? "loading"
      : query.isError
        ? isOffline(query.error)
          ? "offline"
          : "error"
        : "success";
  return {
    payments: query.data ?? [],
    status,
    retry: () => {
      void query.refetch();
    },
  };
}

/**
 * One invalidation for a change in the money domain: the expense list,
 * the trip's simplified moves and the reader's own position all move
 * together, so every money write settles through this single call
 * rather than invalidating its own key alone. The people's twin is
 * `invalidateTripPeople` (`lib/queries/members.ts:99`).
 */
export async function invalidateTripMoney(
  queryClient: QueryClient,
  tripId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: paymentKeys.list(tripId) }),
    queryClient.invalidateQueries({ queryKey: balanceKeys.trip(tripId) }),
    queryClient.invalidateQueries({ queryKey: balanceKeys.me(tripId) }),
  ]);
}

/**
 * The create body. `amount` is integer cents; `participants` is the
 * picker's order, and that order is load-bearing — the server gives the
 * remainder cent to the first participant in the array it is sent, so
 * the shares the form previewed (`splitPreview`) are the shares it
 * records only if this array is sent in the same order.
 */
export type CreatePaymentRequest = {
  description: string;
  amount: number;
  payerMemberId: string;
  participants: { memberId: string }[];
  /** ISO instant, already anchored by the form. Omitted leaves the default. */
  date?: string;
  /** Omitted when empty — see `createPayment`. */
  note?: string;
};

/** Every field optional: an edit sends only what changed. */
export type UpdatePaymentRequest = Partial<CreatePaymentRequest>;

/**
 * `POST /trips/:tripId/payments` (201 `{success: true, payment}`),
 * mapped through `toPayment`.
 *
 * The note is carried **only when the field is non-empty**. The server
 * turns `""` into `null` anyway, so sending it would be harmless — but
 * an absent fact and a cleared one are different things, and the client
 * only claims what it has. Clearing on an edit is a different call:
 * `updatePayment` sends `note: ""` deliberately.
 */
export async function createPayment(
  tripId: string,
  input: CreatePaymentRequest,
): Promise<Payment> {
  const body: CreatePaymentRequest = {
    description: input.description,
    amount: input.amount,
    payerMemberId: input.payerMemberId,
    participants: input.participants,
    ...(input.date !== undefined ? { date: input.date } : null),
    ...(input.note ? { note: input.note } : null),
  };

  const response = await apiFetch<{ success: true; payment: ApiPayment }>(
    `/trips/${tripId}/payments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  return toPayment(response.payment);
}

/**
 * `PUT /payments/:id` (200 `{success: true, payment}`).
 *
 * An empty note is sent as `""`, which the server stores as `null` —
 * that is how an edit clears a note. (`null` itself is a 400: the
 * update schema is the create schema `.partial()`, so `""` is the
 * clearing value, not `null`.)
 */
export async function updatePayment(
  paymentId: string,
  input: UpdatePaymentRequest,
): Promise<Payment> {
  const body: UpdatePaymentRequest = {
    ...(input.description !== undefined
      ? { description: input.description }
      : null),
    ...(input.amount !== undefined ? { amount: input.amount } : null),
    ...(input.payerMemberId !== undefined
      ? { payerMemberId: input.payerMemberId }
      : null),
    ...(input.participants !== undefined
      ? { participants: input.participants }
      : null),
    ...(input.date !== undefined ? { date: input.date } : null),
    ...(input.note !== undefined ? { note: input.note } : null),
  };

  const response = await apiFetch<{ success: true; payment: ApiPayment }>(
    `/payments/${paymentId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  return toPayment(response.payment);
}

/**
 * `DELETE /payments/:id` (204, so `apiFetch` resolves `undefined` and
 * this resolves void). Soft server-side: the row keeps its place in the
 * database and stops being returned, and the ledger filters on
 * `deletedAt` so the optimistic paint below reads as a removal.
 */
export async function deletePayment(paymentId: string): Promise<void> {
  await apiFetch<{ success: true }>(`/payments/${paymentId}`, {
    method: "DELETE",
  });
}

/**
 * `POST /payments/:id/restore` (organizer-only) is deliberately **not
 * wired**: there is no Deleted-items view and nothing asks for it (the
 * plan's "Considered and cut"), so a restore affordance would be a
 * button with nowhere to live. The route keeps its place in the API.
 */

/** Mutation wrapper for callers that fire `deletePayment` via TanStack Query. */
export const deletePaymentOptions = () =>
  mutationOptions({
    mutationKey: ["payments", "delete"],
    mutationFn: ({ paymentId }: { paymentId: string }) =>
      deletePayment(paymentId),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { deletePaymentOptions as deletePaymentMutation };

/**
 * The row painted into the list while the server is still writing.
 *
 * The form knows ids, not names, so the names are read from the roster
 * that the trip screen has already cached (`memberKeys.list`) — without
 * that, the row would flash blank and then fill in, which reads worse
 * than the half-second it saves.
 */
function temporaryPayment(
  tripId: string,
  input: CreatePaymentRequest,
  roster: Member[],
): Payment {
  const nameOf = (memberId: string) =>
    roster.find((member) => member.id === memberId)?.name ?? "";

  // The server's own remainder rule, so the painted row shows the shares
  // the form previewed rather than a guess that shifts under the reader.
  const shares = splitPreview(
    input.amount,
    input.participants.map((participant) => participant.memberId),
  );

  return {
    id: `pending-${Date.now()}`,
    tripId,
    description: input.description,
    note: input.note ? input.note : null,
    amount: input.amount,
    payerMemberId: input.payerMemberId,
    payerName: nameOf(input.payerMemberId),
    date: input.date ?? new Date().toISOString(),
    createdBy: "",
    participants: input.participants.map((participant, index) => ({
      id: `pending-participant-${index}`,
      memberId: participant.memberId,
      name: nameOf(participant.memberId),
      shareAmount: shares[index] ?? 0,
    })),
    createdAt: new Date().toISOString(),
    deletedAt: null,
  };
}

/**
 * The create half: a temporary row is painted into the list, swapped
 * for the server's row on success (the server assigns the real id and
 * the real shares), and removed on failure. The settle funnels through
 * `invalidateTripMoney`.
 */
export function useCreatePayment(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePaymentRequest) => createPayment(tripId, input),
    onMutate: async (input: CreatePaymentRequest) => {
      await queryClient.cancelQueries({ queryKey: paymentKeys.list(tripId) });
      const previous = queryClient.getQueryData<Payment[]>(
        paymentKeys.list(tripId),
      );
      const roster =
        queryClient.getQueryData<Member[]>(memberKeys.list(tripId)) ?? [];
      const temporary = temporaryPayment(tripId, input, roster);

      queryClient.setQueryData<Payment[]>(paymentKeys.list(tripId), (old) => [
        temporary,
        ...(old ?? []),
      ]);

      return { previous, temporaryId: temporary.id };
    },
    onSuccess: (payment: Payment, _input, context) => {
      queryClient.setQueryData<Payment[]>(paymentKeys.list(tripId), (old) =>
        (old ?? []).map((row) =>
          row.id === context?.temporaryId ? payment : row,
        ),
      );
    },
    onError: (
      _error: unknown,
      _input,
      context: { previous: Payment[] | undefined } | undefined,
    ) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<Payment[]>(
          paymentKeys.list(tripId),
          context.previous,
        );
      }
    },
    onSettled: () => {
      void invalidateTripMoney(queryClient, tripId);
    },
  });
}

/**
 * The fields an edit may repaint optimistically.
 *
 * `participants` is deliberately absent: the request carries only
 * `{memberId}` and the row needs each person's name and *share*, which
 * only the server can compute. Painting a guess there would show a
 * split that is about to change under the reader, so the invalidation
 * refetch is left to bring it. A `""` note becomes `null` here for the
 * same reason the server does it: that is what cleared means.
 */
function patchFrom(input: UpdatePaymentRequest): Partial<Payment> {
  return {
    ...(input.description !== undefined
      ? { description: input.description }
      : null),
    ...(input.amount !== undefined ? { amount: input.amount } : null),
    ...(input.payerMemberId !== undefined
      ? { payerMemberId: input.payerMemberId }
      : null),
    ...(input.date !== undefined ? { date: input.date } : null),
    ...(input.note !== undefined
      ? { note: input.note.trim() === "" ? null : input.note }
      : null),
  };
}

/**
 * The edit half: the row is patched in place, and a failure restores the
 * list it replaced — the snapshot is taken and replayed for this trip's
 * key only, so a concurrent change to another key is never reverted.
 */
export function useUpdatePayment(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      paymentId,
      input,
    }: {
      paymentId: string;
      input: UpdatePaymentRequest;
    }) => updatePayment(paymentId, input),
    onMutate: async ({
      paymentId,
      input,
    }: {
      paymentId: string;
      input: UpdatePaymentRequest;
    }) => {
      await queryClient.cancelQueries({ queryKey: paymentKeys.list(tripId) });
      const previous = queryClient.getQueryData<Payment[]>(
        paymentKeys.list(tripId),
      );

      queryClient.setQueryData<Payment[]>(paymentKeys.list(tripId), (old) =>
        (old ?? []).map((row) =>
          row.id === paymentId ? { ...row, ...patchFrom(input) } : row,
        ),
      );

      return { previous };
    },
    onError: (
      _error: unknown,
      _variables,
      context: { previous: Payment[] | undefined } | undefined,
    ) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<Payment[]>(
          paymentKeys.list(tripId),
          context.previous,
        );
      }
    },
    onSettled: () => {
      void invalidateTripMoney(queryClient, tripId);
    },
  });
}

/**
 * The delete half: the row is painted with a `deletedAt` so the ledger
 * (which filters on it) drops it immediately, and a failure restores the
 * list.
 */
export function useDeletePayment(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ paymentId }: { paymentId: string }) =>
      deletePayment(paymentId),
    onMutate: async ({ paymentId }: { paymentId: string }) => {
      await queryClient.cancelQueries({ queryKey: paymentKeys.list(tripId) });
      const previous = queryClient.getQueryData<Payment[]>(
        paymentKeys.list(tripId),
      );

      queryClient.setQueryData<Payment[]>(paymentKeys.list(tripId), (old) =>
        (old ?? []).map((row) =>
          row.id === paymentId
            ? { ...row, deletedAt: new Date().toISOString() }
            : row,
        ),
      );

      return { previous };
    },
    onError: (
      _error: unknown,
      _variables,
      context: { previous: Payment[] | undefined } | undefined,
    ) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<Payment[]>(
          paymentKeys.list(tripId),
          context.previous,
        );
      }
    },
    onSettled: () => {
      void invalidateTripMoney(queryClient, tripId);
    },
  });
}
