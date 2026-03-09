# Tasks: Weather Feature

## Phase 1: Database & Shared Types

- [x] Task 1.1: Add coordinate columns, temperature unit, and weather cache table
  - Implement: Add `destinationLat` (doublePrecision, nullable) and `destinationLon` (doublePrecision, nullable) to `trips` table in `apps/api/src/db/schema/index.ts`
  - Implement: Add `temperatureUnit` (varchar(10), default "celsius") to `users` table
  - Implement: Create `weatherCache` table with `tripId` (uuid PK, FK cascade to trips), `response` (jsonb, notNull), `fetchedAt` (timestamp with tz, notNull, defaultNow)
  - Implement: Export `weatherCache` from schema barrel
  - Implement: Generate migration with `pnpm db:generate` (from apps/api)
  - Verify: Review generated SQL, run `pnpm db:migrate`, run full test suite

- [x] Task 1.2: Create shared weather types, schemas, and update existing types
  - Implement: Create `shared/types/weather.ts` with `TemperatureUnit`, `DailyForecast`, `TripWeatherResponse`
  - Implement: Export from `shared/types/index.ts`
  - Implement: Create `shared/schemas/weather.ts` with `dailyForecastSchema`, `tripWeatherResponseSchema`
  - Implement: Export from `shared/schemas/index.ts`
  - Implement: Add `destinationLat?: number | null` and `destinationLon?: number | null` to `Trip` and `TripDetail` in `shared/types/trip.ts`
  - Implement: Add `temperatureUnit?: TemperatureUnit` to `User` in `shared/types/user.ts`
  - Implement: Add `temperatureUnit` field to `updateProfileSchema` in `shared/schemas/user.ts`
  - Implement: Add `temperatureUnit` to `userResponseSchema` in `shared/schemas/auth.ts`
  - Implement: Add `destinationLat`, `destinationLon` to `tripEntitySchema` in `shared/schemas/trip.ts`
  - Test: Run typecheck to verify all types compile
  - Verify: Run full test suite

## Phase 2: Backend Geocoding

- [x] Task 2.1: Create geocoding service with plugin registration
  - Implement: Create `apps/api/src/services/geocoding.service.ts` with `IGeocodingService` interface and `OpenMeteoGeocodingService` class
  - Implement: `geocode(query)` calls `https://geocoding-api.open-meteo.com/v1/search?name={query}&count=1&language=en`, returns `{ lat, lon }` or null
  - Implement: Handle network errors gracefully (return null)
  - Implement: Create `apps/api/src/plugins/geocoding-service.ts` using `fp()`, depends on `["config"]`
  - Implement: Add `geocodingService: IGeocodingService` to FastifyInstance in `apps/api/src/types/index.ts`
  - Implement: Register plugin in `apps/api/src/app.ts` after config plugin
  - Test: Unit test geocoding service — successful geocode, no results, API error
  - Verify: Run full test suite

- [x] Task 2.2: Hook geocoding into trip create/update and add getEffectiveDateRange
  - Implement: Inject `geocodingService` into `TripService` constructor (update plugin to pass it)
  - Implement: In `updateTrip()` — if destination changed, geocode and store lat/lon; if cleared, null out; delete weather cache on change
  - Implement: In `createTrip()` — if destination provided, geocode and store lat/lon
  - Implement: Add `getEffectiveDateRange(tripId)` method — query trip startDate/endDate AND min/max event times, return `{ start, end }`
  - Test: Integration test — update trip destination triggers geocode + lat/lon stored; clear destination clears lat/lon
  - Verify: Run full test suite

## Phase 3: Backend Weather

- [x] Task 3.1: Create weather service with caching and plugin registration
  - Implement: Create `apps/api/src/services/weather.service.ts` with `IWeatherService` interface and `WeatherService` class
  - Implement: `getForecast(tripId, userId)` with full logic: check coords, check dates, check >16 days, check cache freshness, fetch Open-Meteo, upsert cache, parse parallel arrays to DailyForecast[], filter to trip date range
  - Implement: Return `{ available: false, message: "Weather temporarily unavailable" }` on API errors
  - Implement: Create `apps/api/src/plugins/weather-service.ts` using `fp()`, depends on `["database", "config"]`
  - Implement: Add `weatherService: IWeatherService` to FastifyInstance in `apps/api/src/types/index.ts`
  - Implement: Register plugin in `apps/api/src/app.ts`
  - Test: Unit test weather service — cache hit, cache miss, stale cache, no coords, no dates, past trip, >16 days, API error, parallel array parsing
  - Verify: Run full test suite

- [x] Task 3.2: Create weather controller and route
  - Implement: Create `apps/api/src/controllers/weather.controller.ts` with `getForecast` handler — extract tripId from params, userId from JWT, verify membership, call weatherService
  - Implement: Create `apps/api/src/routes/weather.routes.ts` with `GET /trips/:tripId/weather`, auth middleware, UUID param schema, response schema
  - Implement: Register routes in `apps/api/src/app.ts` with `{ prefix: "/api" }`
  - Test: Integration test — GET /trips/:tripId/weather returns forecast for valid trip, returns unavailable for no coords, 401 unauthenticated, 403 non-member
  - Verify: Run full test suite

## Phase 4: Frontend Weather

- [x] Task 4.1: Create weather query hook and WMO code mapping
  - Implement: Create `apps/web/src/hooks/use-weather.ts` with `weatherKeys` factory, `weatherForecastQueryOptions(tripId)`, `useWeatherForecast(tripId)` hook
  - Implement: Create `apps/web/src/lib/weather-codes.ts` with `getWeatherInfo(code)` returning `{ label, icon }` for all WMO code groups
  - Test: Verify typecheck passes
  - Verify: Run full test suite

- [x] Task 4.2: Create WeatherDayBadge and WeatherForecastCard components
  - Implement: Create `apps/web/src/components/itinerary/weather-day-badge.tsx` — icon + temp range, Celsius/Fahrenheit conversion, null if no data
  - Implement: Create `apps/web/src/components/itinerary/weather-forecast-card.tsx` — loading skeleton, unavailable message, horizontal scroll forecast, shadcn Card
  - Implement: Export from `apps/web/src/components/itinerary/index.ts` barrel
  - Test: Verify typecheck passes
  - Verify: Run full test suite

- [x] Task 4.3: Integrate weather into itinerary views and add temperature unit to profile
  - Implement: In `itinerary-view.tsx` — add `useWeatherForecast(tripId)`, get user temperatureUnit from auth, render `<WeatherForecastCard>` above main content, pass forecasts + unit to DayByDayView
  - Implement: In `day-by-day-view.tsx` — accept `forecasts` and `temperatureUnit` props, render `<WeatherDayBadge>` in day header sticky column below weekday
  - Implement: In `profile-dialog.tsx` — add °C/°F toggle after timezone field, wire to `temperatureUnit` in form
  - Implement: Update `user.controller.ts` to handle `temperatureUnit` in updateData
  - Seed: For manual testing, create a trip with destination (e.g., "San Diego, CA") and dates within 16 days
  - Test: Verify typecheck passes
  - Verify: Run full test suite, manual test with Playwright — verify weather card and badges appear, toggle temperature unit

## Phase 5: Cleanup

- [x] Task 5.1: Triage PROGRESS.md for unaddressed items
  - Review: Read entire PROGRESS.md
  - Identify: Find FAILURE, BLOCKED, reviewer caveats, or deferred items across ALL phases
  - Fix: Create individual fix tasks in TASKS.md for each outstanding issue
  - Verify: Run full test suite

- [x] Task 5.1.1: Fix 64 pre-existing web test failures (CustomizeThemeSheet QueryClientProvider) — HIGH
  - Root cause: `CustomizeThemeSheet` component calls `useQueryClient()` without a `QueryClientProvider` in the test render tree
  - Fix: Mock `CustomizeThemeSheet` in `trip-detail-content.test.tsx` (38 failures) and `create-trip-dialog.test.tsx` (24 failures)
  - Fix: Fix tab count assertion mismatch in `members-list.test.tsx` (2 failures) — expected "Invited (3)" but rendered count differs
  - Verify: `pnpm --filter @tripful/web test` passes with 0 failures

- [x] Task 5.1.2: Fix 1 pre-existing shared test failure (theme-config kebab-case regex) — MEDIUM
  - Root cause: Theme preset ID `80s-pop-art-ski-slope` starts with a digit; regex `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/` rejects leading digits
  - Fix: Update regex in `shared/__tests__/theme-config.test.ts` to `/^[a-z0-9][a-z0-9]*(-[a-z0-9]+)*$/` OR rename the theme ID to start with a letter
  - Verify: `pnpm --filter @tripful/shared test` passes with 0 failures

- [x] Task 5.1.3: Extract duplicated toDisplayTemp utility — LOW
  - Root cause: `weather-day-badge.tsx` and `weather-forecast-card.tsx` both define identical `toDisplayTemp` function inline
  - Fix: Move `toDisplayTemp` to `apps/web/src/lib/weather-codes.ts` and import from both components
  - Verify: Typecheck passes, no behavior change

- [x] Task 5.1.4: Use getTableColumns(users) in getCoOrganizers — LOW
  - Root cause: `apps/api/src/services/trip.service.ts` `getCoOrganizers` method uses manual column listing instead of `getTableColumns(users)` like other service methods
  - Fix: Replace manual column selection with `getTableColumns(users)` and exclude `passwordHash`
  - Verify: API tests pass, no behavior change

- [x] Task 5.1.5: Geocoding service improvements — LOW
  - Fix: Add logger parameter to geocoding service for production debugging
  - Fix: Add empty-string guard to `geocode()` to avoid wasting HTTP calls on empty destinations
  - Fix: Skip redundant geocoding in `updateTrip` when destination has not changed
  - Verify: API tests pass, geocoding unit tests updated

## Phase 6: Final Verification

- [x] Task 6.1: Full regression check
  - Verify: All unit tests pass
  - Verify: All integration tests pass
  - Verify: All E2E tests pass
  - Verify: Linting and type checking pass
  - Verify: Manual test — weather feature works end-to-end with screenshots
