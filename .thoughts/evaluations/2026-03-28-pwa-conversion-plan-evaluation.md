---
title: PWA Conversion Plan Evaluation
date: 2026-03-28
artifact: .thoughts/plans/2026-03-16-pwa-conversion.md
overall_score: 8/10
---

# PWA Conversion Plan Evaluation

## Dimensions

### 1. Completeness — 8/10

**Why this dimension**: The plan must cover everything needed to hit all 6 success criteria.

**What's working**: All success criteria have corresponding implementation tasks. The file changes summary is thorough — every new and modified file is listed. The push notification flow is traced end-to-end from user action through pg-boss to browser delivery.

**What's missing**:
- No task for notification payload mapping. The brainstorm has a table mapping each `NotificationType` to title/body/URL/tag, but the plan never references it. The push-deliver worker needs this.
- TanStack Query persistence dropped. The brainstorm proposes `@tanstack/query-sync-storage-persister` + IndexedDB for true offline data reads. The plan's Phase 4 only does Workbox runtime caching, which won't hydrate React Query's cache on cold start. Success criterion #5 partially addressed.
- No background sync for offline mutations (brainstorm mentions Workbox BackgroundSync, plan omits).
- No SW update prompt ("New version available, refresh" flow).

**Upgrade to 10/10**: Add payload mapping task. Either add TanStack Query persistence + background sync tasks, or explicitly document them as deferred.

---

### 2. Technical Accuracy — 7/10

**Why this dimension**: Incorrect library APIs or platform assumptions will block implementation.

**What's working**: `web-push` API usage, VAPID key setup, and Push API browser code are correct. Workbox runtime caching strategy table is sensible. SW event handlers use correct APIs.

**What's missing**:
- Package names are wrong: plan uses `@tripful/web` and `@tripful/api`, actual packages are `@journiful/web` and `@journiful/api`.
- `@ducanh2912/next-pwa` + Next.js 16 is unvalidated. No concrete spike task before building on top of it.
- `cacheOnFrontendNav: true` may conflict with Next.js App Router's own fetch caching and streaming.
- Brainstorm/plan disagree on DB uniqueness constraint (`UNIQUE(user_id, endpoint)` vs `endpoint UNIQUE`).
- DELETE route path inconsistency between brainstorm (`/api/push/unsubscribe`) and plan (`/api/push/subscribe`).

**Upgrade to 10/10**: Fix package names to `@journiful/*`. Add Phase 1 spike task for next-pwa + Next.js 16 compatibility. Remove or caveat `cacheOnFrontendNav`.

---

### 3. Codebase Alignment — 9/10

**Why this dimension**: The plan must integrate cleanly with existing patterns.

**What's working**: Correctly extends existing notification infrastructure (pg-boss batch/deliver pattern). New push service follows established Fastify plugin pattern. Shared types/schemas go in the right locations. DB schema follows Drizzle conventions. Route registration matches `app.ts` conventions.

**What's missing**:
- Batch worker extension (task 2.6) doesn't clarify whether push uses same preference booleans as SMS or needs its own columns. Existing `notificationPreferences` has `dailyItinerary` and `tripMessages` booleans with no push/SMS distinction. Task 3.5 mentions per-trip preferences that would need a schema change not listed.

**Upgrade to 10/10**: Clarify whether push reuses SMS preference booleans or needs new columns. If separate, add schema migration.

---

### 4. Sequencing & Dependencies — 9/10

**Why this dimension**: Wrong ordering means blocked work and wasted effort.

**What's working**: 4-phase structure is well-ordered. Phase 1 independently valuable and establishes SW for Phase 3. Backend before frontend in Phase 2 is correct. iOS coaching in Phase 1 before push permission in Phase 3 is smart.

**What's missing**:
- No explicit dependency between Phase 2.7 (shared types) and Phase 2.3-2.4 (service + routes). Types should be written first.
- VAPID key generation (task 2.9) is at end of Phase 2 but needed at start.

**Upgrade to 10/10**: Add intra-phase ordering notes. Move VAPID key generation earlier.

---

### 5. Risk Coverage — 7/10

**Why this dimension**: Unidentified risks cause delays and rework.

**What's working**: Five listed risks are real with reasonable mitigations. Next.js 16 compatibility correctly flagged. Push subscription churn with 410 handling addressed.

**What's missing**:
- No mention of Safari/WebKit push quirks (no `renotify`, limited action buttons, different `clients.matchAll()` behavior).
- No risk for SW update storms on deploy.
- No risk for push notification payload size limits (~4KB).
- VAPID key rotation/management unaddressed.

**Upgrade to 10/10**: Add Safari testing risk, payload size limits note, VAPID key management guidance.

---

### 6. Implementability — 8/10

**Why this dimension**: A developer should be able to execute without ambiguity.

**What's working**: Tasks are concrete with specific file paths, code snippets, and clear acceptance criteria. File changes summary is a great quick-reference. Architecture diagrams are clear. SW event handler code is copy-paste ready.

**What's missing**:
- Task 1.1 (generate raster icons) has no tooling specified.
- Task 2.9 (VAPID keys) at end of Phase 2 but needed at start.
- No testing tasks scoped per phase.
- Phase 4 caching config lacks actual Workbox `runtimeCaching` code syntax.

**Upgrade to 10/10**: Specify icon generation tooling. Move VAPID generation earlier. Add test tasks per phase. Add Workbox config snippet.

---

## Summary

| Dimension | Score |
|-----------|-------|
| Completeness | 8/10 |
| Technical Accuracy | 7/10 |
| Codebase Alignment | 9/10 |
| Sequencing & Dependencies | 9/10 |
| Risk Coverage | 7/10 |
| Implementability | 8/10 |
| **Overall** | **8/10** |

## Top 3 Fixes to Reach 10/10

1. Fix `@tripful/*` to `@journiful/*` package names and add a Next.js 16 compatibility spike before Phase 1 builds on the assumption
2. Add notification payload mapping task, clarify push vs SMS preferences, and specify icon generation tooling
3. Expand risk table with Safari quirks and payload size limits; move VAPID key generation earlier
