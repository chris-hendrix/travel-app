# Architecture: Trip Photo Upload Service

Shared photo gallery for trips. Members upload photos (1-5 per request), which are asynchronously re-encoded to WebP via pg-boss + sharp. Gallery displays as a collapsible section on the trip detail page with lightbox viewer. Next.js `<Image>` handles responsive sizing.

## DB Schema

Add `trip_photos` table to `apps/api/src/db/schema/index.ts`:

```typescript
export const photoStatusEnum = pgEnum("photo_status", [
  "processing",
  "ready",
  "failed",
]);

export const tripPhotos = pgTable(
  "trip_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    url: text("url"),
    caption: varchar("caption", { length: 200 }),
    status: photoStatusEnum("status").notNull().default("processing"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("trip_photos_trip_id_idx").on(table.tripId),
    index("trip_photos_uploaded_by_idx").on(table.uploadedBy),
  ],
);

export type TripPhoto = typeof tripPhotos.$inferSelect;
export type NewTripPhoto = typeof tripPhotos.$inferInsert;
```

Add relations in `apps/api/src/db/schema/relations.ts`:

- `tripPhotosRelations`: belongs to trip, belongs to user (uploader)
- Add `photos: many(tripPhotos)` to existing `tripsRelations`

## API Contracts

All endpoints scoped under `/api/trips/:id/photos`. All require authenticated trip member.

### POST `/api/trips/:id/photos` — Upload photos

- Auth: trip member + complete profile
- Multipart: up to 5 files, 5MB each, JPEG/PNG/WebP
- Validates photo count limit (20 per trip)
- For each file: validate → upload raw to S3 (`photos/{tripId}/{uuid}_raw.{ext}`) → insert DB row → enqueue pg-boss job
- Response: `{ success: true, photos: TripPhoto[] }`

### GET `/api/trips/:id/photos` — List photos

- Auth: trip member
- Returns all photos sorted by `createdAt DESC`
- Response: `{ success: true, photos: TripPhoto[] }`

### PATCH `/api/trips/:id/photos/:photoId` — Update caption

- Auth: photo uploader OR trip organizer
- Body: `{ caption: string }` (max 200 chars)
- Response: `{ success: true, photo: TripPhoto }`

### DELETE `/api/trips/:id/photos/:photoId` — Delete photo

- Auth: photo uploader OR trip organizer
- Deletes DB row + S3 object (processed WebP, and raw if still exists)
- Response: `{ success: true }`

## BE Services

### ImageProcessingService (`apps/api/src/services/image-processing.service.ts`)

Pure service — no DB or S3 access. Takes a buffer, returns processed buffers.

```typescript
async processPhoto(rawBuffer: Buffer): Promise<Buffer>  // Returns WebP q85, original dimensions
```

### PhotoService (`apps/api/src/services/photo.service.ts`)

Fastify plugin decorator (`fastify.photoService`). Follows existing service patterns (e.g., `tripService`).

```typescript
getPhotosByTripId(tripId: string): Promise<TripPhoto[]>
getPhotoById(photoId: string): Promise<TripPhoto | null>
getPhotoCount(tripId: string): Promise<number>
createPhotoRecord(tripId: string, uploadedBy: string): Promise<TripPhoto>
updatePhotoUrl(photoId: string, url: string): Promise<void>
updateCaption(photoId: string, caption: string): Promise<TripPhoto>
setPhotoFailed(photoId: string): Promise<void>
deletePhoto(photoId: string): Promise<{ url: string | null }>
```

### Photo Processing Worker (`apps/api/src/workers/photo-processing.worker.ts`)

Registered with existing pg-boss instance (`fastify.boss`).

- Queue name: `photo-processing`
- Job payload: `{ photoId: string; tripId: string; rawKey: string }`
- Flow: download raw from S3 → `imageProcessingService.processPhoto()` → upload WebP to S3 → `photoService.updatePhotoUrl()` → delete raw from S3
- On failure after 3 retries: `photoService.setPhotoFailed()`
- S3 key pattern: `photos/{tripId}/{uuid}.webp`

## Controller (`apps/api/src/controllers/photo.controller.ts`)

Follows existing controller pattern (see `trip.controller.ts`). Uses `req.files()` iterator for multi-file multipart parsing.

Upload flow per file:

1. `await part.toBuffer()`
2. `uploadService.validateImage(buffer, mimetype)` — reuse existing validation
3. `storage.upload(buffer, rawKey, mimetype)` — upload raw temporarily
4. `photoService.createPhotoRecord(tripId, userId)`
5. `boss.send('photo-processing', { photoId, tripId, rawKey })`

## Routes (`apps/api/src/routes/photo.routes.ts`)

Register in `apps/api/src/app.ts`:

```typescript
app.register(photoRoutes, { prefix: "/api/trips/:id/photos" });
```

Update multipart config in `app.ts`: change `files: 1` to `files: 5`.

Permission checks:

- All routes: `authenticate` + verify trip membership via `permissionsService.isMember()`
- Write routes: also `requireCompleteProfile`
- PATCH/DELETE: verify photo uploader OR `permissionsService.isOrganizer()`

## Shared Types & Schemas

### `shared/types/photo.ts`

```typescript
export type PhotoStatus = "processing" | "ready" | "failed";

export interface Photo {
  id: string;
  tripId: string;
  uploadedBy: string;
  url: string | null;
  caption: string | null;
  status: PhotoStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GetPhotosResponse {
  success: true;
  photos: Photo[];
}

export interface UploadPhotosResponse {
  success: true;
  photos: Photo[];
}

export interface UpdatePhotoResponse {
  success: true;
  photo: Photo;
}
```

### `shared/schemas/photo.ts`

```typescript
export const updatePhotoCaptionSchema = z.object({
  caption: z.string().max(200),
});

export type UpdatePhotoCaptionInput = z.infer<typeof updatePhotoCaptionSchema>;
```

Export from `shared/schemas/index.ts` and `shared/types/index.ts`.

## FE Components

```
apps/web/src/app/(app)/trips/[id]/trip-detail-content.tsx
  └─ PhotosSection (new collapsible section, after itinerary)
       ├─ PhotoUploadDropzone
       ├─ PhotoGrid
       │    └─ PhotoCard[]
       └─ PhotoLightbox
```

### PhotosSection (`apps/web/src/components/photos/photos-section.tsx`)

- Collapsible section matching existing pattern (Itinerary, Messages, Members)
- Header shows photo count: "Photos (12/20)"
- Contains upload dropzone + grid + lightbox state management
- Only visible to trip members (not preview mode)

### PhotoUploadDropzone (`apps/web/src/components/photos/photo-upload-dropzone.tsx`)

- Multi-file drag-drop + file picker (extends existing `ImageUpload` component pattern)
- Accepts up to 5 files per batch, JPEG/PNG/WebP, 5MB each
- Client-side validation before upload
- Per-file progress bars with local preview thumbnails (blob URLs)
- Shows remaining count: "3 photos remaining"
- Disabled when limit reached
- Uses `FormData` with `fetch()` for upload (matches existing upload pattern)

### PhotoGrid (`apps/web/src/components/photos/photo-grid.tsx`)

- Responsive CSS grid: 2 cols mobile, 3 cols tablet, 4 cols desktop
- Uses `next/image` with `url` source + appropriate `sizes` prop for responsive sizing
- Empty state: illustration + "No photos yet" message
- Sorted by `createdAt DESC` (newest first)

### PhotoCard (`apps/web/src/components/photos/photo-card.tsx`)

- `next/image` displaying photo via `url`
- States: processing (skeleton pulse), ready (photo), failed (error icon + retry)
- Hover overlay: uploader name, caption, delete button (if authorized)
- Click → opens lightbox at this photo's index

### PhotoLightbox (`apps/web/src/components/photos/photo-lightbox.tsx`)

- Full-screen overlay with backdrop blur/dark
- Displays full image via `url`
- Navigation: left/right arrows (click + keyboard) + swipe on mobile
- Photo counter: "3 / 12"
- Caption display + inline edit (if authorized)
- Delete button (if authorized)
- Close: X button + Escape key
- Focus trap for accessibility

### TanStack Query Hooks

`apps/web/src/hooks/photo-queries.ts`:

```typescript
export const photoKeys = {
  all: (tripId: string) => ["trips", tripId, "photos"] as const,
};

export const photosQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: photoKeys.all(tripId),
    staleTime: 30 * 1000, // 30s — photos change frequently during active trips
    queryFn: async ({ signal }) =>
      apiRequest<GetPhotosResponse>(`/trips/${tripId}/photos`, { signal }),
  });
```

`apps/web/src/hooks/use-photos.ts`:

- `usePhotos(tripId)` — query hook
- `useUploadPhotos(tripId)` — mutation, invalidates list on success
- `useUpdatePhotoCaption(tripId)` — mutation with optimistic caption update
- `useDeletePhoto(tripId)` — mutation with optimistic removal from list

## Image Processing

Single variant only. Raw upload → re-encode to WebP q85 at original dimensions → discard raw. Next.js `<Image>` with `sizes` prop handles responsive downsizing for grid vs lightbox.

## Dependencies

### New (install in apps/api)

- `sharp` — image processing

### Existing (no changes)

- `pg-boss` — already integrated via `apps/api/src/plugins/queue.ts`
- `@fastify/multipart` — already configured
- `@aws-sdk/client-s3` — already configured
- `file-type` — already used for magic byte validation

## Limits

| Constraint        | Value                         |
| ----------------- | ----------------------------- |
| Photos per trip   | 20                            |
| File size         | 5MB                           |
| Files per request | 5                             |
| Allowed types     | JPEG, PNG, WebP               |
| Caption length    | 200 chars                     |
| Stored format     | Original dimensions, WebP q85 |

## Testing Strategy

- **Unit tests**: ImageProcessingService (WebP re-encoding), PhotoService (DB operations)
- **Integration tests**: Photo API endpoints (upload, list, update caption, delete, permission checks, limit enforcement)
- **E2E tests**: Upload flow, gallery display, lightbox navigation, caption edit, delete
- **Manual testing**: Visual verification of gallery grid, lightbox, upload UX with Playwright screenshots
