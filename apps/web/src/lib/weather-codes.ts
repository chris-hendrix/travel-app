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

export interface WeatherInfo {
  label: string;
  icon: LucideIcon;
}

const WMO_CODE_MAP: Record<number, WeatherInfo> = {
  // Clear
  0: { label: "Clear sky", icon: Sun },

  // Partly cloudy
  1: { label: "Mainly clear", icon: CloudSun },
  2: { label: "Partly cloudy", icon: CloudSun },
  3: { label: "Overcast", icon: Cloud },

  // Fog
  45: { label: "Fog", icon: CloudFog },
  48: { label: "Depositing rime fog", icon: CloudFog },

  // Drizzle
  51: { label: "Light drizzle", icon: CloudDrizzle },
  53: { label: "Moderate drizzle", icon: CloudDrizzle },
  55: { label: "Dense drizzle", icon: CloudDrizzle },
  56: { label: "Light freezing drizzle", icon: CloudDrizzle },
  57: { label: "Dense freezing drizzle", icon: CloudDrizzle },

  // Rain
  61: { label: "Slight rain", icon: CloudRain },
  63: { label: "Moderate rain", icon: CloudRain },
  65: { label: "Heavy rain", icon: CloudRain },
  66: { label: "Light freezing rain", icon: CloudRain },
  67: { label: "Heavy freezing rain", icon: CloudRain },

  // Snow
  71: { label: "Slight snow", icon: Snowflake },
  73: { label: "Moderate snow", icon: Snowflake },
  75: { label: "Heavy snow", icon: Snowflake },
  77: { label: "Snow grains", icon: Snowflake },

  // Showers
  80: { label: "Slight rain showers", icon: CloudRain },
  81: { label: "Moderate rain showers", icon: CloudRain },
  82: { label: "Violent rain showers", icon: CloudRain },
  85: { label: "Slight snow showers", icon: Snowflake },
  86: { label: "Heavy snow showers", icon: Snowflake },

  // Thunderstorm
  95: { label: "Thunderstorm", icon: CloudLightning },
  96: { label: "Thunderstorm with slight hail", icon: CloudLightning },
  99: { label: "Thunderstorm with heavy hail", icon: CloudLightning },
};

const UNKNOWN_WEATHER: WeatherInfo = { label: "Unknown", icon: Cloud };

/**
 * Get human-readable label and Lucide icon for a WMO weather code.
 *
 * @see https://open-meteo.com/en/docs#weathervariables (WMO Weather interpretation codes)
 */
export function getWeatherInfo(code: number): WeatherInfo {
  return WMO_CODE_MAP[code] ?? UNKNOWN_WEATHER;
}
