import type { QueryClient } from "@tanstack/react-query";

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
export async function optimistically<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  paint: (rows: T[]) => T[],
): Promise<{ previous: T[] | undefined }> {
  await queryClient.cancelQueries({ queryKey });
  const previous = queryClient.getQueryData<T[]>(queryKey);

  queryClient.setQueryData<T[]>(queryKey, (old) => paint(old ?? []));

  return { previous };
}

/** Put the snapshot back. A no-op when there was no list to begin with. */
export function rollBack<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  context: { previous: T[] | undefined } | undefined,
): void {
  if (context?.previous !== undefined) {
    queryClient.setQueryData<T[]>(queryKey, context.previous);
  }
}
