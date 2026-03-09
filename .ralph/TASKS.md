# Tasks: Trip Photo Upload Service

## Phase 1: Database & Shared Types

- [x] Task 1.1: Add trip_photos table and shared types/schemas
  - Implement: Add `photoStatusEnum` and `tripPhotos` table to `apps/api/src/db/schema/index.ts`
  - Implement: Add `tripPhotosRelations` to `apps/api/src/db/schema/relations.ts`, add `photos: many(tripPhotos)` to `tripsRelations`
  - Implement: Generate migration with `cd apps/api && pnpm db:generate`
  - Implement: Create `shared/types/photo.ts` with `PhotoStatus`, `Photo` (single `url` field), response types
  - Implement: Create `shared/schemas/photo.ts` with `updatePhotoCaptionSchema`
  - Implement: Export from `shared/types/index.ts` and `shared/schemas/index.ts`
  - Test: Run `pnpm typecheck` to verify schema compiles
  - Verify: Run migration with `pnpm db:migrate`, run full test suite

## Phase 2: Backend — Image Processing & Photo Service

- [x] Task 2.1: Create ImageProcessingService and PhotoService with worker
  - Implement: `pnpm --filter @tripful/api add sharp && pnpm --filter @tripful/api add -D @types/sharp`
  - Implement: Create `apps/api/src/services/image-processing.service.ts` with `processPhoto(buffer): Promise<Buffer>` — re-encodes to WebP q85 at original dimensions
  - Implement: Create `apps/api/src/services/photo.service.ts` as Fastify plugin with CRUD methods (`getPhotosByTripId`, `getPhotoCount`, `createPhotoRecord`, `updatePhotoUrl`, `updateCaption`, `setPhotoFailed`, `deletePhoto`)
  - Implement: Create `apps/api/src/workers/photo-processing.worker.ts` — download raw from S3, re-encode to WebP, upload to S3 as `photos/{tripId}/{uuid}.webp`, update DB, delete raw. 3 retries with exponential backoff.
  - Implement: Register worker with existing pg-boss instance in `apps/api/src/plugins/queue.ts` or new plugin
  - Implement: Register `photoService` plugin in `apps/api/src/app.ts`
  - Test: Write unit tests in `apps/api/tests/unit/image-processing.service.test.ts` — verify WebP output, preserves dimensions, handles JPEG/PNG/WebP inputs
  - Test: Write unit tests for PhotoService DB operations in `apps/api/tests/unit/photo.service.test.ts`
  - Verify: Run full test suite

## Phase 3: Backend — Routes & Controller

- [x] Task 3.1: Create photo routes and controller with integration tests
  - Implement: Create `apps/api/src/controllers/photo.controller.ts` with `uploadPhotos`, `getPhotos`, `updateCaption`, `deletePhoto` handlers
  - Implement: Create `apps/api/src/routes/photo.routes.ts` with GET/POST/PATCH/DELETE endpoints, auth + membership checks, permission checks for PATCH/DELETE
  - Implement: Register routes in `apps/api/src/app.ts` at `/api/trips/:id/photos`
  - Implement: Update multipart config in `app.ts` — change `files: 1` to `files: 5`
  - Test: Write integration tests in `apps/api/tests/integration/photo.routes.test.ts`:
    - Upload single file, upload multiple files
    - List photos for trip
    - Update caption (own photo, organizer, non-owner rejected)
    - Delete photo (own photo, organizer, non-owner rejected)
    - 20-photo limit enforcement
    - Non-member rejected
    - Invalid file type/size rejected
  - Verify: Run full test suite

## Phase 4: Frontend — Query Hooks & Upload

- [x] Task 4.1: Create TanStack Query hooks and PhotoUploadDropzone
  - Implement: Create `apps/web/src/hooks/photo-queries.ts` with `photoKeys` factory and `photosQueryOptions`
  - Implement: Create `apps/web/src/hooks/use-photos.ts` with `usePhotos`, `useUploadPhotos`, `useUpdatePhotoCaption`, `useDeletePhoto` hooks (optimistic updates for caption and delete)
  - Implement: Create `apps/web/src/components/photos/photo-upload-dropzone.tsx` — multi-file drag-drop, client-side validation, per-file progress, remaining count display
  - Test: Write hook tests in `apps/web/src/hooks/__tests__/use-photos.test.tsx`
  - Test: Write component test in `apps/web/src/components/photos/__tests__/photo-upload-dropzone.test.tsx`
  - Verify: Run full test suite

## Phase 5: Frontend — Gallery, Lightbox & Integration

- [x] Task 5.1: Create PhotoGrid, PhotoCard, PhotoLightbox, and PhotosSection
  - Implement: Create `apps/web/src/components/photos/photo-card.tsx` — processing/ready/failed states, hover overlay, click to open lightbox
  - Implement: Create `apps/web/src/components/photos/photo-grid.tsx` — responsive grid (2/3/4 cols), empty state, uses `next/image` with `url` and `sizes` prop
  - Implement: Create `apps/web/src/components/photos/photo-lightbox.tsx` — full-screen overlay, displays photo `url`, arrow/swipe navigation, caption edit, delete, keyboard nav, focus trap
  - Implement: Create `apps/web/src/components/photos/photos-section.tsx` — collapsible section with header count, contains dropzone + grid + lightbox state
  - Implement: Add `PhotosSection` to `apps/web/src/app/(app)/trips/[id]/trip-detail-content.tsx` (after itinerary, before messages, only for members)
  - Test: Write component tests for PhotoCard (states), PhotoGrid (rendering, empty state)
  - Test: Write E2E test in `apps/web/tests/e2e/photos.spec.ts`:
    - Upload photo to trip
    - Verify photo appears in grid
    - Open lightbox, navigate between photos
    - Edit caption
    - Delete photo
    - Verify limit enforcement
  - Verify: Run full test suite
  - Verify: Manual browser testing with screenshots — gallery grid layout, upload flow, lightbox navigation, caption editing, empty state

## Phase 6: Cleanup

- [x] Task 6.1: Triage PROGRESS.md for unaddressed items
  - Review: Read entire PROGRESS.md
  - Identify: Find FAILURE, BLOCKED, reviewer caveats, or deferred items across ALL phases
  - Fix: Create individual fix tasks in TASKS.md for each outstanding issue
  - Verify: Run full test suite

- [x] Task 6.2: FIX: LocalStorageService doesn't handle nested photo paths
  - Fix: In `apps/api/src/services/storage.service.ts`, update `LocalStorageService.delete()` to extract the full relative path after `/uploads/` instead of just the filename via `.pop()`
  - Fix: Update `LocalStorageService.upload()` to create intermediate directories with `mkdirSync(dirname(filePath), { recursive: true })` for nested paths like `photos/{tripId}/{uuid}.webp`
  - Test: Write unit tests verifying upload and delete work with nested paths
  - Verify: Run full test suite

- [ ] Task 6.3: Write E2E tests for photo feature
  - Implement: Create `apps/web/tests/e2e/photos.spec.ts` following existing E2E patterns (see `itinerary-journey.spec.ts`)
  - Test: Upload photo to trip, verify grid display, open lightbox, navigate, edit caption, delete photo
  - Verify: Run E2E test suite

- [ ] Task 6.4: Manual browser testing with screenshots for photo feature
  - Verify: Start dev servers, navigate to trip detail page
  - Verify: Screenshot empty photo state, upload flow, gallery grid, lightbox navigation, caption editing
  - Verify: Save screenshots to `.ralph/screenshots/` with `task-6.4-` prefix

## Phase 7: Final Verification

- [ ] Task 7.1: Full regression check
  - Verify: All unit tests pass
  - Verify: All integration tests pass
  - Verify: All E2E tests pass
  - Verify: Linting passes (`pnpm lint`)
  - Verify: Type checking passes (`pnpm typecheck`)
  - Verify: Manual browser testing — complete upload-to-lightbox flow with screenshots
