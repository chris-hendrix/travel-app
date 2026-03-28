---
title: PWA Conversion with Push Notifications
date: 2026-03-28
plan: .thoughts/plans/2026-03-16-pwa-conversion.md
branch: feat/pwa
---

# PWA Conversion Implementation Summary

## What was built

Converted Journiful into a full Progressive Web App with push notifications across 4 phases:

### Phase 1+4: PWA Foundation + Caching
- Service worker via `@ducanh2912/next-pwa` (requires `--webpack` build flag for Next.js 16)
- Raster icon set (192, 512, maskable, badge, apple-touch) generated via sharp script
- Enhanced manifest with shortcuts, categories, app ID
- Offline fallback page (`/~offline`)
- Install prompt for Android/desktop (`beforeinstallprompt`)
- iOS coaching flow for add-to-home-screen
- Workbox runtime caching: SWR for trips/events, CacheFirst for images/fonts/static, NetworkFirst for other API

### Phase 2: Push Backend
- `push_subscriptions` table (migration 0026)
- VAPID key infrastructure with env vars
- Push service (subscribe, unsubscribe, sendToUser with 410 cleanup)
- API routes: GET vapid-public-key, POST/DELETE subscribe
- pg-boss push delivery worker (retryLimit: 3, retryBackoff)
- Payload builder mapping all 4 notification types
- Batch worker extended to enqueue push jobs alongside SMS

### Phase 3: Push Frontend
- Push utilities (isPushSupported, subscribeToPush, urlBase64ToUint8Array)
- TanStack Query hooks for subscription management
- Custom SW push/notificationclick handlers (Safari-compatible)
- Contextual notification permission prompt (post-join/RSVP)
- Push indicator in notification preferences UI
- Auto-subscribe on login, unsubscribe on logout
- SW update prompt ("New version available")

## Key decisions during implementation

| Decision | Reason |
|----------|--------|
| `next build --webpack` flag | Next.js 16 defaults to Turbopack; next-pwa uses webpack config |
| No `cacheOnFrontendNav` | Conflicts with App Router fetch caching |
| No `renotify: true` in SW | Not supported in Safari |
| `includeUncontrolled: true` in notificationclick | Safari compat for clients not yet controlled by SW |
| Push reuses SMS preference booleans | Simplicity; no schema change needed |
| `showNotificationPrompt()` exported function | Allows contextual triggering from trip join/RSVP flows |

## Commits

1. `db405dc` — Phase 1+4: PWA foundation with offline fallback and caching strategy
2. `032f22a` — Phase 2: Push notifications backend with web-push delivery
3. `3acbf0c` — Phase 3: Push notifications frontend with permission flow and SW handler

## Remaining manual testing

- iOS device: add to home screen → grant notifications → receive push
- Safari desktop: verify notificationclick opens correct URL
- SW update prompt: deploy new build while app is open, verify prompt appears
- Offline: go offline → navigate to uncached route → verify ~offline page
