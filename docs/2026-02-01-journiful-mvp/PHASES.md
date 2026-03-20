# Journiful MVP - Implementation Phases

> **Status**: Phases 1-6 complete | Phase 7 pending
> **Last Updated**: 2026-02-14

## ✅ Phase 1: Monorepo Setup

- [x] pnpm workspace with 3 packages (@journiful/api, @journiful/web, @journiful/shared)
- [x] Turbo build orchestration with parallel task execution
- [x] TypeScript 5.7.3 strict mode across all workspaces
- [x] PostgreSQL 16 via Docker Compose (port 5433)
- [x] Drizzle ORM with schema-first approach
- [x] ESLint + Prettier configuration
- [x] Development scripts for parallel dev servers

## ✅ Phase 2: SMS Authentication

**Backend:**

- [x] Phone-based authentication with SMS verification codes
- [x] JWT token generation with httpOnly cookies
- [x] Database-backed verification codes (5-minute expiry)
- [x] Rate limiting (5 SMS requests/hour per phone number)
- [x] Auth middleware with protected routes
- [x] Profile completion flow (displayName + timezone)
- [x] Mock SMS service (console logging for dev/test)
- [x] Unit + integration tests for all auth endpoints

**Frontend:**

- [x] Login page with phone number input
- [x] Verification page with 6-digit code entry
- [x] Complete profile page with timezone selection
- [x] Protected dashboard route
- [x] AuthProvider context for global auth state

**Database:**

- [x] `users` table (id, phone_number, display_name, timezone, profile_photo_url)
- [x] `verification_codes` table (phone_number PK, code, expires_at)

**E2E:**

- [x] Complete auth journey (login → verify → profile → dashboard)
- [x] Logout flow, protected route access control, existing user skip

## ✅ Phase 3: Trip Management

**Backend:**

- [x] Trip CRUD operations (create, read, update, delete/cancel)
- [x] List user's trips with role information (organizer/member)
- [x] Co-organizer management (add/remove)
- [x] Permission service for access control
- [x] Image upload service for trip cover images (JPEG/PNG/WebP, max 5MB)
- [x] Unit + integration tests

**Frontend:**

- [x] Dashboard with trip list, search, and grouping (Your Trips, Other Trips, Past Trips)
- [x] CreateTripDialog with 2-step form (details + optional cover image)
- [x] EditTripDialog with tabbed interface (Details, Settings, Cover Image, Delete)
- [x] TripCard component, ImageUpload with drag-and-drop
- [x] Permission-based UI rendering

**Database:**

- [x] `trips` table (name, destination, dates, timezone, cover_image_url, settings)
- [x] `members` table (trip membership, RSVP status, co-organizer tracking)

**E2E:**

- [x] Trip creation, editing, permissions, co-organizer management

## ✅ Frontend Design Overhaul

- [x] Mediterranean design system (Vivid Capri palette, hex colors in @theme)
- [x] Typography: Playfair Display (headlines) + Plus Jakarta Sans (body)
- [x] App shell header with navigation, user avatar dropdown, active link states
- [x] Skip link for keyboard accessibility
- [x] shadcn/ui additions: Sonner toasts, AlertDialog, Skeleton, DropdownMenu, Breadcrumb, Avatar, Separator, Tooltip
- [x] Page redesigns: landing, auth layout, dashboard, trip detail
- [x] Accessibility: heading hierarchy, autocomplete attributes, aria-live, 44px touch targets
- [x] Tailwind v4 @theme hsl() bug fix (migrated all colors to hex)

## ✅ Phase 4: Itinerary View Modes

**Backend:**

- [x] Events CRUD with soft delete and restore (EventService)
- [x] Accommodations CRUD with soft delete and restore (AccommodationService)
- [x] Member travel CRUD with soft delete and restore (MemberTravelService)
- [x] Extended PermissionsService with fine-grained permissions
- [x] 18 new API endpoints (6 per resource type)
- [x] Unit + integration tests

**Frontend:**

- [x] Day-by-day and group-by-type view modes
- [x] Timezone toggle (trip timezone vs user timezone)
- [x] Event, accommodation, and member travel card components
- [x] Create/edit dialogs for all three resource types
- [x] Delete confirmation with soft delete support
- [x] TanStack Query hooks with optimistic updates
- [x] Permission-based UI rendering, responsive design

**Database:**

- [x] `events` table with event_type enum (travel, meal, activity), soft delete
- [x] `accommodations` table with date ranges, soft delete
- [x] `member_travel` table with member_travel_type enum (arrival, departure), soft delete

**Shared:**

- [x] Zod schemas + TypeScript types for events, accommodations, member travel

**E2E:**

- [x] 35 tests covering creation, editing, deletion, view modes, timezone toggle, permissions

## ✅ Mobile UX Fixes

- [x] All buttons/inputs meet 44px minimum touch target on mobile
- [x] Toast notifications repositioned to bottom-right with proper z-index
- [x] Event count on trip cards computed dynamically (excludes soft-deleted)
- [x] PhoneInput component with international support and country flag dropdown
- [x] Compact itinerary header with icon-only view toggle and timezone dropdown
- [x] Floating action button (FAB) for Event/Accommodation/Travel actions
- [x] Display names instead of UUIDs on all cards
- [x] Trip card placeholder gradient with centered icon

## ✅ Phase 5: Invitations & RSVP

**Backend:**

- [x] `invitations` table with batch phone-number-based invite flow
- [x] `isOrganizer` column added to members table (replaces role-based permissions)
- [x] InvitationService with batch invite, RSVP, and pending invitation processing
- [x] 5 new API endpoints: invite, RSVP, list members, list invitations, revoke
- [x] Trip preview mode for invited-but-not-accepted users
- [x] Response schemas and rate limiting on all Fastify routes
- [x] N+1 query fix in `processPendingInvitations`
- [x] Unit + integration tests (invitation service, routes, permissions)

**Frontend:**

- [x] InviteMembersDialog with batch phone input
- [x] TripPreview component with RSVP buttons (Going/Maybe/Not Going)
- [x] MembersList component in dialog (replaces old tab layout)
- [x] RsvpBadge component with status-specific colors
- [x] Trip detail refactored: single-page layout, members dialog, no tabs
- [x] Trip error/not-found pages with skeleton Suspense fallback
- [x] TanStack Query hooks for invitations, RSVP, and members

**Shared:**

- [x] Invitation schemas (createInvitationsSchema, updateRsvpSchema)
- [x] Invitation types (Invitation, MemberWithProfile, TripPreview)
- [x] Canonical PHONE_REGEX extracted to shared package
- [x] Response schemas for auth, events, accommodations, member travel, trips

**Database:**

- [x] `invitations` table (id, trip_id, inviter_id, invitee_phone, status, timestamps)
- [x] `isOrganizer` boolean column on members table
- [x] Migration: `0005_early_zemo.sql`

**E2E:**

- [x] Invitation journey: invite via dialog, trip preview, RSVP Going/Maybe/Not Going
- [x] Member list dialog with status badges
- [x] Uninvited user 404 access control
- [x] RSVP status change and "member no longer attending" indicator
- [x] 15 total E2E tests, all passing

## ✅ Phase 5.5: User Profile & Auth Redirects

**Auth Redirects:**

- [x] Landing page (`/page.tsx`): server-side cookie check, redirect authenticated users to `/trips`
- [x] Auth layout (`(auth)/layout.tsx`): server-side cookie check, redirect authenticated users to `/trips` (covers `/login`, `/verify`, `/complete-profile`)

**User Profile:**

- [x] Profile/settings page (`/settings`) for editing display name and timezone
- [x] Profile photo upload (reuse existing image upload service pattern from trip cover images)
- [x] Optional profile photo during initial registration (PRD §1)
- [x] API endpoint for profile updates (backend `updateProfile()` method exists, needs a dedicated route)

**Notes:** Landing page "Get started" button currently sends authenticated users through the login flow again. Auth redirect pattern mirrors existing `(app)/layout.tsx` server-side cookie check. Profile page promise exists in complete-profile UI ("You can update this information later in your settings") but was never built.

**E2E:**

- [x] Authenticated user visiting `/` redirects to trips
- [x] Authenticated user visiting `/login` redirects to trips
- [x] User can edit profile from settings page

## ✅ Phase 6: Advanced Itinerary & Trip Management

**Backend:**

- [x] Meetup location/time fields on events (`meetup_location` text, `meetup_time` timestamptz)
- [x] Migration: `0007_heavy_deathstrike.sql` (adds meetup columns to events table)
- [x] Auto-lock past trips — `isTripLocked()` in PermissionsService prevents mutations after trip end date
- [x] `TripLockedError` enforced in EventService, AccommodationService, MemberTravelService
- [x] Remove member from trip endpoint (`DELETE /api/trips/:tripId/members/:memberId`)
- [x] `removeMember()` in InvitationService with transaction-based cleanup
- [x] Unit + integration tests for all new endpoints and services

**Frontend:**

- [x] Meetup location/time fields in event create/edit dialogs
- [x] Meetup info displayed on event cards (blue info box with group icon)
- [x] Deleted items section at bottom of itinerary (organizer-only) with restore UI
- [x] Multi-day event badges in both day-by-day and group-by-type views
- [x] Past trip read-only UI (FAB hidden, edit/delete buttons disabled, lock indicator)
- [x] Remove member button in members dialog (organizer only)
- [x] `useRemoveMember` TanStack Query mutation hook

**Database:**

- [x] `meetup_location` (text) and `meetup_time` (timestamptz) columns added to events table
- [x] Migration: `0007_heavy_deathstrike.sql`

**Shared:**

- [x] Updated event schemas with meetup fields (createEventSchema, updateEventSchema)
- [x] Updated Event type with meetupLocation and meetupTime properties

**E2E:**

- [x] Deleted items and restore flow (organizer views deleted section, restores event)
- [x] Meetup location/time displayed on event cards
- [x] Multi-day event badge rendering
- [x] Auto-lock past trips (prevents adding events after trip end date)
- [x] Remove member from trip (organizer removes accepted member)
- [x] Itinerary permissions and validation
- [x] Role-based Playwright selectors for stability

## 🚧 Phase 7: Polish & Testing

- [ ] Add co-organizers post-creation UI (API exists at `POST /trips/:id/co-organizers`, needs dialog in members list)
- [ ] Allow organizers to add member travel on behalf of other members (currently members can only add their own)
- [ ] Entity count limits: max 50 events/trip, max 10 accommodations/trip, max 20 member travel/member (PRD Data Validation — only member limit of 25 is currently enforced)
- [ ] Responsive design refinements
- [ ] Performance optimization (query optimization, caching)
- [ ] Comprehensive test coverage
- [ ] Documentation updates

**Notes:** Error handling (global error boundary, route-level error pages, typed API errors, toasts) and loading states (skeleton pages, component-level loading) are already well-implemented from earlier phases. Trip updates, cancellation, and RSVP changes are already functional from Phases 3 and 5. Phase 6 added auto-lock for past trips, comprehensive E2E tests, and role-based Playwright selectors.

## Future Enhancements (Post-MVP)

- SMS/notification message service (invitation delivery via SMS)
- Rich text editor for descriptions
- Map integration for locations
- Search and filtering
- Notification center UI
- Per-event RSVP tracking
- Cost tracking and split payments
- Comments and discussion threads
- Photo sharing per event
- Calendar export (iCal, Google Calendar)
- Trip templates
- Packing lists
- Weather integration
