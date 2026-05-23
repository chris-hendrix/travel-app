// Tests for weather validation schemas

import { describe, it, expect } from "vitest";
import {
  dailyForecastSchema,
  tripWeatherResponseSchema,
} from "../schemas/index.js";

describe("dailyForecastSchema", () => {
  it("should accept a valid daily forecast", () => {
    const valid = {
      date: "2026-03-15",
      weatherCode: 3,
      temperatureMax: 25.5,
      temperatureMin: 12.3,
      precipitationProbability: 40,
      sunrise: "06:30",
      sunset: "18:45",
      windSpeedMax: 15.3,
      windDirectionDominant: 180,
      uvIndexMax: 5.2,
      apparentTemperatureMax: 28.1,
      apparentTemperatureMin: 10.5,
    };
    expect(() => dailyForecastSchema.parse(valid)).not.toThrow();
  });

  it("should reject non-integer weather codes", () => {
    const result = dailyForecastSchema.safeParse({
      date: "2026-03-15",
      weatherCode: 3.5,
      temperatureMax: 25,
      temperatureMin: 12,
      precipitationProbability: 40,
      sunrise: "06:30",
      sunset: "18:45",
      windSpeedMax: 15,
      windDirectionDominant: 180,
      uvIndexMax: 5,
      apparentTemperatureMax: 28,
      apparentTemperatureMin: 10,
    });
    expect(result.success).toBe(false);
  });

  it("should reject precipitation probability below 0", () => {
    const result = dailyForecastSchema.safeParse({
      date: "2026-03-15",
      weatherCode: 3,
      temperatureMax: 25,
      temperatureMin: 12,
      precipitationProbability: -1,
      sunrise: "06:30",
      sunset: "18:45",
      windSpeedMax: 15,
      windDirectionDominant: 180,
      uvIndexMax: 5,
      apparentTemperatureMax: 28,
      apparentTemperatureMin: 10,
    });
    expect(result.success).toBe(false);
  });

  it("should reject precipitation probability above 100", () => {
    const result = dailyForecastSchema.safeParse({
      date: "2026-03-15",
      weatherCode: 3,
      temperatureMax: 25,
      temperatureMin: 12,
      precipitationProbability: 101,
      sunrise: "06:30",
      sunset: "18:45",
      windSpeedMax: 15,
      windDirectionDominant: 180,
      uvIndexMax: 5,
      apparentTemperatureMax: 28,
      apparentTemperatureMin: 10,
    });
    expect(result.success).toBe(false);
  });

  it("should accept boundary precipitation values (0 and 100)", () => {
    const atZero = dailyForecastSchema.safeParse({
      date: "2026-03-15",
      weatherCode: 0,
      temperatureMax: 25,
      temperatureMin: 12,
      precipitationProbability: 0,
      sunrise: "06:30",
      sunset: "18:45",
      windSpeedMax: 15,
      windDirectionDominant: 180,
      uvIndexMax: 5,
      apparentTemperatureMax: 28,
      apparentTemperatureMin: 10,
    });
    expect(atZero.success).toBe(true);

    const atHundred = dailyForecastSchema.safeParse({
      date: "2026-03-15",
      weatherCode: 0,
      temperatureMax: 25,
      temperatureMin: 12,
      precipitationProbability: 100,
      sunrise: "06:30",
      sunset: "18:45",
      windSpeedMax: 15,
      windDirectionDominant: 180,
      uvIndexMax: 5,
      apparentTemperatureMax: 28,
      apparentTemperatureMin: 10,
    });
    expect(atHundred.success).toBe(true);
  });

  it("should accept negative temperatures", () => {
    const result = dailyForecastSchema.safeParse({
      date: "2026-01-15",
      weatherCode: 71,
      temperatureMax: -5.2,
      temperatureMin: -15.0,
      precipitationProbability: 80,
      sunrise: "08:15",
      sunset: "16:30",
      windSpeedMax: 25,
      windDirectionDominant: 315,
      uvIndexMax: 2,
      apparentTemperatureMax: -8,
      apparentTemperatureMin: -20,
    });
    expect(result.success).toBe(true);
  });
});

describe("tripWeatherResponseSchema", () => {
  it("should accept a response with forecasts", () => {
    const valid = {
      available: true,
      forecasts: [
        {
          date: "2026-03-15",
          weatherCode: 3,
          temperatureMax: 25,
          temperatureMin: 12,
          precipitationProbability: 40,
          sunrise: "06:30",
          sunset: "18:45",
          windSpeedMax: 15,
          windDirectionDominant: 180,
          uvIndexMax: 5,
          apparentTemperatureMax: 28,
          apparentTemperatureMin: 10,
        },
      ],
      hourly: [],
      fetchedAt: "2026-03-08T12:00:00Z",
    };
    expect(() => tripWeatherResponseSchema.parse(valid)).not.toThrow();
  });

  it("should accept a response with no forecasts and a message", () => {
    const valid = {
      available: false,
      message: "Trip dates are too far in the future",
      forecasts: [],
      hourly: [],
      fetchedAt: null,
    };
    expect(() => tripWeatherResponseSchema.parse(valid)).not.toThrow();
  });

  it("should accept a response without optional message", () => {
    const valid = {
      available: true,
      forecasts: [],
      hourly: [],
      fetchedAt: null,
    };
    expect(() => tripWeatherResponseSchema.parse(valid)).not.toThrow();
  });

  it("should reject missing required fields", () => {
    const result = tripWeatherResponseSchema.safeParse({
      available: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid forecast in array", () => {
    const result = tripWeatherResponseSchema.safeParse({
      available: true,
      forecasts: [{ date: "2026-03-15" }], // missing fields
      hourly: [],
      fetchedAt: null,
    });
    expect(result.success).toBe(false);
  });
});
