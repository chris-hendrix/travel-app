export type TemperatureUnit = "celsius" | "fahrenheit";

export interface DailyForecast {
  date: string; // "2026-03-15"
  weatherCode: number; // WMO code
  temperatureMax: number; // always Celsius from API
  temperatureMin: number; // always Celsius from API
  precipitationProbability: number; // 0-100
}

export interface TripWeatherResponse {
  available: boolean;
  message?: string;
  location?: string;
  forecasts: DailyForecast[];
  fetchedAt: string | null;
}
