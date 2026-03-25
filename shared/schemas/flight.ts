import { z } from "zod";

export const flightLookupRequestSchema = z.object({
  flightNumber: z
    .string()
    .min(3)
    .max(10)
    .regex(
      /^[A-Z]{2,3}\d{1,4}$/i,
      "Format: airline code + number (e.g., UA123)",
    ),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
});

export const flightLookupResultSchema = z.object({
  departureAirport: z.object({ iata: z.string().nullable(), name: z.string() }),
  departureTime: z.string(),
  arrivalAirport: z.object({ iata: z.string().nullable(), name: z.string() }),
  arrivalTime: z.string(),
});

export const flightLookupResponseSchema = z.discriminatedUnion("available", [
  z.object({
    available: z.literal(true),
    flight: flightLookupResultSchema.nullable(),
  }),
  z.object({ available: z.literal(false) }),
]);

export type FlightLookupRequest = z.infer<typeof flightLookupRequestSchema>;
export type FlightLookupResult = z.infer<typeof flightLookupResultSchema>;
export type FlightLookupResponse = z.infer<typeof flightLookupResponseSchema>;
