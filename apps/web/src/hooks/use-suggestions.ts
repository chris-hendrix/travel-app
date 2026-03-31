"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, APIError } from "@/lib/api";
import type { SuggestionCard } from "@journiful/shared/types";
import type { DismissSuggestionInput } from "@journiful/shared/schemas";

import { suggestionKeys, suggestionsQueryOptions } from "./suggestion-queries";

export { suggestionKeys, suggestionsQueryOptions };

/**
 * Hook for fetching suggestions for a trip
 */
export function useSuggestions(tripId: string) {
  return useQuery({
    ...suggestionsQueryOptions(tripId),
    enabled: !!tripId,
  });
}

interface DismissContext {
  previousSuggestions: SuggestionCard[] | undefined;
}

/**
 * Hook for dismissing a suggestion with optimistic removal
 */
export function useDismissSuggestion(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    APIError,
    DismissSuggestionInput,
    DismissContext
  >({
    mutationFn: async (input) => {
      await apiRequest(`/trips/${tripId}/suggestions/dismiss`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: suggestionKeys.list(tripId),
      });

      const previousSuggestions = queryClient.getQueryData<SuggestionCard[]>(
        suggestionKeys.list(tripId),
      );

      if (previousSuggestions) {
        queryClient.setQueryData<SuggestionCard[]>(
          suggestionKeys.list(tripId),
          previousSuggestions.filter(
            (s) =>
              !(
                s.gapType === input.suggestionType &&
                s.dismissKey === input.suggestionKey
              ),
          ),
        );
      }

      return { previousSuggestions };
    },

    onError: (_error, _input, context) => {
      if (context?.previousSuggestions) {
        queryClient.setQueryData(
          suggestionKeys.list(tripId),
          context.previousSuggestions,
        );
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: suggestionKeys.list(tripId),
      });
    },
  });
}
