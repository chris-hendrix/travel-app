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
import { isOffline } from "@/lib/queries/errors";
import { memberKeys } from "@/lib/queries/members";
import { invalidateTripMoney, paymentKeys } from "@/lib/queries/moneyKeys";
import { previewShares, type Payment, type SplitScope } from "@/lib/payments";
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
 *
 * `paymentKeys` and `invalidateTripMoney` are **declared** in
 * `lib/queries/moneyKeys.ts` and re-exported here, because the people
 * writes invalidate the money too and cannot import this module
 * (`moneyKeys.ts`'s module note). Every name below was already public.
 */

export { invalidateTripMoney, paymentKeys };

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
 * The create body. `amount` is integer cents.
 *
 * The split is **one of two things**: `splitScope` names a rule the server
 * resolves against the roster, and `participants` is a fixed list the
 * server stores as rows. Both or neither is a 400
 * (`shared/schemas/payment.ts` — one predicate, both directions), which is
 * why `createPayment` sends exactly one no matter what it was handed.
 */
export type CreatePaymentRequest = {
  description: string;
  amount: number;
  payerMemberId: string;
  /**
   * The rule the cost is shared by, or absent for a fixed list. Both
   * scopes resolve to the same people on the server: `all_going` is
   * everyone going plus every guest, `all_invited` is the whole roster.
   */
  splitScope?: SplitScope | undefined;
  /**
   * The people on a fixed list. The order is the form's, and it is not
   * load-bearing for the amount: a share is the trip's spread, decided by the
   * trip and not by the array (`shared/utils/split.ts:spreadShares`). Absent
   * when the request names a rule instead.
   */
  participants?: { memberId: string }[] | undefined;
  /** ISO instant, already anchored by the form. Omitted leaves the default. */
  date?: string;
  /** Omitted when empty — see `createPayment`. */
  note?: string;
};

/** Every field optional: an edit sends only what changed. */
export type UpdatePaymentRequest = Partial<CreatePaymentRequest>;

/**
 * What a create mutation carries: the body, and the member ids the form
 * resolved for it.
 *
 * The ids are **not sent**. They are here because the painted row needs
 * them: a scoped create's request has no participant list to paint from
 * (the rule is resolved server-side), and the form has already resolved
 * that same rule against the same roster for its preview (`previewShares`).
 * So it hands the ids over with the mutation and the temporary row is
 * painted from them — names off the cached roster, shares from the same
 * `previewShares` over the rows already cached, in that order.
 */
export type CreatePaymentVariables = {
  input: CreatePaymentRequest;
  splitMemberIds: string[];
};

/**
 * `POST /trips/:tripId/payments` (201 `{success: true, payment}`),
 * mapped through `toPayment`.
 *
 * The split is sent as **one field or the other**: a rule when one was
 * named (other than `custom`, which is the column's own default and means
 * "the rows are the split"), the fixed list otherwise. A list handed over
 * alongside a rule is dropped rather than sent: the rule re-resolves
 * against the roster, so the pair is a contradiction the schema refuses.
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
  const scoped =
    input.splitScope !== undefined && input.splitScope !== "custom";

  const body: CreatePaymentRequest = {
    description: input.description,
    amount: input.amount,
    payerMemberId: input.payerMemberId,
    ...(scoped ? { splitScope: input.splitScope } : null),
    ...(!scoped && input.participants !== undefined
      ? { participants: input.participants }
      : null),
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
 *
 * The split is the one place an edit differs from a create: `custom` **is**
 * named when the body sends a list. The row may currently hold a rule, and
 * the server has to be told that the new split is the rows — a bare
 * `{participants}` on a scoped row would be refused. A rule and a list
 * never travel together, the same way they do not on a create.
 */
export async function updatePayment(
  paymentId: string,
  input: UpdatePaymentRequest,
): Promise<Payment> {
  const scoped =
    input.splitScope !== undefined && input.splitScope !== "custom";

  const body: UpdatePaymentRequest = {
    ...(input.description !== undefined
      ? { description: input.description }
      : null),
    ...(input.amount !== undefined ? { amount: input.amount } : null),
    ...(input.payerMemberId !== undefined
      ? { payerMemberId: input.payerMemberId }
      : null),
    ...(input.splitScope !== undefined
      ? { splitScope: input.splitScope }
      : null),
    ...(!scoped && input.participants !== undefined
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
 * `DELETE /payments/:id` (204, so `apiFetch` resolves `undefined` and this
 * resolves void). A real delete server-side (`payment.service.ts`'s
 * `deletePayment`), so the optimistic paint below is a removal and a second
 * delete is a 404.
 */
export async function deletePayment(paymentId: string): Promise<void> {
  await apiFetch<{ success: true }>(`/payments/${paymentId}`, {
    method: "DELETE",
  });
}

/**
 * There is no restore: settle hard-deletes (`payment.service.ts`'s
 * `deletePayment`), so the app asks before it fires and there is nothing on
 * the other side to undo.
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
 *
 * The people come from `splitMemberIds`, the list carried with the
 * mutation, never from the body: a scoped create's body names a rule and
 * no people at all, and a custom one's body is the same list by a
 * different route. Either way the ids are the ones the form priced, in
 * the order it priced them, which is what makes the painted shares the
 * shares the server will record.
 */
function temporaryPayment(
  tripId: string,
  input: CreatePaymentRequest,
  splitMemberIds: string[],
  roster: Member[],
  existing: readonly Payment[],
): Payment {
  const nameOf = (memberId: string) =>
    roster.find((member) => member.id === memberId)?.name ?? "";

  // The trip's own spread, over the rows already in hand — the same call the
  // form previews with (`previewShares`), so the painted row shows the shares
  // the form showed and the server will record.
  const createdAt = new Date().toISOString();
  const shares = previewShares(existing, {
    amount: input.amount,
    participantIds: splitMemberIds,
    createdAt,
  }).map((share) => share.shareAmount);

  return {
    id: `pending-${Date.now()}`,
    tripId,
    description: input.description,
    note: input.note ? input.note : null,
    amount: input.amount,
    // The scope the request is about to record: a scoped create sends the
    // rule and the server resolves the people, so the painted row shows
    // the rule it will come back with rather than a guess at `custom`.
    splitScope: input.splitScope ?? "custom",
    payerMemberId: input.payerMemberId,
    payerName: nameOf(input.payerMemberId),
    date: input.date ?? createdAt,
    // No user id exists for a row the server has not accepted yet. The
    // empty string is deliberate: it can never equal a real
    // `viewer.userId`, so the detail's `createdBy === viewer.userId`
    // predicate cannot offer Edit on a row that is not there.
    createdBy: "",
    participants: splitMemberIds.map((memberId, index) => ({
      id: `pending-participant-${index}`,
      memberId,
      name: nameOf(memberId),
      shareAmount: shares[index] ?? 0,
    })),
    createdAt,
  };
}

/**
 * The optimistic half every money write shares: cancel whatever is in
 * flight, snapshot the list, paint, and hand the snapshot back for the
 * rollback.
 *
 * All three writes below need exactly this, and the rollback is where
 * copies would drift — a hook that forgot `cancelQueries` would let a
 * late refetch land on top of its paint, and no test here would see it.
 * So the mechanics live once and each write supplies only its own paint.
 */
async function optimistically(
  queryClient: QueryClient,
  tripId: string,
  paint: (rows: Payment[]) => Payment[],
): Promise<{ previous: Payment[] | undefined }> {
  await queryClient.cancelQueries({ queryKey: paymentKeys.list(tripId) });
  const previous = queryClient.getQueryData<Payment[]>(
    paymentKeys.list(tripId),
  );

  queryClient.setQueryData<Payment[]>(paymentKeys.list(tripId), (old) =>
    paint(old ?? []),
  );

  return { previous };
}

/** Put the snapshot back. A no-op when there was no list to begin with. */
function rollBack(
  queryClient: QueryClient,
  tripId: string,
  context: { previous: Payment[] | undefined } | undefined,
): void {
  if (context?.previous !== undefined) {
    queryClient.setQueryData<Payment[]>(
      paymentKeys.list(tripId),
      context.previous,
    );
  }
}

/**
 * The create half: a temporary row is painted into the list, swapped
 * for the server's row on success (the server assigns the real id and
 * the real shares), and removed on failure. The settle funnels through
 * `invalidateTripMoney`.
 *
 * The variables are the body **and** the ids the form resolved
 * (`CreatePaymentVariables`): the body is what goes to the server and the
 * ids are what the painted row is built from. `mutationFn` takes the body
 * alone, so the ids can never reach the wire.
 */
export function useCreatePayment(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input }: CreatePaymentVariables) =>
      createPayment(tripId, input),
    onMutate: async ({ input, splitMemberIds }: CreatePaymentVariables) => {
      // The roster names the painted row, so it is read before the paint
      // rather than leaving the row to flash blank.
      const roster =
        queryClient.getQueryData<Member[]>(memberKeys.list(tripId)) ?? [];
      // The list as it stands: the painted row's shares are the trip's spread,
      // so they need the rows it is being added to (`previewShares`).
      const existing =
        queryClient.getQueryData<Payment[]>(paymentKeys.list(tripId)) ?? [];
      const temporary = temporaryPayment(
        tripId,
        input,
        splitMemberIds,
        roster,
        existing,
      );

      const context = await optimistically(queryClient, tripId, (rows) => [
        temporary,
        ...rows,
      ]);

      return { ...context, temporaryId: temporary.id };
    },
    onSuccess: (payment: Payment, _input, context) => {
      queryClient.setQueryData<Payment[]>(paymentKeys.list(tripId), (old) =>
        (old ?? []).map((row) =>
          row.id === context?.temporaryId ? payment : row,
        ),
      );
    },
    onError: (_error: unknown, _input, context) =>
      rollBack(queryClient, tripId, context),
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
 * refetch is left to bring it. `splitScope` **is** here, and for the
 * opposite reason: it is not a guess about the split, it is the rule the
 * request named, and the row's own heading reads it (`ExpenseDetail`'s
 * block title). Without it, changing `Everyone going` to
 * `Everyone invited` and reopening the row shows the old heading until
 * the refetch lands. A `""` note becomes `null` here for the same reason
 * the server does it: that is what cleared means.
 */
function patchFrom(
  input: UpdatePaymentRequest,
  roster: Member[],
): Partial<Payment> {
  // A changed payer carries its name too, or the ledger's payer line
  // reads the previous person until the refetch lands. When the roster
  // is cold the name is left alone rather than blanked: the refetch
  // gives the same answer either way, and blanking does not.
  const payerName = roster.find(
    (member) => member.id === input.payerMemberId,
  )?.name;

  return {
    ...(input.description !== undefined
      ? { description: input.description }
      : null),
    ...(input.amount !== undefined ? { amount: input.amount } : null),
    ...(input.payerMemberId !== undefined
      ? {
          payerMemberId: input.payerMemberId,
          ...(payerName !== undefined ? { payerName } : null),
        }
      : null),
    // The rule the request named, so the row's heading follows the edit at
    // once. The people it resolves to stay the refetch's job (`participants`
    // above).
    ...(input.splitScope !== undefined
      ? { splitScope: input.splitScope }
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
      const roster =
        queryClient.getQueryData<Member[]>(memberKeys.list(tripId)) ?? [];

      return optimistically(queryClient, tripId, (rows) =>
        rows.map((row) =>
          row.id === paymentId ? { ...row, ...patchFrom(input, roster) } : row,
        ),
      );
    },
    onError: (_error: unknown, _variables, context) =>
      rollBack(queryClient, tripId, context),
    onSettled: () => {
      void invalidateTripMoney(queryClient, tripId);
    },
  });
}

/**
 * The delete half: the row leaves the list immediately, and a failure puts it
 * back.
 *
 * Deleting is for good (`payment.service.ts`'s `deletePayment`), so the
 * optimistic paint is a removal and not a mark — there is no half-deleted row
 * for a reader to trip over.
 */
export function useDeletePayment(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ paymentId }: { paymentId: string }) =>
      deletePayment(paymentId),
    onMutate: async ({ paymentId }: { paymentId: string }) =>
      optimistically(queryClient, tripId, (rows) =>
        rows.filter((row) => row.id !== paymentId),
      ),
    onError: (_error: unknown, _variables, context) =>
      rollBack(queryClient, tripId, context),
    onSettled: () => {
      void invalidateTripMoney(queryClient, tripId);
    },
  });
}
