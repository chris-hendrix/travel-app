import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "@/middleware/auth.middleware.js";
import { defaultRateLimitConfig } from "@/middleware/rate-limit.middleware.js";

const autocompleteQuerySchema = z.object({
  q: z.string().min(1).max(200),
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  sessionToken: z.string().uuid(),
});

const autocompleteSuggestionSchema = z.object({
  placeId: z.string(),
  shortName: z.string(),
  displayName: z.string(),
  displayAddress: z.string(),
});
const autocompleteResponseSchema = z.array(autocompleteSuggestionSchema);

const locationSuggestionSchema = z.object({
  placeId: z.string(),
  shortName: z.string(),
  displayName: z.string(),
  displayPlace: z.string(),
  displayAddress: z.string(),
  lat: z.number(),
  lon: z.number(),
});

const detailsQuerySchema = z.object({
  placeId: z.string().min(1),
  sessionToken: z.string().uuid(),
});

const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1";

type GoogleAutocompletePlacePrediction = {
  placeId: string;
  text: { text: string };
  structuredFormat?: {
    mainText?: { text: string };
    secondaryText?: { text: string };
  };
};

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction: GoogleAutocompletePlacePrediction;
  }>;
};

type GooglePlaceDetailsResponse = {
  id: string;
  displayName: { text: string; languageCode: string };
  formattedAddress: string;
  location: { latitude: number; longitude: number };
};

export async function locationRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: z.infer<typeof autocompleteQuerySchema> }>(
    "/autocomplete",
    {
      schema: {
        querystring: autocompleteQuerySchema,
        response: {
          200: autocompleteResponseSchema,
          503: z.object({ success: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
        },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    async (request, reply) => {
      const { q, lat, lon, sessionToken } = request.query;
      const key = request.server.config.GOOGLE_MAPS_API_KEY;

      if (!key) {
        return reply.send([]);
      }

      try {
        const body: Record<string, unknown> = {
          input: q,
          sessionToken,
        };

        if (lat != null && lon != null) {
          body.locationBias = {
            circle: {
              center: { latitude: lat, longitude: lon },
              radius: 50000,
            },
          };
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`${GOOGLE_PLACES_BASE}/places:autocomplete`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
          },
          body: JSON.stringify(body),
        });

        clearTimeout(timeout);
        if (!response.ok) {
          return reply.status(503).send({
            success: false,
            error: { code: "SERVICE_UNAVAILABLE", message: "Google Places Autocomplete returned an error" },
          });
        }

        const data = (await response.json()) as GoogleAutocompleteResponse;

        const seen = new Set<string>();
        return (data.suggestions ?? [])
          .map((s) => s.placePrediction)
          .filter((p) => {
            if (seen.has(p.placeId)) return false;
            seen.add(p.placeId);
            return true;
          })
          .map((p) => ({
            placeId: p.placeId,
            shortName: p.structuredFormat?.mainText?.text ?? p.text.text,
            displayName: p.text.text,
            displayAddress:
              p.structuredFormat?.secondaryText?.text ?? "",
          }));
      } catch {
        return reply.status(503).send({
          success: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "Google Places Autocomplete request failed" },
        });
      }
    },
  );

  fastify.get<{ Querystring: z.infer<typeof detailsQuerySchema> }>(
    "/details",
    {
      schema: {
        querystring: detailsQuerySchema,
        response: { 200: locationSuggestionSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    async (request, reply) => {
      const { placeId, sessionToken } = request.query;
      const key = request.server.config.GOOGLE_MAPS_API_KEY;

      if (!key) {
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Google API key is not configured",
          },
        });
      }

      try {
        const url = new URL(`${GOOGLE_PLACES_BASE}/places/${encodeURIComponent(placeId)}`);
        url.searchParams.set("sessionToken", sessionToken);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: {
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "id,displayName,formattedAddress,location,types,attributions",
          },
        });

        clearTimeout(timeout);
        if (!response.ok) {
          return reply.status(503).send({
            success: false,
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Google Places API returned an error",
            },
          });
        }

        const data = (await response.json()) as GooglePlaceDetailsResponse;

        return {
          placeId: data.id,
          shortName: data.displayName.text,
          displayName: data.displayName.text,
          displayPlace: data.formattedAddress,
          displayAddress: data.formattedAddress,
          lat: data.location.latitude,
          lon: data.location.longitude,
        };
      } catch {
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Google Places API request failed",
          },
        });
      }
    },
  );
}
