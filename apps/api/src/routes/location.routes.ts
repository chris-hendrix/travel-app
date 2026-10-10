import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "@/middleware/auth.middleware.js";
import { checkBanned } from "@/middleware/account-state.middleware.js";
import { PhotoNotCachedError } from "@/services/photo-cache.service.js";
import {
  autocompletePlaces,
  fetchPlaceDetails,
  fetchPlacePhotoMedia,
  BOX_PIXELS,
  PlacesError,
} from "@/services/places.service.js";
import { placeBoxSchema } from "@journiful/shared/schemas";
import { defaultRateLimitConfig, photoProxyRateLimitConfig } from "@/middleware/rate-limit.middleware.js";

const autocompleteQuerySchema = z.object({
  q: z.string().min(1).max(200),
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  country: z.string().length(2).optional(),
  sessionToken: z.string().uuid(),
});

const autocompleteSuggestionSchema = z.object({
  placeId: z.string(),
  shortName: z.string(),
  displayName: z.string(),
  displayAddress: z.string(),
  types: z.array(z.string()).optional(),
  distanceMeters: z.number().nullable().optional(),
});
const autocompleteResponseSchema = z.array(autocompleteSuggestionSchema);

const locationSuggestionSchema = z.object({
  placeId: z.string(),
  displayPlace: z.string(),
  displayAddress: z.string(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
});

const detailsQuerySchema = z.object({
  placeId: z.string().min(1),
  sessionToken: z.string().uuid(),
});

/**
 * Both authenticated routes carry `checkBanned`, the same way
 * `discover.routes.ts` does for its own authenticated proxy.
 *
 * The extra per-request query is worth it here, and it is not really extra:
 * `authenticate` already spends one indexed SELECT (`blacklisted_tokens` by
 * `jti`) on every request carrying a `jti`, and `checkBanned` is a primary-key
 * lookup on `users` — the same order of cost, on a table the connection is
 * already touching. `/autocomplete` fires while somebody types, but the route
 * carries `defaultRateLimitConfig` — its `max` requests per minute against the
 * client IP (the key generator's `request.user` branch is dead this early; see
 * `rate-limit.middleware.ts`) — before either guard runs, so the ceiling is
 * unchanged. What the query buys
 * is that the server's Google Places key is not spent on behalf of an account
 * that no longer exists; the alternative — refusing the key later — is not
 * possible, because by then the call has been paid for.
 */
export async function locationRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: z.infer<typeof autocompleteQuerySchema> }>(
    "/autocomplete",
    {
      config: { rateLimit: defaultRateLimitConfig },
      schema: {
        querystring: autocompleteQuerySchema,
        response: {
          200: autocompleteResponseSchema,
          503: z.object({ success: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
        },
      },
      preHandler: [authenticate, checkBanned],
    },
    async (request, reply) => {
      const { q, lat, lon, country, sessionToken } = request.query;
      const key = request.server.config.GOOGLE_MAPS_API_KEY;

      if (!key) {
        // The same answer `/details` gives for the same condition, and the
        // one the mobile client's own doc already promises: 503 means the
        // live source could not be asked, so a picker can fall back to the
        // static list it ships. It used to answer `200 []`, which reads as
        // "asked, and there are none" — so a query nobody could answer was
        // indistinguishable from a query with no matches, and a form
        // answered a real search with ten invented places.
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Google API key is not configured",
          },
        });
      }

      try {
        const suggestions = await autocompletePlaces({
          input: q,
          sessionToken,
          lat,
          lon,
          country,
          apiKey: key,
        });
        return suggestions;
      } catch (err) {
        if (err instanceof PlacesError) {
          return reply.status(503).send({
            success: false,
            error: { code: "SERVICE_UNAVAILABLE", message: "Google Places Autocomplete returned an error" },
          });
        }
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
      config: { rateLimit: defaultRateLimitConfig },
      schema: {
        querystring: detailsQuerySchema,
        response: { 200: locationSuggestionSchema },
      },
      preHandler: [authenticate, checkBanned],
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
        const details = await fetchPlaceDetails({ placeId, sessionToken, apiKey: key });
        return {
          placeId: details.placeId,
          displayPlace: details.address ?? "",
          displayAddress: details.address ?? "",
          lat: details.lat ?? null,
          lon: details.lon ?? null,
        };
      } catch (err) {
        if (err instanceof PlacesError) {
          return reply.status(503).send({
            success: false,
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Google Places API returned an error",
            },
          });
        }
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

  fastify.get<{ Params: { photoRef: string }; Querystring: { size?: string } }>(
    "/photos/:photoRef",
    {
      config: { rateLimit: photoProxyRateLimitConfig },
    },
    async (request, reply) => {
      const { photoRef } = request.params;

      // Validate photo ref format: places/{placeId}/photos/{photoRef}
      if (!/^places\/[^/]+\/photos\/[^/]+$/.test(photoRef)) {
        return reply.code(400).send({ error: "Invalid photo reference" });
      }

      // Named sizes only — the legacy maxWidthPx/maxHeightPx params are retired.
      const parsed = placeBoxSchema.safeParse((request.query as { size?: unknown }).size);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid size: expected card or hero" });
      }
      const box = parsed.data;

      const key = request.server.config.GOOGLE_MAPS_API_KEY;
      if (!key) {
        return reply.code(404).send();
      }

      try {
        const { buffer, contentType } =
          await request.server.photoCache.getBox(photoRef, box, async () =>
            fetchPlacePhotoMedia({
              photoRef,
              maxWidthPx: BOX_PIXELS.hero,
              maxHeightPx: BOX_PIXELS.hero,
              apiKey: key,
            }),
          );

        reply.header("Content-Type", contentType);
        reply.header("Cache-Control", "public, max-age=2592000, immutable");
        return reply.send(buffer);
      } catch (err) {
        if (err instanceof PhotoNotCachedError) {
          return reply.code(404).send();
        }
        request.log.error(
          { err, photoRef, box },
          "Place photo proxy failed (storage or upstream Google fetch)",
        );
        return reply.code(404).send();
      }
    },
  );
}
