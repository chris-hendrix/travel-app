/**
 * Specs for the Places queries. CI carries no `GOOGLE_MAPS_API_KEY`,
 * so everything stubs at the `@/lib/api` module boundary (the
 * `lib/queries/trips.ts` precedent) and asserts exact paths — never
 * live Places.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import {
  createPlaceSessionToken,
  createTrailingDebounce,
  fetchPlaceSuggestions,
  placeDetailsOptions,
  placeSuggestionsOptions,
  shouldFetchSuggestions,
  SUGGESTION_DEBOUNCE_MS,
  toPlaceOption,
} from "@/lib/queries/places";

const mockedApiFetch = vi.mocked(apiFetch);

const TOKEN = "11111111-2222-4333-8555-666666666666";

function autocompleteRows() {
  return [
    {
      placeId: "ChIJLisbon",
      shortName: "Lisbon",
      displayName: "Lisbon, Portugal",
      displayAddress: "Portugal",
      types: ["locality", "political"],
    },
    {
      placeId: "ChIJTulum",
      shortName: "Tulum",
      displayName: "Tulum, Mexico",
      displayAddress: "Quintana Roo, Mexico",
      types: ["restaurant", "food"],
    },
  ];
}

describe("placeSuggestionsOptions", () => {
  it("calls autocomplete with {q, sessionToken} and maps rows to picker suggestions", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(autocompleteRows());

    const options = placeSuggestionsOptions("Lisbon", TOKEN);
    expect(options.queryKey).toEqual(["places", "suggestions", "Lisbon"]);
    expect(options.enabled).toBe(true);

    const suggestions = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/locations/autocomplete?q=Lisbon&sessionToken=${TOKEN}`,
    );
    expect(suggestions).toEqual([
      {
        placeId: "ChIJLisbon",
        name: "Lisbon, Portugal",
        shortName: "Lisbon",
        address: "Portugal",
        types: ["locality", "political"],
      },
      {
        placeId: "ChIJTulum",
        name: "Tulum, Mexico",
        shortName: "Tulum",
        address: "Quintana Roo, Mexico",
        types: ["restaurant", "food"],
      },
    ]);
  });

  it("collapses rapid input changes into one network call for the final input", async () => {
    vi.useFakeTimers();
    try {
      mockedApiFetch.mockReset();
      mockedApiFetch.mockResolvedValue([]);

      // The shipped path: keystrokes settle through the trailing-edge
      // debouncer before the query fires (this is what
      // `useDebouncedValue` runs inside `usePlaceSuggestions`).
      const settle = createTrailingDebounce<string>(
        SUGGESTION_DEBOUNCE_MS,
        (value) => {
          if (shouldFetchSuggestions(value)) {
            const options = placeSuggestionsOptions(value, TOKEN);
            if (options.enabled) {
              void options.queryFn!({
                queryKey: options.queryKey,
              } as never);
            }
          }
        },
      );

      settle.push("Li");
      settle.push("Lis");
      settle.push("Lisb");
      settle.push("Lisbo");
      settle.push("Lisbon");
      expect(mockedApiFetch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(SUGGESTION_DEBOUNCE_MS);

      expect(mockedApiFetch).toHaveBeenCalledTimes(1);
      expect(mockedApiFetch).toHaveBeenCalledWith(
        `/locations/autocomplete?q=Lisbon&sessionToken=${TOKEN}`,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends nothing for empty or short input", () => {
    expect(placeSuggestionsOptions("", TOKEN).enabled).toBe(false);
    expect(placeSuggestionsOptions("   ", TOKEN).enabled).toBe(false);
    expect(placeSuggestionsOptions("L", TOKEN).enabled).toBe(false);
    expect(placeSuggestionsOptions("Li", TOKEN).enabled).toBe(true);
    expect(placeSuggestionsOptions("Lisbon", "").enabled).toBe(false);
    expect(shouldFetchSuggestions("")).toBe(false);
    expect(shouldFetchSuggestions("L")).toBe(false);
    expect(shouldFetchSuggestions("Li")).toBe(true);
  });

  it("includes lat/lon when the caller supplies a bias and omits both when it does not", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue([]);

    await fetchPlaceSuggestions("Lisbon", TOKEN, {
      lat: 39.6,
      lon: 2.9,
    });
    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/locations/autocomplete?q=Lisbon&sessionToken=${TOKEN}&lat=39.6&lon=2.9`,
    );

    mockedApiFetch.mockClear();
    await fetchPlaceSuggestions("Lisbon", TOKEN);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/locations/autocomplete?q=Lisbon&sessionToken=${TOKEN}`,
    );
  });

  it("folds the bias into the cache key so one trip's list is never served to another", () => {
    const a = placeSuggestionsOptions("Lisbon", TOKEN, {
      lat: 39.6,
      lon: 2.9,
    });
    const b = placeSuggestionsOptions("Lisbon", TOKEN, {
      lat: 41.3,
      lon: 2.1,
    });
    const unbiased = placeSuggestionsOptions("Lisbon", TOKEN);
    expect(a.queryKey).not.toEqual(b.queryKey);
    expect(a.queryKey).not.toEqual(unbiased.queryKey);
  });
});

describe("placeDetailsOptions", () => {
  it("calls /details with {placeId, sessionToken} and maps to address/coords", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      placeId: "ChIJLisbon",
      displayPlace: "Lisbon, Portugal",
      displayAddress: "Lisboa, Portugal",
      lat: 38.7223,
      lon: -9.1393,
    });

    const options = placeDetailsOptions("ChIJLisbon", TOKEN);
    expect(options.queryKey).toEqual([
      "places",
      "details",
      "ChIJLisbon",
    ]);
    expect(options.enabled).toBe(true);

    const details = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/locations/details?placeId=ChIJLisbon&sessionToken=${TOKEN}`,
    );
    expect(details).toEqual({
      placeId: "ChIJLisbon",
      address: "Lisboa, Portugal",
      lat: 38.7223,
      lon: -9.1393,
    });
    // The proxy no longer sends a name: no caller may read one off
    // details, or every picker label blanks.
    expect("name" in details).toBe(false);
  });

  it("stays disabled until a suggestion is selected", () => {
    expect(placeDetailsOptions(null, TOKEN).enabled).toBe(false);
    expect(placeDetailsOptions("", TOKEN).enabled).toBe(false);
    expect(placeDetailsOptions("ChIJLisbon", "").enabled).toBe(false);
    expect(placeDetailsOptions("ChIJLisbon", TOKEN).enabled).toBe(true);
  });
});

describe("createTrailingDebounce", () => {
  it("settles once with the last value after quiet", async () => {
    vi.useFakeTimers();
    try {
      const settled: string[] = [];
      const debounce = createTrailingDebounce<string>(
        SUGGESTION_DEBOUNCE_MS,
        (value) => void settled.push(value),
      );
      debounce.push("a");
      debounce.push("ab");
      debounce.push("abc");
      await vi.advanceTimersByTimeAsync(SUGGESTION_DEBOUNCE_MS - 1);
      expect(settled).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toEqual(["abc"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancel drops the pending settle", async () => {
    vi.useFakeTimers();
    try {
      const settled: string[] = [];
      const debounce = createTrailingDebounce<string>(
        SUGGESTION_DEBOUNCE_MS,
        (value) => void settled.push(value),
      );
      debounce.push("abc");
      debounce.cancel();
      await vi.advanceTimersByTimeAsync(SUGGESTION_DEBOUNCE_MS * 2);
      expect(settled).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createPlaceSessionToken", () => {
  it("mints UUID-shaped tokens that differ per session", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const first = createPlaceSessionToken();
    const second = createPlaceSessionToken();
    expect(first).toMatch(uuid);
    expect(second).toMatch(uuid);
    expect(first).not.toBe(second);
  });
});

describe("toPlaceOption", () => {
  it("commits the placeId while reading the display name", () => {
    expect(
      toPlaceOption({
        placeId: "ChIJLisbon",
        name: "Lisbon, Portugal",
        shortName: "Lisbon",
        address: "Portugal",
        types: [],
      }),
    ).toEqual({ value: "ChIJLisbon", label: "Lisbon, Portugal" });
  });
});
