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
  displayName: z.string(),
  displayPlace: z.string(),
  displayAddress: z.string(),
  lat: z.number(),
  lon: z.number(),
});

const autocompleteResponseSchema = z.array(locationSuggestionSchema);

type LocationIQAddress = {
  name?: string;
  house_number?: string;
  road?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
};

type LocationIQResult = {
  place_id: string;
  osm_id: string;
  osm_type: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
  class: string;
  type: string;
  display_name: string;
  display_place?: string;
  display_address?: string;
  address?: LocationIQAddress;
};

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
      const key = request.server.config.LOCATIONIQ_API_KEY;

      if (!key) return reply.send([]);

      try {
        const DELTA = 1; // ~110km bounding box
        const viewbox =
          lat != null && lon != null
            ? `&viewbox=${lon + DELTA},${lat + DELTA},${lon - DELTA},${lat - DELTA}`
            : "";
        const url = `https://api.locationiq.com/v1/autocomplete?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=10&normalizecity=1&dedupe=1&accept-language=en${viewbox}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) return reply.send([]);

        const data = (await response.json()) as LocationIQResult[];
        const seen = new Set<string>();
        return data
          .filter((r) => {
            if (seen.has(r.place_id)) return false;
            seen.add(r.place_id);
            return true;
          })
          .map((r) => ({
            placeId: r.place_id,
            displayName: r.display_name,
            displayPlace: r.display_place ?? r.display_name,
            displayAddress: r.display_address ?? "",
            lat: parseFloat(r.lat),
            lon: parseFloat(r.lon),
          }));
      } catch {
        return reply.send([]);
      }
    },
  );
}
