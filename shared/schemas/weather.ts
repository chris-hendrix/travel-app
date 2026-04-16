import { z } from "zod";

export const dailyForecastSchema = z.object({
  date: z.string(),
  weatherCode: z.number().int(),
  temperatureMax: z.number(),
  temperatureMin: z.number(),
  precipitationProbability: z.number().min(0).max(100),
  sunrise: z.string(),
  sunset: z.string(),
  windSpeedMax: z.number(),
  windDirectionDominant: z.number(),
  uvIndexMax: z.number(),
  apparentTemperatureMax: z.number(),
  apparentTemperatureMin: z.number(),
});

export const hourlyForecastSchema = z.object({
  time: z.string(),
  temperature: z.number(),
  weatherCode: z.number().int(),
  windSpeed: z.number(),
  humidity: z.number().min(0).max(100),
  uvIndex: z.number(),
  dewPoint: z.number(),
  precipitationProbability: z.number().min(0).max(100),
});

export const tripWeatherResponseSchema = z.object({
  available: z.boolean(),
  message: z.string().optional(),
  location: z.string().optional(),
  forecasts: z.array(dailyForecastSchema),
  hourly: z.array(hourlyForecastSchema),
  fetchedAt: z.string().nullable(),
});

export type DailyForecastSchema = z.infer<typeof dailyForecastSchema>;
export type HourlyForecastSchema = z.infer<typeof hourlyForecastSchema>;
export type TripWeatherResponseSchema = z.infer<
  typeof tripWeatherResponseSchema
>;
