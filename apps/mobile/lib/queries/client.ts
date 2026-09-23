import { QueryClient } from "@tanstack/react-query";

/**
 * One fresh QueryClient per call, with the app-wide query defaults:
 * a single retry and a 30s stale window. Call it once per provider
 * mount (e.g. `useState(() => makeQueryClient())`), never shared
 * across mounts.
 *
 * Node-importable by design: no react-native imports here, so unit
 * tests run in plain node with no renderer. Keep it that way.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
      },
    },
  });
}
