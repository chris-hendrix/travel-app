import type { TemperatureUnit } from "@journiful/shared/types";
import type { LucideIcon } from "lucide-react";
import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  Snowflake,
  CloudLightning,
} from "lucide-react";

export type WeatherTone =
  | "sunny"
  | "cloudy"
  | "fog"
  | "rain"
  | "snow"
  | "storm";

export interface WeatherInfo {
  label: string;
  icon: LucideIcon;
  tone: WeatherTone;
}

const WMO_CODE_MAP: Record<number, WeatherInfo> = {
  // Clear
  0: { label: "Clear sky", icon: Sun, tone: "sunny" },

  // Partly cloudy
  1: { label: "Mainly clear", icon: CloudSun, tone: "sunny" },
  2: { label: "Partly cloudy", icon: CloudSun, tone: "cloudy" },
  3: { label: "Overcast", icon: Cloud, tone: "cloudy" },

  // Fog
  45: { label: "Fog", icon: CloudFog, tone: "fog" },
  48: { label: "Depositing rime fog", icon: CloudFog, tone: "fog" },

  // Drizzle
  51: { label: "Light drizzle", icon: CloudDrizzle, tone: "rain" },
  53: { label: "Moderate drizzle", icon: CloudDrizzle, tone: "rain" },
  55: { label: "Dense drizzle", icon: CloudDrizzle, tone: "rain" },
  56: { label: "Light freezing drizzle", icon: CloudDrizzle, tone: "rain" },
  57: { label: "Dense freezing drizzle", icon: CloudDrizzle, tone: "rain" },

  // Rain
  61: { label: "Slight rain", icon: CloudRain, tone: "rain" },
  63: { label: "Moderate rain", icon: CloudRain, tone: "rain" },
  65: { label: "Heavy rain", icon: CloudRain, tone: "rain" },
  66: { label: "Light freezing rain", icon: CloudRain, tone: "rain" },
  67: { label: "Heavy freezing rain", icon: CloudRain, tone: "rain" },

  // Snow
  71: { label: "Slight snow", icon: Snowflake, tone: "snow" },
  73: { label: "Moderate snow", icon: Snowflake, tone: "snow" },
  75: { label: "Heavy snow", icon: Snowflake, tone: "snow" },
  77: { label: "Snow grains", icon: Snowflake, tone: "snow" },

  // Showers
  80: { label: "Slight rain showers", icon: CloudRain, tone: "rain" },
  81: { label: "Moderate rain showers", icon: CloudRain, tone: "rain" },
  82: { label: "Violent rain showers", icon: CloudRain, tone: "rain" },
  85: { label: "Slight snow showers", icon: Snowflake, tone: "snow" },
  86: { label: "Heavy snow showers", icon: Snowflake, tone: "snow" },

  // Thunderstorm
  95: { label: "Thunderstorm", icon: CloudLightning, tone: "storm" },
  96: {
    label: "Thunderstorm with slight hail",
    icon: CloudLightning,
    tone: "storm",
  },
  99: {
    label: "Thunderstorm with heavy hail",
    icon: CloudLightning,
    tone: "storm",
  },
};

const UNKNOWN_WEATHER: WeatherInfo = {
  label: "Unknown",
  icon: Cloud,
  tone: "cloudy",
};

/**
 * Get human-readable label and Lucide icon for a WMO weather code.
 *
 * @see https://open-meteo.com/en/docs#weathervariables (WMO Weather interpretation codes)
 */
export function getWeatherInfo(code: number): WeatherInfo {
  return WMO_CODE_MAP[code] ?? UNKNOWN_WEATHER;
}

/**
 * Convert a Celsius temperature to the requested unit and round to the
 * nearest integer for display.
 */
export function toDisplayTemp(celsius: number, unit: TemperatureUnit): number {
  if (unit === "fahrenheit") {
    return Math.round(celsius * (9 / 5) + 32);
  }
  return Math.round(celsius);
}
