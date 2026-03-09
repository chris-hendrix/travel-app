import { z } from "zod";

export const dailyForecastSchema = z.object({
  date: z.string(),
  weatherCode: z.number().int(),
  temperatureMax: z.number(),
  temperatureMin: z.number(),
  precipitationProbability: z.number().min(0).max(100),
});

export const tripWeatherResponseSchema = z.object({
  available: z.boolean(),
  message: z.string().optional(),
  location: z.string().optional(),
  forecasts: z.array(dailyForecastSchema),
  fetchedAt: z.string().nullable(),
});

export type DailyForecastSchema = z.infer<typeof dailyForecastSchema>;
export type TripWeatherResponseSchema = z.infer<
  typeof tripWeatherResponseSchema
>;
