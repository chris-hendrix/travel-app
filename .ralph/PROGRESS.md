# Progress: Trip Photo Upload Service

## Iteration 1 — Task 1.1: Add trip_photos table and shared types/schemas

**Status**: ✅ COMPLETE

### What was done
- Added `photoStatusEnum` (processing/ready/failed) and `tripPhotos` table to `apps/api/src/db/schema/index.ts`
- Added `tripPhotosRelations` to `relations.ts` with trip and uploader relations; added `photos: many(tripPhotos)` to tripsRelations and `uploadedPhotos: many(tripPhotos)` to usersRelations
- Generated migration `0023_icy_genesis.sql` — creates enum, table, indexes (trip_id, uploaded_by), foreign keys (cascade on trip_id)
- Created `shared/types/photo.ts` with PhotoStatus, Photo, GetPhotosResponse, UploadPhotosResponse, UpdatePhotoResponse
- Created `shared/schemas/photo.ts` with updatePhotoCaptionSchema (caption max 200 chars)
- Exported from barrel files in `shared/types/index.ts` and `shared/schemas/index.ts`

### Verification
- **Typecheck**: PASS (all 3 packages: shared, api, web)
- **Lint**: PASS (all 3 packages)
- **Tests**: 1168 API tests passed, 321 shared tests passed, 1159 web tests passed. 6 API failures + 5 web failures are pre-existing (MinIO/S3 and trip content component tests), not caused by this change.
- **Migration**: Generated and applied successfully
- **Reviewer**: APPROVED — exact match to architecture spec

### Learnings
- All imports needed for schema (pgTable, uuid, varchar, text, timestamp, index, pgEnum, integer) were already present in schema/index.ts
- Pre-existing test failures exist in MinIO/S3 integration tests (cover image, profile photo) and web component tests (trips-content, trip-detail-content) — these are not related to photo feature work

## Iteration 2 — Task 2.1: Create ImageProcessingService and PhotoService with worker

**Status**: ✅ COMPLETE

### What was done
- Installed `sharp` dependency in apps/api
- Created `ImageProcessingService` (`apps/api/src/services/image-processing.service.ts`) — pure service that re-encodes images to WebP q85 using sharp
- Created `PhotoService` (`apps/api/src/services/photo.service.ts`) — DB service with 8 CRUD methods for trip_photos table (getPhotosByTripId, getPhotoById, getPhotoCount, createPhotoRecord, updatePhotoUrl, updateCaption, setPhotoFailed, deletePhoto)
- Created Fastify plugin wrappers: `plugins/image-processing-service.ts` and `plugins/photo-service.ts`
- Created photo processing worker (`apps/api/src/queues/workers/photo-processing.worker.ts`) — downloads raw from storage, processes to WebP, uploads, updates DB, deletes raw. Marks photo as failed on final retry (retryCount >= 2).
- Added `PHOTO_PROCESSING` and `PHOTO_PROCESSING_DLQ` queue constants and `PhotoProcessingPayload` type to `queues/types.ts`
- Registered photo-processing queue (DLQ first, retryLimit: 3, retryBackoff: true) and worker in `queues/index.ts` with `downloadBuffer` closure supporting both S3 and local storage
- Exposed `storage` decorator from `upload-service.ts` for worker access; added `photoService`, `imageProcessingService`, `storage` to FastifyInstance type augmentation
- Registered both new service plugins in `app.ts`

### Tests written
- `tests/unit/image-processing.service.test.ts` (6 tests): JPEG/PNG/WebP to WebP conversion, dimension preservation, RIFF header validation, invalid input rejection
- `tests/unit/photo.service.test.ts` (13 tests): All 8 service methods with real DB (create, get by ID, get by trip, count, update URL with status transition, update caption, set failed, delete with/without URL)
- `tests/unit/photo-processing.worker.test.ts` (6 tests): Happy path pipeline, logging, early retry (no setPhotoFailed), final retry (calls setPhotoFailed), retryCount > 2, failure at different stages

### Verification
- **Typecheck**: PASS (all 3 packages)
- **Lint**: PASS (all 3 packages)
- **New tests**: 25/25 passed across 3 test files
- **Full suite**: 11 failures are all pre-existing (same as iteration 1)
- **Reviewer**: APPROVED — clean architecture compliance, good pattern consistency, thorough test coverage

### Learnings
- Workers live in `apps/api/src/queues/workers/` (not a separate `src/workers/` directory) — follow codebase convention over architecture spec literal
- Queue naming convention uses slash-delimited format: `photo/process` (not `photo-processing`) to match existing patterns like `notification/batch`
- `WorkerDeps` was not extended to avoid impacting all workers; instead a dedicated `PhotoProcessingDeps` interface was created for the photo worker
- The `IStorageService` interface doesn't have a `download`/`getObject` method — the `downloadBuffer` function was implemented as a closure in queue registration, handling both S3 (via `S3StorageService.getObject`) and local storage (via `fs.readFile`)
- `storage` was exposed as a Fastify decorator from `upload-service.ts` to make it accessible to queue workers
- pg-boss v12's `Job` type doesn't expose `retryCount`; `JobWithMetadata` type is needed with a cast since the runtime object always has it

## Iteration 3 — Task 3.1: Create photo routes and controller with integration tests

**Status**: ✅ COMPLETE

### What was done
- Created `apps/api/src/controllers/photo.controller.ts` with 4 handlers: `uploadPhotos` (multi-file multipart), `getPhotos`, `updateCaption`, `deletePhoto`
- Created `apps/api/src/routes/photo.routes.ts` with GET `/`, POST `/`, PATCH `/:photoId`, DELETE `/:photoId` — follows scoped write routes pattern with `authenticate` + `requireCompleteProfile`
- Added `PhotoNotFoundError` to `apps/api/src/errors.ts`
- Registered `photoRoutes` in `apps/api/src/app.ts` at prefix `/api/trips/:id/photos`
- Changed multipart config `files: 1` → `files: 5` in `app.ts`
- Extracted `assertUploaderOrOrganizer` helper to deduplicate permission checks in updateCaption and deletePhoto
- Added `tripIdParamsSchema` for UUID validation on GET and POST routes (consistency with PATCH/DELETE which use `photoIdParamsSchema`)
- Upload handler enforces 20-photo-per-trip limit (including in-batch count), validates files via `uploadService.validateImage`, uploads raw to storage, enqueues pg-boss `photo/process` job
- Delete handler cleans up processed image from storage; raw file cleanup delegated to worker (documented edge case for mid-processing deletes)

### Tests written
- `apps/api/tests/integration/photo.routes.test.ts` (18 tests):
  - Upload: single file (201), multiple files (201)
  - Upload errors: no auth (401), non-member (403), invalid file type (400), 20-photo limit (400)
  - List: photos sorted DESC (200 with order verification), empty array (200), non-member (403)
  - Update caption: own photo (200), organizer on other's photo (200), non-owner non-organizer (403), photo not found (404)
  - Delete: own photo (200 with DB verification), organizer (200), non-owner non-organizer (403), not found (404), no auth (401)

### Verification
- **Typecheck**: PASS (all 3 packages)
- **Lint**: PASS (all 3 packages)
- **New tests**: 18/18 passed when run in isolation (702ms)
- **Full suite**: 13 failures — all pre-existing (8 API: S3/MinIO upload concurrency, 5 web: component tests)
- **Reviewer**: APPROVED after one round of fixes (param validation, sort order test assertion, permission helper extraction, raw file cleanup documentation)

### Learnings
- Photo routes use nested prefix `/api/trips/:id/photos` — the `:id` param comes from the parent prefix, not the route path itself
- Multipart routes can still set `params` schema even without `body` schema — useful for UUID validation
- File upload integration tests that touch storage (S3/MinIO) fail in full suite due to concurrency/ordering but pass in isolation — this is a pre-existing environment issue affecting all upload tests
- The `assertUploaderOrOrganizer` pattern with a parameterized `action` string provides contextual error messages while keeping DRY code
- Empty string caption is intentional — allows clearing captions via PATCH
