import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Client } from "pg";

export async function seedWeatherCache(tripId: string, dates: string[]) {
  const localEnv = config({
    path: fileURLToPath(new URL("../.env", import.meta.url)),
    processEnv: {},
    quiet: true,
  }).parsed;
  const connectionString = process.env.DATABASE_URL ?? localEnv?.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to seed the weather forecast");
  }

  const hours = dates.flatMap((date) => [6, 9, 12, 15, 18, 21].map(
    (hour) => `${date}T${String(hour).padStart(2, "0")}:00`,
  ));
  const response = {
    daily: {
      time: dates,
      weather_code: dates.map(() => 0),
      temperature_2m_max: dates.map(() => 28),
      temperature_2m_min: dates.map(() => 20),
      precipitation_probability_max: dates.map(() => 5),
    },
    hourly: {
      time: hours,
      temperature_2m: hours.map(() => 24),
      weather_code: hours.map(() => 0),
      wind_speed_10m: hours.map(() => 8),
      relative_humidity_2m: hours.map(() => 60),
      uv_index: hours.map(() => 3),
      dew_point_2m: hours.map(() => 15),
      precipitation_probability: hours.map(() => 5),
    },
  };

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(
      "INSERT INTO weather_cache (trip_id, response) VALUES ($1, $2)",
      [tripId, response],
    );
  } finally {
    await client.end();
  }
}
