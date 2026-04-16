export type TemperatureUnit = "celsius" | "fahrenheit";

export interface DailyForecast {
  date: string; // "2026-03-15"
  weatherCode: number; // WMO code
  temperatureMax: number; // always Celsius from API
  temperatureMin: number; // always Celsius from API
  precipitationProbability: number; // 0-100
}

export interface HourlyForecast {
  time: string; // ISO datetime "2026-04-16T15:00"
  temperature: number; // Celsius
  weatherCode: number; // WMO code
  windSpeed: number; // km/h
  humidity: number; // 0-100%
  uvIndex: number;
  dewPoint: number; // Celsius
  precipitationProbability: number; // 0-100
}

export interface DailyForecastExtended extends DailyForecast {
  sunrise: string; // "06:12"
  sunset: string; // "19:48"
  windSpeedMax: number; // km/h
  windDirectionDominant: number; // degrees (0-360)
  uvIndexMax: number;
  apparentTemperatureMax: number; // Celsius (feels like)
  apparentTemperatureMin: number;
}

export interface TripWeatherResponse {
  available: boolean;
  message?: string;
  location?: string;
  forecasts: DailyForecastExtended[];
  hourly: HourlyForecast[];
  fetchedAt: string | null;
}
