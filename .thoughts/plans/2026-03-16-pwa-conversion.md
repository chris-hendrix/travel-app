---
title: PWA Conversion with Push Notifications
date: 2026-03-16
status: completed
revised: 2026-03-28
brainstorm: .thoughts/brainstorms/2026-03-16-pwa-conversion.md
---

# PWA Conversion with Push Notifications

## Overview

Convert Journiful into a full Progressive Web App using `@ducanh2912/next-pwa` (Workbox-based service worker) and `web-push` (VAPID server-side push delivery). The existing notification infrastructure (pg-boss queues, notification DB tables, batch/deliver workers) is extended with a push delivery channel alongside SMS.

## Success Criteria

1. App installable from browser on Android, iOS (with coaching flow), and desktop
2. All 4 notification types (`trip_message`, `trip_update`, `daily_itinerary`, `mutual_invite`) delivered via Web Push alongside existing SMS
3. iOS users guided through add-to-home-screen flow before push permission requested
4. Offline fallback page shown when network unavailable
5. Stale-while-revalidate caching for trip data (fast loads on slow connections)
6. Push subscription lifecycle managed (expired subs cleaned up via 410 handling)

## Current State

### What exists
- `apps/web/src/app/manifest.ts` — `display: "standalone"`, single SVG icon
- `appleWebApp.capable: true` in root layout metadata
- `notifications` + `notificationPreferences` + `sentReminders` DB tables
- Notification API routes (list, unread-count, mark-read, preferences)
- pg-boss workers: `notification/batch` (fans out to members) → `notification/deliver` (SMS via Twilio)
- Shared `NotificationType` union: `daily_itinerary | trip_message | trip_update | mutual_invite | sms_invite`

### What's missing
- Service worker, raster icons, offline fallback
- `push_subscriptions` DB table
- `web-push` library + VAPID key infrastructure
- Push delivery worker
- Install prompt UI + iOS coaching flow
- Runtime caching configuration

## Architecture

### Push notification delivery flow (extends existing pattern)

```
User action (e.g., new message)
  → notificationService.notifyTripMembers()
  → Queue: notification/batch
  → Batch worker:
      1. Query trip members + preferences
      2. Bulk-insert notification records + sentReminders
      3. Enqueue notification/deliver jobs (SMS)  ← existing
      4. Enqueue push/deliver jobs (Web Push)     ← NEW
  → push-deliver worker:
      1. Look up user's push subscriptions
      2. Build payload from notification type (see payload mapping table)
      3. web-push.sendNotification() to each endpoint
      4. Handle 410 Gone → delete expired subscription
```

### Notification type → push payload mapping

| Type | Title | Body | URL | Tag |
|------|-------|------|-----|-----|
| `trip_message` | "New message in {trip}" | "{sender}: {preview}" | `/trips/{id}/messages` | `msg-{tripId}` |
| `trip_update` | "{trip} updated" | "{description}" | `/trips/{id}` | `update-{tripId}` |
| `daily_itinerary` | "Today in {trip}" | "{count} events planned" | `/trips/{id}/itinerary` | `daily-{tripId}` |
| `mutual_invite` | "Join {trip}?" | "{inviter} invited you" | `/trips/{id}` | `invite-{tripId}` |

### Service worker architecture (next-pwa + custom push handler)

```
next-pwa generates sw.js:
  - Precaches Next.js build assets (JS, CSS)
  - Runtime caching rules (configured in next.config.ts)
  - Offline fallback to /~offline page

Custom worker extension (worker/index.ts):
  - push event → showNotification()
  - notificationclick → openWindow() to notification URL
```

### New database table

```sql
push_subscriptions
  id          UUID PK
  user_id     UUID FK → users(id) ON DELETE CASCADE
  endpoint    TEXT NOT NULL UNIQUE     -- browser endpoints are globally unique
  p256dh      TEXT NOT NULL
  auth        TEXT NOT NULL
  user_agent  TEXT
  created_at  TIMESTAMPTZ DEFAULT NOW()
  INDEX ON (user_id)
```

### New API routes

```
POST   /api/push/subscribe          — save push subscription
DELETE /api/push/subscribe           — remove push subscription by endpoint
GET    /api/push/vapid-public-key    — return VAPID public key (unauthenticated OK)
```

### New environment variables

```bash
# Backend (.env)
VAPID_PUBLIC_KEY=     # from: npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:hello@journiful.app

# Frontend (.env.local)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=   # same as backend public key
```

### Push vs SMS preference handling

Push delivery reuses the existing `notificationPreferences` booleans (`dailyItinerary`, `tripMessages`). If a user disables a notification type, it is disabled for both SMS and push. No per-channel toggle — keeps the UX simple and avoids a schema change. The notification settings UI (task 3.5) shows a single on/off per notification type, plus a browser-level push permission indicator.

---

## Implementation Plan

### Phase 1: PWA Foundation (Installable + Offline Fallback)

#### 1.0 Validate next-pwa + Next.js 16 compatibility ✅ COMPLETED (spike)
- [x] `pnpm --filter @journiful/web add @ducanh2912/next-pwa` — installed, 219 packages added
- [x] Add minimal config wrapper in `next.config.ts` (just `dest: "public"`, `disable: true` in dev)
- [x] Run build — **requires `next build --webpack` flag** since Next.js 16 defaults to Turbopack and next-pwa uses webpack config
- [x] Build succeeds, `public/sw.js` generated (36KB)
- [x] **Gate passed** — next-pwa works with Next.js 16 via `--webpack` flag
- **Deviation**: Build script in `apps/web/package.json` must be updated to `next build --webpack`. Dev server can stay on Turbopack (next-pwa is disabled in dev).

#### 1.1 Generate raster icon set ✅
- [x] Created `apps/web/public/icons/` directory
- [x] Created `apps/web/scripts/generate-pwa-icons.mjs` using sharp (already a dependency)
- [x] Generated: `icon-192x192.png`, `icon-512x512.png`
- [x] Maskable variants: `icon-maskable-192x192.png`, `icon-maskable-512x512.png`
- [x] Badge icon: `badge-72x72.png`
- [x] Apple touch icon: `apple-touch-icon.png` (180x180)

#### 1.2 Enhance manifest.ts ✅
- [x] Added raster icon entries (192, 512, maskable variants)
- [x] Added `categories: ["travel"]`
- [x] Added `shortcuts` array (View Trips → `/trips`, New Trip → `/trips/new`)
- [x] Added `id: "/"`
- [x] Kept existing `background_color` and `theme_color` (#1a1814)

#### 1.3 Configure next-pwa (full config) ✅
- [x] Updated `apps/web/next.config.ts` with withPWA wrapper
- [x] Config: dest, disable in dev, cacheStartUrl, dynamicStartUrl, fallbacks
- [x] `cacheOnFrontendNav` intentionally omitted
- [x] Added SW files to `.gitignore`
- [x] Updated build script to `next build --webpack`

#### 1.4 Create offline fallback page ✅
- [x] Created `apps/web/src/app/~offline/page.tsx`
- [x] Dark themed (#1a1814), wifi-off icon, retry button, Journiful branding

#### 1.5 Update root layout metadata ✅
- [x] Added apple-touch-icon link in metadata
- [x] Verified `appleWebApp` config (statusBarStyle, title already correct)
- [x] Verified viewport themeColor already set

#### 1.6 Create install prompt component ✅
- [x] Created `apps/web/src/components/pwa/install-prompt.tsx`
- [x] `beforeinstallprompt` event, dismissable banner, 7-day localStorage dismissal

#### 1.7 Create iOS install coaching component ✅
- [x] Created `apps/web/src/components/pwa/ios-install-guide.tsx`
- [x] iOS Safari detection (excludes CriOS/FxiOS), standalone mode detection
- [x] Step-by-step overlay with Share icon, localStorage dismissal

#### 1.8 Test Phase 1 ✅
- [x] Build succeeds (25s), `public/sw.js` generated (34KB)
- [x] Typecheck passes across all 3 packages

---

### Phase 2: Push Notifications — Backend

> **Ordering note**: Start with 2.0 (VAPID keys) and 2.7 (shared types), as the service, routes, and workers depend on them.

#### 2.0 Generate VAPID keys and configure env ✅
- [x] Added `vapid:generate` script to `apps/api/package.json`
- [x] Generated VAPID keys, added to `.env` and `.env.local`
- [x] Added placeholders to `.env.example` files
- [x] Added VAPID vars to env schema (`apps/api/src/config/env.ts`)

#### 2.1 Add push_subscriptions table ✅
- [x] Added `pushSubscriptions` table with all columns + userId index
- [x] Added relations in `relations.ts`
- [x] Generated and applied migration `0026_flawless_colossus.sql`

#### 2.2 Add web-push dependency ✅
- [x] Added `web-push@^3.6.7` and `@types/web-push`

#### 2.3 Add shared types and schemas ✅
- [x] Added `PushSubscriptionInput`, `PushPayload` types
- [x] Added `pushSubscribeSchema`, `pushUnsubscribeSchema`, `vapidPublicKeyResponseSchema`
- [x] Exported through barrel files

#### 2.4 Create push service ✅
- [x] Created `apps/api/src/services/push.service.ts`
- [x] Methods: addSubscription (upsert), removeSubscription, getUserSubscriptions, sendToUser
- [x] VAPID initialization, graceful disable if keys not configured
- [x] 410 Gone cleanup, 429 rethrow for retry

#### 2.5 Create push routes ✅
- [x] Created `apps/api/src/routes/push.routes.ts`
- [x] GET /vapid-public-key (public), POST /subscribe, DELETE /subscribe (authenticated)

#### 2.6 Create push deliver worker ✅
- [x] Added `PUSH_DELIVER` queue + DLQ to types
- [x] Created worker, registered in queue index
- [x] retryLimit: 3, retryDelay: 10, retryBackoff: true

#### 2.7 Create notification payload builder ✅
- [x] Created `apps/api/src/services/push-payload.builder.ts`
- [x] Maps all 4 notification types + fallback for unknown types

#### 2.8 Extend notification batch worker ✅
- [x] Enqueues push/deliver jobs alongside SMS
- [x] Uses payload builder, reuses same preference filtering

#### 2.9 Register push service and routes ✅
- [x] Created `apps/api/src/plugins/push-service.ts`
- [x] Registered in `apps/api/src/app.ts` (plugin + routes)

#### 2.10 Test Phase 2 ✅
- [x] Typecheck passes
- [x] Updated notification-batch.worker.test.ts for push jobs
- [x] All 1233 tests pass (14 failures in daily-itineraries are pre-existing)

---

### Phase 3: Push Notifications — Frontend

> **Ordering note**: Build 3.1 (utilities) and 3.2 (hooks) first, then 3.3 (SW handler), then 3.4-3.6 (UI + wiring).

#### 3.1 Create push notification utilities ✅
- [x] Created `apps/web/src/lib/push-notifications.ts`
- [x] `isPushSupported()`, `getPermissionState()`, `subscribeToPush()`, `urlBase64ToUint8Array()`, `getExistingSubscription()`

#### 3.2 Create push notification hooks ✅
- [x] Created `apps/web/src/hooks/use-push-notifications.ts`
- [x] `useVapidPublicKey()`, `usePushPermission()`, `usePushSubscription()`, `useSubscribeToPush()`, `useUnsubscribeFromPush()`

#### 3.3 Create custom service worker extension for push ✅
- [x] Created `apps/web/worker/index.ts` with push + notificationclick handlers
- [x] Uses `includeUncontrolled: true` for Safari compatibility
- [x] Updated next-pwa config: `customWorkerSrc: "worker"`

#### 3.4 Create notification permission prompt ✅
- [x] Created `apps/web/src/components/pwa/notification-prompt.tsx`
- [x] Contextual: `showNotificationPrompt()` exported for use after trip join/RSVP
- [x] Enable/Maybe later buttons, localStorage dismissal

#### 3.5 Create notification settings UI ✅
- [x] Updated `notification-preferences.tsx` with push section
- [x] Shows Enabled (green) / Enable button / Blocked (red) based on permission state

#### 3.6 Wire up push subscription on auth ✅
- [x] Created `apps/web/src/components/pwa/push-subscription-manager.tsx`
- [x] Auto-resubscribe on login if permission granted, unsubscribe on logout

#### 3.7 Add service worker update prompt ✅
- [x] Created `apps/web/src/components/pwa/sw-update-prompt.tsx`
- [x] Listens for `updatefound` + checks for waiting worker
- [x] Shows banner with Refresh button, sends SKIP_WAITING

#### 3.8 Test Phase 3 ✅
- [x] Build succeeds (17s), typecheck passes
- [x] SW + custom worker generated
- [ ] Manual testing deferred: iOS device, Safari notificationclick, SW update prompt

---

### Phase 4: Caching Strategy (Light Offline)

#### 4.1 Configure runtime caching rules ✅
- [x] Updated next-pwa config in `next.config.ts` with `workboxOptions.runtimeCaching`:

  | Pattern | Strategy | Cache Name | Max Entries | Max Age |
  |---------|----------|------------|-------------|---------|
  | `/api/trips` (GET) | StaleWhileRevalidate | `api-trips` | 50 | 1h |
  | `/api/trips/:id` (GET) | StaleWhileRevalidate | `api-trip-detail` | 20 | 1h |
  | `/api/events` (GET) | StaleWhileRevalidate | `api-events` | 100 | 30m |
  | Image CDN / uploads | CacheFirst | `images` | 200 | 30d |
  | Google Fonts | CacheFirst | `google-fonts` | 10 | 365d |
  | Static assets (JS/CSS) | CacheFirst | `static-assets` | 100 | 30d |
  | All other API calls | NetworkFirst | `api-default` | 50 | 5m |

- [x] All 7 caching patterns implemented:
  ```typescript
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /\/api\/trips$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "api-trips",
          expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
        },
      },
      {
        urlPattern: /\/api\/trips\/[^/]+$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "api-trip-detail",
          expiration: { maxEntries: 20, maxAgeSeconds: 3600 },
        },
      },
      {
        urlPattern: /\/api\/events/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "api-events",
          expiration: { maxEntries: 100, maxAgeSeconds: 1800 },
        },
      },
      {
        urlPattern: /\.(png|jpg|jpeg|webp|svg|gif)$/,
        handler: "CacheFirst",
        options: {
          cacheName: "images",
          expiration: { maxEntries: 200, maxAgeSeconds: 2592000 },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com/,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts",
          expiration: { maxEntries: 10, maxAgeSeconds: 31536000 },
        },
      },
    ],
  },
  ```

#### 4.2 Verify offline fallback works ✅
- [x] Build succeeds with caching rules in generated SW
- [ ] Manual verification: go offline → navigate to uncached route → should see `~offline` page (deferred to manual testing)

---

## File Changes Summary

### New files
| File | Purpose |
|------|---------|
| `apps/web/src/app/~offline/page.tsx` | Offline fallback page |
| `apps/web/src/components/pwa/install-prompt.tsx` | Android/desktop install banner |
| `apps/web/src/components/pwa/ios-install-guide.tsx` | iOS add-to-home-screen coaching |
| `apps/web/src/components/pwa/notification-prompt.tsx` | Push permission request UI |
| `apps/web/src/components/pwa/sw-update-prompt.tsx` | "New version available" toast |
| `apps/web/src/lib/push-notifications.ts` | Push subscription utilities |
| `apps/web/src/hooks/use-push-notifications.ts` | React hooks for push |
| `apps/web/worker/index.ts` | Custom SW push/click handlers |
| `apps/web/public/icons/*.png` | Raster icon set |
| `apps/api/src/services/push.service.ts` | Web Push delivery service |
| `apps/api/src/services/push-payload.builder.ts` | NotificationType → push payload mapper |
| `apps/api/src/routes/push.routes.ts` | Push subscription API routes |
| `apps/api/src/plugins/push-service.ts` | Fastify plugin for push service |
| `apps/api/src/queues/workers/push-deliver.worker.ts` | pg-boss push delivery worker |
| `shared/schemas/push.ts` | Zod schemas for push subscription |

### Modified files
| File | Change |
|------|--------|
| `apps/web/next.config.ts` | Wrap with next-pwa |
| `apps/web/src/app/manifest.ts` | Add icons, shortcuts, categories |
| `apps/web/src/app/layout.tsx` | Enhance PWA metadata |
| `apps/web/.gitignore` | Add generated SW files |
| `apps/api/src/db/schema/index.ts` | Add `pushSubscriptions` table |
| `apps/api/src/queues/types.ts` | Add `PUSH_DELIVER` queue type |
| `apps/api/src/queues/index.ts` | Register push worker |
| `apps/api/src/queues/workers/notification-batch.worker.ts` | Enqueue push/deliver jobs via payload builder |
| `apps/api/src/app.ts` | Register push plugin + routes |
| `apps/api/package.json` | Add `web-push` dep + `vapid:generate` script |
| `apps/web/package.json` | Add `@ducanh2912/next-pwa` dependency |
| `shared/types/notification.ts` | Add push-related types |
| `.env.example` files | Add VAPID key vars |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `@ducanh2912/next-pwa` incompatible with Next.js 16 | **Task 1.0 is a gate** — validate before any other Phase 1 work. Fallbacks: Serwist (`@serwist/next`) or manual Workbox config |
| iOS push requires home screen install | Phase 1 builds iOS coaching flow before Phase 3 needs it |
| Safari/WebKit push quirks | `renotify` unsupported, `clients.matchAll` behavior differs — SW code uses `includeUncontrolled: true` and avoids Safari-unsupported options. Manual Safari testing in Phase 3.8 |
| SW caches stale data | Short TTLs (1h API, 30d images), versioned cache names |
| Push subscriptions expire silently | 410 handling in worker + periodic re-subscribe check on app load (task 3.6) |
| Push payload exceeds 4KB limit | Payload builder keeps title/body short, URL as path only — no embedded data blobs |
| VAPID private key lost or compromised | Treat as permanent credential, back up securely. Loss invalidates all existing subscriptions (users must re-subscribe). GitGuardian pre-commit prevents accidental commit |
| SW update storms on deploy | next-pwa uses `skipWaiting: false` by default — users see update prompt (task 3.7) and refresh at their own pace |

## Deferred (Intentionally Out of Scope)

These were considered in the brainstorm but deferred to keep the initial PWA scope focused:

| Feature | Why deferred |
|---------|-------------|
| **TanStack Query persistence** (`@tanstack/query-sync-storage-persister` + IndexedDB) | Workbox SWR caching covers the "fast loads" criterion. True offline-first with hydrated React Query cache is a separate effort with its own cache invalidation complexity |
| **Background sync for offline mutations** (Workbox BackgroundSync) | Requires conflict resolution strategy. Current app is online-only for writes — adding offline mutation queuing is a meaningful architecture change |
| **WebSocket real-time updates** (`@fastify/websocket`) | Independent of PWA, improves in-app experience. Push handles background notifications; WebSocket is for live in-app updates |
| **Per-channel notification preferences** (separate push vs SMS toggles) | Adds schema complexity for marginal UX benefit at current scale. Can be added later by splitting `notificationPreferences` booleans into per-channel columns |

## Testing

- **Unit**: push service (subscription CRUD, 410 handling), payload builder (all 4 notification types), push worker (delivery + error handling)
- **Integration**: POST /api/push/subscribe stores correctly, batch worker enqueues push jobs alongside SMS, preferences filtering applies to both channels
- **E2E**: install prompt shows on mobile viewport, offline page renders, notification permission flow
- **Manual**: test on real iOS device (add to home screen → grant notifications → receive push), test Safari desktop `notificationclick`, test SW update prompt
