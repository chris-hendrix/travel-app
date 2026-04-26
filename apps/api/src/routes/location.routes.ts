import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "@/middleware/auth.middleware.js";
import { defaultRateLimitConfig } from "@/middleware/rate-limit.middleware.js";

const autocompleteQuerySchema = z.object({
  q: z.string().min(1).max(200),
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
});

const locationSuggestionSchema = z.object({
  placeId: z.string(),
  shortName: z.string(),
  displayName: z.string(),
  displayPlace: z.string(),
  displayAddress: z.string(),
  lat: z.number(),
  lon: z.number(),
});

const autocompleteResponseSchema = z.array(locationSuggestionSchema);

type FoursquareText = {
  primary: string;
  secondary: string;
  highlight: Array<{ start: number; length: number }>;
};

type FoursquareLocation = {
  address: string;
  locality: string;
  region: string;
  postcode: string;
  country: string;
  formatted_address: string;
};

type FoursquarePlace = {
  fsq_place_id: string;
  latitude: number;
  longitude: number;
  categories: Array<{
    fsq_category_id: string;
    name: string;
    short_name: string;
    plural_name: string;
    icon: { prefix: string; suffix: string };
  }>;
  distance: number;
  location: FoursquareLocation;
  name: string;
};

type FoursquareGeo = {
  name: string;
  center: { latitude: number; longitude: number };
  bounds: {
    ne: { latitude: number; longitude: number };
    sw: { latitude: number; longitude: number };
  };
  cc: string;
  type: string;
};

type FoursquareResult = {
  type: "search" | "place" | "geo";
  text: FoursquareText;
  link: string;
  place?: FoursquarePlace;
  search?: { query: string };
  geo?: FoursquareGeo;
};

type FoursquareAutocompleteResponse = {
  results: FoursquareResult[];
};

function buildShortName(text: FoursquareText): string {
  const primary = text.primary;
  const secondary = text.secondary;
  const parts = secondary.split(",").map((p) => p.trim());
  const lastPart = parts[parts.length - 1];
  return lastPart && lastPart !== primary ? `${primary}, ${lastPart}` : primary;
}

export async function locationRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: z.infer<typeof autocompleteQuerySchema> }>(
    "/autocomplete",
    {
      schema: {
        querystring: autocompleteQuerySchema,
        response: { 200: autocompleteResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    async (request, reply) => {
      const { q, lat, lon } = request.query;
      const key = request.server.config.FOURSQUARE_API_KEY;

      if (!key) {
        throw new Error("FOURSQUARE_API_KEY is not configured");
      }

      try {
        const params = new URLSearchParams({
          query: q,
          limit: "10",
        });

        if (lat != null && lon != null) {
          params.set("ll", `${lat},${lon}`);
          params.set("radius", "50000");
        }

        const url = `https://places-api.foursquare.com/autocomplete?${params}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${key}`,
            "X-Places-Api-Version": "2025-06-17",
            Accept: "application/json",
          },
        });

        clearTimeout(timeout);
        if (!response.ok) return reply.send([]);

        const data = (await response.json()) as FoursquareAutocompleteResponse;

        return data.results
          .filter((r) => (r.type === "place" && r.place) || r.type === "geo")
          .map((r) => {
            if (r.type === "place" && r.place) {
              const place = r.place;
              return {
                placeId: place.fsq_place_id,
                shortName: buildShortName(r.text),
                displayName: place.name,
                displayPlace: place.location.locality || place.name,
                displayAddress: place.location.formatted_address || r.text.secondary,
                lat: place.latitude,
                lon: place.longitude,
              };
            } else if (r.type === "geo" && r.geo) {
              const geo = r.geo;
              return {
                placeId: geo.name,
                shortName: r.text.primary,
                displayName: geo.name,
                displayPlace: geo.name,
                displayAddress: r.text.secondary,
                lat: geo.center.latitude,
                lon: geo.center.longitude,
              };
            }
            return null;
          })
          .filter(Boolean);
      } catch {
        return reply.send([]);
      }
    },
  );
}