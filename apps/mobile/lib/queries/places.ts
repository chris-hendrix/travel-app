/**
 * Google Places autocomplete + details for the mobile place pickers.
 *
 * The proxy endpoints live at `GET /locations/autocomplete` and
 * `GET /locations/details` (`apps/api/src/routes/location.routes.ts`,
 * registered under the `/api/locations` prefix in `app.ts`). Both 200s
 * are bare (no `{success}` envelope): autocomplete returns an array of
 * `{placeId, shortName, displayName, displayAddress}`, details returns
 * one `{placeId, shortName, displayName, displayPlace, displayAddress,
 * lat, lon}`. A missing key degrades, not errors: autocomplete answers
 * `[]`, details answers 503 — so the pickers treat "no live results"
 * as "fall back to the static list", never as a submit blocker.
 *
 * Session tokens are Google's billing rule, not ours: one token per
 * input session, sent with every keystroke's autocomplete request AND
 * the follow-up details call. The token rotates after a selection
 * settles (or is abandoned for a static/free-text pick), so the next
 * input session starts fresh.
 *
 * CI carries no `GOOGLE_MAPS_API_KEY`, so the specs below stub at the
 * `@/lib/api` boundary and must never depend on live Places.
 *
 * Node-importable by design: `react` and TanStack Query only, never
 * `react-native` (the `api.ts` precedent).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/** Minimum trimmed input before autocomplete fires. */
export const SUGGESTION_MIN_CHARS = 2;

/** Trailing-edge debounce for keystroke → network. */
export const SUGGESTION_DEBOUNCE_MS = 250;

/** One autocomplete row, mapped off the proxy's bare 200 array. */
export type PlaceSuggestion = {
  placeId: string;
  /** Full display name — what the picker commits to the field. */
  name: string;
  shortName: string;
  address: string;
};

/** One details row: the canonical name plus coordinates. */
export type PlaceDetails = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
};

/** Dropdown-row shape without importing the Dropdown component. */
export type PlaceOption = { value: string; label: string };

type AutocompleteRow = {
  placeId: string;
  shortName: string;
  displayName: string;
  displayAddress: string;
};

type DetailsRow = {
  placeId: string;
  shortName: string;
  displayName: string;
  displayPlace: string;
  displayAddress: string;
  lat: number;
  lon: number;
};

/**
 * Trailing-edge debounce as a framework-free unit: rapid `push`es
 * collapse into one `onSettled(lastValue)` after `delayMs` of quiet.
 * `useDebouncedValue` (below) is built on this, so the debounce the
 * specs assert is the debounce the hooks ship — not a copy of it.
 */
export function createTrailingDebounce<T>(
  delayMs: number,
  onSettled: (value: T) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    push(value: T) {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        onSettled(value);
      }, delayMs);
    },
    cancel() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}

/** The debounced twin of a fast-moving input value. */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number = SUGGESTION_DEBOUNCE_MS,
): T {
  const [current, setCurrent] = useState(value);
  const settle = useMemo(
    () => createTrailingDebounce<T>(delayMs, setCurrent),
    [delayMs],
  );
  useEffect(() => {
    if (Object.is(value, current)) return;
    settle.push(value);
    return () => settle.cancel();
  }, [value, current, settle]);
  return current;
}

/**
 * Whether this input may hit the network. Short/blank input sends
 * nothing — the picker shows its static list instead.
 */
export function shouldFetchSuggestions(input: string): boolean {
  return input.trim().length >= SUGGESTION_MIN_CHARS;
}

/**
 * `GET /locations/autocomplete?q=<input>&sessionToken=<token>`, mapped
 * to picker rows. Throws `ApiError` on 503 (key not configured,
 * upstream failure) — callers treat that as "no live results".
 */
export async function fetchPlaceSuggestions(
  input: string,
  sessionToken: string,
): Promise<PlaceSuggestion[]> {
  const rows = await apiFetch<AutocompleteRow[]>(
    `/locations/autocomplete?q=${encodeURIComponent(input.trim())}` +
      `&sessionToken=${encodeURIComponent(sessionToken)}`,
  );
  return rows.map((row) => ({
    placeId: row.placeId,
    name: row.displayName,
    shortName: row.shortName,
    address: row.displayAddress,
  }));
}

/**
 * `GET /locations/details?placeId=<id>&sessionToken=<token>` with the
 * SAME token the autocomplete keystrokes used — that pairing is what
 * makes the keystrokes + details one billable session.
 */
export async function fetchPlaceDetails(
  placeId: string,
  sessionToken: string,
): Promise<PlaceDetails> {
  const row = await apiFetch<DetailsRow>(
    `/locations/details?placeId=${encodeURIComponent(placeId)}` +
      `&sessionToken=${encodeURIComponent(sessionToken)}`,
  );
  return {
    placeId: row.placeId,
    name: row.displayName,
    address: row.displayAddress || row.displayPlace,
    lat: row.lat,
    lon: row.lon,
  };
}

/**
 * Suggestions query. The key carries the trimmed input but NOT the
 * session token, so rotating the token after a selection never
 * refires the last query. `retry: false`: a 503/offline answers with
 * the static fallback, not a spinner and not a retry storm.
 */
export const placeSuggestionsOptions = (input: string, sessionToken: string) =>
  queryOptions({
    queryKey: ["places", "suggestions", input.trim()] as const,
    enabled: shouldFetchSuggestions(input) && sessionToken.trim() !== "",
    queryFn: () => fetchPlaceSuggestions(input, sessionToken),
    retry: false,
  });

/** Details query, enabled only once a live suggestion is selected. */
export const placeDetailsOptions = (
  placeId: string | null,
  sessionToken: string,
) =>
  queryOptions({
    queryKey: ["places", "details", placeId ?? ""] as const,
    enabled:
      placeId != null &&
      placeId.trim() !== "" &&
      sessionToken.trim() !== "",
    queryFn: () => fetchPlaceDetails(placeId as string, sessionToken),
    retry: false,
  });

/**
 * Live suggestions for the picker's current search text. Debounces
 * keystrokes (~250ms trailing) before the query sees them; empty or
 * short input disables the query so nothing is sent.
 */
export function usePlaceSuggestions(input: string, sessionToken: string) {
  const debounced = useDebouncedValue(input);
  return useQuery(placeSuggestionsOptions(debounced, sessionToken));
}

/** Canonical details for a selected suggestion. Disabled until picked. */
export function usePlaceDetails(
  placeId: string | null,
  sessionToken: string,
) {
  return useQuery(placeDetailsOptions(placeId, sessionToken));
}

const HEX = "0123456789abcdef";

function randomHex(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += HEX[Math.floor(Math.random() * 16)];
  }
  return out;
}

/**
 * A UUID-shaped session token. The codebase has no `randomUUID` use to
 * copy (and no uuid dependency to add), so: `crypto.randomUUID()` when
 * the runtime offers it (Expo Hermes and web both do), else a
 * `Math.random`-built v4-shaped token. Either is fine — the token is
 * only Google's session-dedup key, never auth.
 */
export function createPlaceSessionToken(): string {
  const cryptoRef = (globalThis as {
    crypto?: { randomUUID?: () => string };
  }).crypto;
  if (cryptoRef?.randomUUID) {
    try {
      return cryptoRef.randomUUID();
    } catch {
      // Fall through to the Math.random token below.
    }
  }
  const variant = "89ab"[Math.floor(Math.random() * 4)];
  return (
    `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}` +
    `-${variant}${randomHex(3)}-${randomHex(12)}`
  );
}

/**
 * One input session's token plus its rotation. Mount mints the first;
 * callers rotate after a selection settles (details landed or failed)
 * or is abandoned for a static/free-text pick.
 */
export function usePlaceSessionToken(): readonly [string, () => void] {
  const [token, setToken] = useState(createPlaceSessionToken);
  const rotate = useCallback(
    () => setToken(createPlaceSessionToken()),
    [],
  );
  return [token, rotate] as const;
}

/** A suggestion as a Dropdown row: the placeId commits, the name reads. */
export function toPlaceOption(suggestion: PlaceSuggestion): PlaceOption {
  return { value: suggestion.placeId, label: suggestion.name };
}
