# Architecture: Weather Feature

Weather forecasts for trip itineraries. Geocodes destinations to coordinates, fetches forecasts from Open-Meteo (free, no API key), caches server-side with 3h TTL, displays as day badges and forecast card.

## Database Schema

### Additions to `apps/api/src/db/schema/index.ts`

**trips table** — add nullable coordinate columns:
```typescript
destinationLat: doublePrecision("destination_lat"),
destinationLon: doublePrecision("destination_lon"),
```

**users table** — add temperature unit preference:
```typescript
temperatureUnit: varchar("temperature_unit", { length: 10 }).default("celsius"),
```

**New weather_cache table** — 1:1 with trips, raw API response cached as JSONB:
```typescript
export const weatherCache = pgTable("weather_cache", {
  tripId: uuid("trip_id").primaryKey().references(() => trips.id, { onDelete: "cascade" }),
  response: jsonb("response").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Single migration covers all three changes.

## Shared Types

### `shared/types/weather.ts`
```typescript
export type TemperatureUnit = "celsius" | "fahrenheit";

export interface DailyForecast {
  date: string;                    // "2026-03-15"
  weatherCode: number;             // WMO code
  temperatureMax: number;          // always Celsius from API
  temperatureMin: number;          // always Celsius from API
  precipitationProbability: number; // 0-100
}

export interface TripWeatherResponse {
  available: boolean;
  message?: string;
  forecasts: DailyForecast[];
  fetchedAt: string | null;
}
```

### `shared/schemas/weather.ts`
Zod schemas mirroring the types: `dailyForecastSchema`, `tripWeatherResponseSchema`.

### Type Updates
- `shared/types/trip.ts`: Add `destinationLat?: number | null` and `destinationLon?: number | null` to `Trip` and `TripDetail`
- `shared/types/user.ts`: Add `temperatureUnit?: TemperatureUnit` to `User`
- `shared/schemas/user.ts`: Add `temperatureUnit` to `updateProfileSchema`
- `shared/schemas/auth.ts`: Add `temperatureUnit` to `userResponseSchema`
- `shared/schemas/trip.ts`: Add `destinationLat`, `destinationLon` to `tripEntitySchema`

## Backend Services

### Geocoding Service — `apps/api/src/services/geocoding.service.ts`

```typescript
export interface IGeocodingService {
  geocode(query: string): Promise<{ lat: number; lon: number } | null>;
}
```

- Calls `https://geocoding-api.open-meteo.com/v1/search?name={query}&count=1&language=en`
- Returns `results[0].latitude/longitude` or null
- Uses native `fetch` (no axios)

**Plugin**: `apps/api/src/plugins/geocoding-service.ts` — depends on `["config"]`

### Weather Service — `apps/api/src/services/weather.service.ts`

```typescript
export interface IWeatherService {
  getForecast(tripId: string, userId: string): Promise<TripWeatherResponse>;
}
```

**Logic flow**:
1. Fetch trip (need lat, lon, preferredTimezone)
2. Get effective date range via `getEffectiveDateRange(tripId)` — queries trip dates AND event dates, returns min start / max end
3. No lat/lon → `{ available: false, message: "Set a destination to see weather" }`
4. No start date → `{ available: false, message: "Set trip dates to see weather" }`
5. End < today → `{ available: false }` (past trip)
6. Start > 16 days away → `{ available: false, message: "Weather forecast available within 16 days of your trip" }`
7. Check `weather_cache` for tripId where `fetchedAt > now - 3h` → if fresh, parse and return
8. Fetch Open-Meteo: `https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=...&forecast_days=16`
9. Upsert raw response into `weather_cache.response` JSONB
10. Parse parallel arrays → `DailyForecast[]`, filter to trip date range, return

**API always returns Celsius.** Frontend converts based on user preference.

**Error handling**: If Open-Meteo API fails (network error, non-200), return `{ available: false, message: "Weather temporarily unavailable" }`.

**Plugin**: `apps/api/src/plugins/weather-service.ts` — depends on `["database", "config"]`

### Trip Service Changes — `apps/api/src/services/trip.service.ts`

**`updateTrip()`**: If `data.destination` changed, geocode and store lat/lon. Clear weather cache on destination change. If destination cleared, set lat/lon to null and clear cache.

**`createTrip()`**: If destination provided, geocode and store lat/lon.

**New `getEffectiveDateRange(tripId)`**: Returns `{ start: Date | null, end: Date | null }` computed from `min(trip.startDate, earliest event startTime)` and `max(trip.endDate, latest event endTime/startTime)`.

### Weather Controller — `apps/api/src/controllers/weather.controller.ts`

```typescript
getForecast(request, reply):
  tripId = request.params.tripId
  userId = request.user.sub
  // Membership check: reuse existing pattern (query members table)
  result = weatherService.getForecast(tripId, userId)
  reply.status(200).send(result)
```

### Weather Route — `apps/api/src/routes/weather.routes.ts`

`GET /trips/:tripId/weather` — auth middleware, UUID param validation, response schema.

### Plugin Registration — `apps/api/src/app.ts`

Add in order:
1. `geocodingServicePlugin` — after config, before service plugins
2. `weatherServicePlugin` — after database plugin, with other services
3. `weatherRoutes` — with other route registrations

### Type Augmentation — `apps/api/src/types/index.ts`

Add to FastifyInstance:
```typescript
geocodingService: IGeocodingService;
weatherService: IWeatherService;
```

## Frontend

### Weather Query Hook — `apps/web/src/hooks/use-weather.ts`

```typescript
export const weatherKeys = {
  all: ["weather"] as const,
  forecast: (tripId: string) => ["weather", "forecast", tripId] as const,
};

export const weatherForecastQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: weatherKeys.forecast(tripId),
    staleTime: 30 * 60 * 1000, // 30 min client-side
    queryFn: async ({ signal }) => {
      return apiRequest<TripWeatherResponse>(`/trips/${tripId}/weather`, { signal });
    },
    enabled: !!tripId,
  });

export function useWeatherForecast(tripId: string) {
  return useQuery(weatherForecastQueryOptions(tripId));
}
```

### WMO Weather Codes — `apps/web/src/lib/weather-codes.ts`

Maps WMO codes to Lucide icon component + label string. Groups:
- 0: Clear / Sun
- 1-3: Partly cloudy / CloudSun
- 45,48: Foggy / CloudFog
- 51-55: Drizzle / CloudDrizzle
- 61-65: Rain / CloudRain
- 71-77: Snow / Snowflake
- 80-82: Showers / CloudRain
- 95,96,99: Thunderstorm / CloudLightning

### WeatherDayBadge — `apps/web/src/components/itinerary/weather-day-badge.tsx`

Props: `forecast: DailyForecast | undefined, temperatureUnit: TemperatureUnit`
- Compact: weather icon (16px) + "H°/L°"
- Converts Celsius → Fahrenheit if needed: `Math.round(c * 9/5 + 32)`
- Returns null if no forecast

### WeatherForecastCard — `apps/web/src/components/itinerary/weather-forecast-card.tsx`

Props: `weather: TripWeatherResponse | undefined, isLoading: boolean, temperatureUnit: TemperatureUnit`
- Loading: skeleton
- Not available + message: muted card with message text
- Not available + no message: hidden (past trip)
- Available: horizontal scroll of daily items (day of week, icon, high/low, precip %)
- Uses shadcn Card

### Integration Points

**`apps/web/src/components/itinerary/itinerary-view.tsx`**:
- Add `useWeatherForecast(tripId)` hook
- Get user's `temperatureUnit` from auth context
- Render `<WeatherForecastCard>` between header area and main content
- Pass `forecasts` + `temperatureUnit` down to `DayByDayView`

**`apps/web/src/components/itinerary/day-by-day-view.tsx`**:
- Accept `forecasts?: DailyForecast[]` and `temperatureUnit?: TemperatureUnit` props
- In day header sticky column: render `<WeatherDayBadge>` below weekday text
- Match forecast by date string comparison

**`apps/web/src/components/profile/profile-dialog.tsx`**:
- Add °C/°F toggle after timezone field
- Wire to `temperatureUnit` in form state and update mutation

### User Auth Context

The `useAuth()` hook returns the user object. Ensure `temperatureUnit` is available on the user type so components can access `user.temperatureUnit`.

## Testing Strategy

**Unit tests** (written alongside implementation):
- Weather service: cache hit/miss/stale, unavailable states, date range filtering, API error handling
- Geocoding service: success, no results, network error
- WMO code mapping: all code groups

**Integration tests** (written alongside routes):
- GET /trips/:tripId/weather: success, no coords, auth checks
- Trip update: destination change triggers geocode + lat/lon storage

**E2E tests**: Not required for this feature (weather data is external/dynamic, hard to assert in E2E).

**Manual testing**: Create trip with destination within 16 days, verify weather badge + card appear, change destination, verify update, test >16 days message, test no destination state.
