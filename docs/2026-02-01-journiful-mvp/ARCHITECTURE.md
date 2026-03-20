---
date: 2026-02-01
topic: Journiful - High-Level Architecture Document (v1)
status: Phase 1-7 Implemented | Frontend Design Overhaul Complete | Mobile UX Fixes Complete
last_updated: 2026-02-14
---

# Journiful - High-Level Architecture

> **Implementation Status**:
>
> - ✅ **Phase 1 Complete**: Monorepo setup with pnpm + Turbo + TypeScript
> - ✅ **Phase 2 Complete**: SMS authentication with full E2E testing
> - ✅ **Phase 3 Complete**: Trip management with CRUD, permissions, co-organizers, and image uploads
> - ✅ **Frontend Design Overhaul Complete**: Mediterranean design system, app shell, accessibility, toast notifications
> - ✅ **Phase 4 Complete**: Itinerary view modes with events, accommodations, member travel, and comprehensive testing
> - ✅ **Mobile UX Fixes Complete**: Touch targets, phone input, compact itinerary header, display names, event counts, FAB
> - ✅ **Phase 5 Complete**: Invitations & RSVP with batch invite, trip preview, members dialog
> - ✅ **Phase 6 Complete**: Advanced itinerary with meetup fields, auto-lock past trips, member removal, deleted items restore, multi-day badges
> - ✅ **Phase 7 Complete**: Polish & Testing — co-organizer promote/demote, member travel delegation, entity count limits, accommodation redesign (datetime + multi-day), responsive design audit, performance optimization, test coverage
>
> **Important**: This document describes the fully implemented system (Phases 1-7). All features, endpoints, and components described below are live in the codebase.

## Implementation Progress

### ✅ Phase 1: Monorepo Setup (Complete)

**Git Commit**: `faeb16c - Phase 1: Monorepo Setup with pnpm + Turbo + TypeScript`

- [x] pnpm workspace configuration with 3 packages (@journiful/api, @journiful/web, @journiful/shared)
- [x] Turbo build orchestration with parallel task execution
- [x] TypeScript 5.7.3 strict mode across all workspaces
- [x] Shared tsconfig.base.json for consistent configuration
- [x] PostgreSQL 16 via Docker Compose (port 5433)
- [x] Drizzle ORM 0.36.4 with schema-first approach
- [x] ESLint + Prettier configuration
- [x] Development scripts for parallel dev servers

### ✅ Phase 2: SMS Authentication (Complete)

**Git Commit**: `1fe5e5e - Phase 2: SMS Authentication with E2E Testing`

**Backend (Fastify):**

- [x] Phone-based authentication with SMS verification codes
- [x] JWT token generation with httpOnly cookies
- [x] Database-backed verification codes (5-minute expiry)
- [x] Rate limiting (5 SMS requests/hour per phone number)
- [x] libphonenumber-js for E.164 phone validation
- [x] Auth middleware with protected routes
- [x] Profile completion flow (displayName + timezone)
- [x] Mock SMS service (console logging for dev/test)
- [x] Comprehensive unit tests (8 test files, all passing)
- [x] Integration tests for all auth endpoints

**Frontend (Next.js 16):**

- [x] Login page with phone number input
- [x] Verification page with 6-digit code entry
- [x] Complete profile page with timezone selection
- [x] Protected dashboard route
- [x] AuthProvider context for global auth state
- [x] Radix UI + shadcn/ui components
- [x] TanStack Query for API state management

**Database Schema:**

- [x] users table (id, phone_number, display_name, timezone, profile_photo_url)
- [x] verification_codes table (phone_number PK, code, expires_at)
- [x] Indexes for phone_number and expires_at
- [x] Migration: `0000_smooth_sharon_ventura.sql`

**E2E Testing (Playwright):**

- [x] Complete authentication journey (login → verify → profile → dashboard)
- [x] Logout flow with cookie cleanup
- [x] Protected route access control
- [x] Existing user skip profile flow
- [x] All tests passing with sequential execution

### ✅ Phase 3: Trip Management (Complete)

**Git Commit**: `2c31b4f - Ralph: Task 30 - Task 7.3: Code review and cleanup`

**Backend (Fastify):**

- [x] Trip CRUD operations (create, read, update, delete/cancel)
- [x] List user's trips with role information (organizer/member)
- [x] Co-organizer management (add/remove)
- [x] Permission service for access control
- [x] Image upload service for trip cover images
- [x] File storage with validation (JPEG/PNG/WebP, max 5MB)
- [x] Comprehensive unit tests for services
- [x] Integration tests for all trip endpoints

**Frontend (Next.js 16):**

- [x] Dashboard with trip list and search functionality
- [x] Trip grouping (Your Trips, Other Trips, Past Trips)
- [x] CreateTripDialog with 2-step form (details + optional cover image)
- [x] EditTripDialog with tabbed interface (Details, Settings, Cover Image, Delete)
- [x] Trip detail page with full information display
- [x] TripCard component for list display
- [x] ImageUpload component with drag-and-drop
- [x] Permission-based UI rendering

**Database Schema:**

- [x] trips table (name, destination, dates, timezone, cover_image_url, settings)
- [x] members table (tracks RSVPs and co-organizer status via status='going')
- [x] Migration: `0001_trip_management.sql`

**Note**: Co-organizers are implemented via the `members` table rather than a separate `organizers` junction table. The trip creator (trips.createdBy) and any member with status='going' are considered co-organizers.

**E2E Testing (Playwright):**

- [x] Trip creation flow (2-step form)
- [x] Trip editing flow (all tabs)
- [x] Permission system tests
- [x] Co-organizer management tests
- [x] All tests passing (902 lines, 4 test suites)

**API Endpoints Implemented:**

- `GET /api/trips` - List user's trips
- `POST /api/trips` - Create new trip
- `GET /api/trips/:id` - Get trip details
- `PUT /api/trips/:id` - Update trip
- `DELETE /api/trips/:id` - Cancel trip
- `POST /api/trips/:id/co-organizers` - Add co-organizer
- `DELETE /api/trips/:id/co-organizers/:userId` - Remove co-organizer
- `POST /api/trips/:id/cover-image` - Upload cover image
- `DELETE /api/trips/:id/cover-image` - Delete cover image

### ✅ Frontend Design Overhaul (Complete)

**Branch**: `ralph/20260207-1019-frontend-design-overhaul`

Comprehensive redesign of the web frontend with a travel-poster-inspired visual identity (Vivid Capri / Mediterranean palette), proper design token system, app shell with navigation, and accessibility fixes.

**Design System:**

- [x] Vivid Capri color palette with CSS custom properties (`@theme` in Tailwind v4)
- [x] Typography: Playfair Display (headlines) + Plus Jakarta Sans (body) via `next/font/google`
- [x] Gradient button variant added to shadcn/ui Button component
- [x] Semantic tokens: `--color-success` (olive green), `--color-warning` (warm amber)
- [x] All hardcoded slate-/gray-/blue- colors migrated to design tokens
- [x] Dark mode CSS variables removed (light-only for now)

**New Components:**

- [x] App shell header (`app-header.tsx`) with navigation, user avatar dropdown, active link states
- [x] Skip link (`skip-link.tsx`) for keyboard accessibility
- [x] shadcn/ui additions: Sonner toasts, AlertDialog, Skeleton, DropdownMenu, Breadcrumb, Avatar, Separator, Tooltip

**Page Redesigns:**

- [x] Landing page: Travel poster aesthetic with Playfair Display wordmark
- [x] Auth layout: Warm cream background replacing dark gradient orbs
- [x] Auth pages: Proper `<h1>` hierarchy, `autocomplete` attributes, design token colors
- [x] Dashboard: Responsive grid layout (1/2/3 columns), Skeleton loading states
- [x] Trip detail: Breadcrumb navigation ("My Trips > {trip.name}"), Sonner toast for success messages

**Accessibility Fixes:**

- [x] Skip link for keyboard navigation
- [x] `<main id="main-content">` landmark on all pages
- [x] Proper heading hierarchy (`<h1>` on auth pages)
- [x] `autocomplete` attributes on form inputs
- [x] `aria-live="polite"` on dynamic content
- [x] Minimum 44px touch targets on icon buttons

**Component Upgrades:**

- [x] TripCard: `<div role="button">` replaced with Next.js `<Link>` (native keyboard + middle-click)
- [x] Trip card badges: Dark frosted glass overlays for readability over images
- [x] Edit trip dialog: Native checkbox replaced with shadcn `<Checkbox>`, inline delete replaced with `<AlertDialog>`
- [x] Image upload: Raw `<button>` replaced with shadcn `<Button>`, increased touch targets
- [x] Inline error/success banners replaced with Sonner `toast.success()` / `toast.error()`

**Testing:**

- [x] New E2E test suite: App shell navigation, user menu, breadcrumbs, skip link (`app-shell.spec.ts`)
- [x] Extracted reusable E2E auth helper (`helpers/auth.ts`)
- [x] Updated existing component tests for markup changes
- [x] Visual regression screenshots for all pages at mobile/tablet/desktop breakpoints

**Bug Fixes:**

- [x] Tailwind v4 `@theme` stripping `hsl()` wrappers → migrated all colors to hex values
- [x] Fixed gradient colors using design tokens
- [x] Fixed DELETE HTTP method in API client
- [x] `coverImageUrl` schema updated to accept relative paths (`/uploads/...`)

### ✅ Phase 4: Itinerary View Modes (Complete)

**Branch**: `ralph/20260207-1612-phase-4-itinerary-views`

Complete itinerary system enabling collaborative trip planning through events, accommodations, and member travel tracking with two view modes and timezone support.

**Backend (Fastify):**

- [x] Events CRUD with soft delete and restore (EventService)
- [x] Accommodations CRUD with soft delete and restore (AccommodationService)
- [x] Member travel CRUD with soft delete and restore (MemberTravelService)
- [x] Extended PermissionsService with fine-grained event/accommodation/travel permissions
- [x] 18 new API endpoints (6 per resource type)
- [x] Zod request validation on all endpoints
- [x] Comprehensive unit tests for all services
- [x] Integration tests for all API endpoints

**Frontend (Next.js 16):**

- [x] Itinerary view with day-by-day and group-by-type modes
- [x] Timezone toggle (trip timezone vs user timezone)
- [x] Event, accommodation, and member travel card components
- [x] Create/edit dialogs for events, accommodations, and member travel
- [x] Delete confirmation with soft delete support
- [x] TanStack Query hooks with optimistic updates
- [x] Permission-based UI rendering (organizer vs member actions)
- [x] Responsive design (mobile, tablet, desktop)

**Database Schema:**

- [x] `events` table with `event_type` enum (travel, meal, activity), soft delete, 4 indexes
- [x] `accommodations` table with date ranges, soft delete, 4 indexes
- [x] `member_travel` table with `member_travel_type` enum (arrival, departure), soft delete, 4 indexes
- [x] Migrations: `0002_mysterious_hercules.sql`, `0003_deep_sinister_six.sql`, `0004_cute_shinobi_shaw.sql`

**Shared Package:**

- [x] Event validation schemas (createEventSchema, updateEventSchema)
- [x] Accommodation validation schemas (createAccommodationSchema, updateAccommodationSchema)
- [x] Member travel validation schemas (createMemberTravelSchema, updateMemberTravelSchema)
- [x] Type definitions for all API responses

**E2E Testing (Playwright):**

- [x] Itinerary flow tests (35 tests: 34 passing, 1 skipped)
- [x] Event creation, editing, and deletion flows
- [x] Accommodation creation flow
- [x] Member travel creation flow
- [x] View mode switching and timezone toggle
- [x] Permission checks and responsive layout
- [x] Manual browser testing with 16 screenshots

**API Endpoints Implemented:**

- `GET /api/trips/:tripId/events` - List events for trip
- `GET /api/events/:id` - Get event details
- `POST /api/trips/:tripId/events` - Create event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Soft delete event
- `POST /api/events/:id/restore` - Restore deleted event
- `GET /api/trips/:tripId/accommodations` - List accommodations
- `GET /api/accommodations/:id` - Get accommodation details
- `POST /api/trips/:tripId/accommodations` - Create accommodation
- `PUT /api/accommodations/:id` - Update accommodation
- `DELETE /api/accommodations/:id` - Soft delete accommodation
- `POST /api/accommodations/:id/restore` - Restore deleted accommodation
- `GET /api/trips/:tripId/member-travel` - List member travel
- `GET /api/member-travel/:id` - Get member travel details
- `POST /api/trips/:tripId/member-travel` - Create member travel
- `PUT /api/member-travel/:id` - Update member travel
- `DELETE /api/member-travel/:id` - Soft delete member travel
- `POST /api/member-travel/:id/restore` - Restore deleted member travel

### ✅ Mobile UX Fixes (Complete)

**Branch**: `ralph/20260208-1118-mobile-ux-fixes`

Comprehensive mobile UX improvements addressing accessibility, data accuracy, user experience, and new input components.

**Accessibility & Touch Targets:**

- [x] All button sizes increased to 44px minimum on mobile (responsive: larger mobile, standard desktop)
- [x] Input fields increased to 44px minimum height on mobile
- [x] Icon buttons meet 44px minimum touch target on mobile
- [x] Toast notifications repositioned to bottom-right with proper z-index (z-60)
- [x] Dialog backdrop stacking fixed

**Data Accuracy Fixes:**

- [x] Event count on trip cards now computed dynamically from database (was hardcoded to 0)
- [x] Event count excludes soft-deleted events via `isNull(events.deletedAt)` filter
- [x] Trip detail page calculates active event count from fetched events
- [x] Backend batch event counting query added to `TripService.getUserTrips()`

**Phone Input Component:**

- [x] New `PhoneInput` component (`apps/web/src/components/ui/phone-input.tsx`)
- [x] International phone number support with country flag dropdown
- [x] Custom-styled country selector matching design system
- [x] Uses `react-phone-number-input` library (v3.4.14)
- [x] Integrated into login page (replaces plain text input)
- [x] Verify page displays formatted phone number via `formatPhoneNumber()` utility

**Itinerary Header Redesign:**

- [x] Compact single-row layout replacing multi-row flex columns
- [x] View mode toggle changed to icon-only buttons (Calendar, List) with tooltips
- [x] Timezone selector changed from toggle buttons to dropdown (Select component)
- [x] Timezone dropdown: trip timezone pinned at top, user timezone shown if different, all IANA timezones grouped
- [x] Inline action buttons replaced with floating action button (FAB)
- [x] FAB: fixed bottom-right, gradient background, 56×56px, dropdown menu with Event/Accommodation/Travel actions
- [x] FAB plus icon rotates 45° when menu is open

**Display Name Improvements:**

- [x] Member travel API now joins `users` table to return `memberName` field
- [x] `MemberTravel` type extended with optional `memberName` property
- [x] Event cards show creator display name instead of UUID
- [x] Accommodation cards show creator display name instead of UUID
- [x] Day-by-day view shows member names for arrivals/departures
- [x] Group-by-type view shows member names consistently
- [x] User name lookup map created from trip organizer data

**Visual Polish:**

- [x] Trip card cover image placeholder: gradient with centered `ImagePlus` icon
- [x] Trip card badges (Going, Maybe, Not Going, Organizing) visible on both real and placeholder images
- [x] Create trip dialog: added bottom padding for mobile scroll clearance

**New Utilities:**

- [x] `formatPhoneNumber()` in `apps/web/src/lib/format.ts` - E.164 to international display format

**Testing:**

- [x] New unit tests: Button, Input, Dialog, Sonner components
- [x] Updated tests: Login, Verify, ItineraryHeader, ItineraryView, TripCard, CreateTripDialog
- [x] Updated backend tests: trip.routes, trip.service integration tests
- [x] Updated E2E tests: auth-journey, itinerary-journey, app-shell, trip-journey
- [x] Visual regression screenshots for all pages at mobile and desktop breakpoints

**New Dependency:**

- `react-phone-number-input` v3.4.14 (apps/web)

### ✅ Phase 5: Invitations & RSVP (Complete)

**Branch**: `ralph/20260209-0857-invitations-rsvp`

Complete invitation and RSVP system enabling organizers to invite members by phone number, with trip preview for invitees, RSVP management, and a members dialog replacing the old tab layout.

**Backend (Fastify):**

- [x] InvitationService with batch invite, RSVP update, and pending invitation processing
- [x] `isOrganizer` column on members table replacing role-based permission checks
- [x] Trip preview mode: invited-but-not-accepted users see limited trip info
- [x] Response schemas added to all Fastify routes (auth, trips, events, accommodations, member travel)
- [x] Rate limiting middleware (`defaultRateLimitConfig`, `writeRateLimitConfig`) on all routes
- [x] N+1 query optimization in `processPendingInvitations`
- [x] Explicit column selection in accommodation queries
- [x] Comprehensive unit tests (InvitationService, PermissionsService updates)
- [x] Integration tests for all invitation/RSVP endpoints

**Frontend (Next.js 16):**

- [x] InviteMembersDialog with batch phone number input and send flow
- [x] TripPreview component with "You've been invited!" banner and RSVP buttons (Going/Maybe/Not Going)
- [x] MembersList component displayed in dialog (replacing old tab-based layout)
- [x] RsvpBadge component with status-specific colors (green=Going, amber=Maybe, gray=Not Going)
- [x] Trip detail refactored to single-page layout with members dialog, no tabs
- [x] Trip error and not-found pages with skeleton Suspense fallback
- [x] "Member no longer attending" indicator on event cards
- [x] TanStack Query hooks for invitations, RSVP, members
- [x] `getInitials` utility deduplicated, per-query `staleTime` added
- [x] Header hydration fix

**Database Schema:**

- [x] `invitations` table (id, trip_id, inviter_id, invitee_phone, status, created_at, updated_at)
- [x] `isOrganizer` boolean column added to members table
- [x] Migration: `0005_early_zemo.sql`

**Shared Package:**

- [x] Invitation schemas: `createInvitationsSchema`, `updateRsvpSchema`
- [x] Invitation types: `Invitation`, `MemberWithProfile`, `TripPreview`
- [x] Response schemas: `createInvitationsResponseSchema`, `getInvitationsResponseSchema`, `getMembersResponseSchema`, `updateRsvpResponseSchema`
- [x] Canonical `PHONE_REGEX` extracted to `shared/schemas/phone.ts`
- [x] Response schemas added for auth, event, accommodation, member-travel, trip routes

**E2E Testing (Playwright):**

- [x] Invitation journey: organizer invites via dialog, invitee sees preview, RSVPs Going
- [x] RSVP status change and "member no longer attending" indicator
- [x] Members dialog with status badges and invite button
- [x] Uninvited user 404 access control
- [x] Invitation API helper utilities (`inviteViaAPI`, `rsvpViaAPI`, `inviteAndAcceptViaAPI`)
- [x] 15 total E2E tests, all passing

**API Endpoints Implemented:**

- `GET /api/trips/:tripId/invitations` - List invitations (organizer only)
- `GET /api/trips/:tripId/members` - List trip members with profiles
- `POST /api/trips/:tripId/invitations` - Send batch invitations by phone
- `POST /api/trips/:tripId/rsvp` - Update RSVP status (going/maybe/not_going)
- `DELETE /api/invitations/:id` - Revoke invitation (organizer only)

### ✅ Phase 6: Advanced Itinerary & Trip Management (Complete)

**Branch**: `ralph/20260212-2332-phase-6-advanced-itinerary`

Complete implementation of advanced itinerary features including meetup coordination, trip lifecycle management, member removal, deleted items restoration, and multi-day event display.

**Backend (Fastify):**

- [x] Meetup fields added to events: `meetup_location` (text) and `meetup_time` (timestamptz)
- [x] Auto-lock past trips via `isTripLocked()` in PermissionsService (checks trip end date)
- [x] `TripLockedError` enforced in EventService, AccommodationService, MemberTravelService
- [x] Remove member endpoint: `DELETE /api/trips/:tripId/members/:memberId`
- [x] `removeMember()` in InvitationService with transactional cleanup
- [x] Comprehensive unit and integration tests

**Frontend (Next.js 16):**

- [x] Meetup location/time fields in event create/edit dialogs
- [x] Meetup info displayed on event cards (blue info box with group icon)
- [x] Deleted items section at bottom of itinerary (organizer-only) with restore buttons
- [x] Multi-day event badges in both day-by-day and group-by-type views
- [x] Past trip read-only UI (FAB hidden, edit/delete buttons disabled, lock indicator)
- [x] Remove member button in members dialog (organizer only)
- [x] `useRemoveMember` TanStack Query mutation hook

**Database Schema:**

- [x] `meetup_location` (text) and `meetup_time` (timestamptz) columns on events table
- [x] Migration: `0007_heavy_deathstrike.sql`

**Shared Package:**

- [x] Updated event schemas with meetup fields (createEventSchema, updateEventSchema)
- [x] Updated Event type with meetupLocation and meetupTime properties

**E2E Testing (Playwright):**

- [x] Deleted items and restore flow
- [x] Meetup location/time displayed on event cards
- [x] Multi-day event badge rendering
- [x] Auto-lock past trips (prevents mutations after trip end date)
- [x] Remove member from trip
- [x] Itinerary permissions and validation
- [x] Role-based Playwright selectors for test stability

**API Endpoints Implemented:**

- `DELETE /api/trips/:tripId/members/:memberId` - Remove member from trip (organizer only)

**Note:** All existing itinerary endpoints (events, accommodations, member travel) now enforce `isTripLocked()` checks to prevent modifications to past trips.

### ✅ Phase 7: Polish & Testing (Complete)

**Features Implemented:**

- [x] Co-organizer promote/demote: `PATCH /api/trips/:tripId/members/:memberId` with `{ isOrganizer: boolean }`
- [x] Member travel delegation: Organizers can add member travel on behalf of any trip member via optional `memberId` field
- [x] Entity count limits: Max 50 events/trip, max 10 accommodations/trip, max 20 travel entries/member
- [x] Accommodation redesign: Converted checkIn/checkOut from DATE to TIMESTAMP WITH TIMEZONE, accommodations now span all days between check-in and check-out
- [x] Responsive design audit: Fixed 11 issues across 13 files at 375px/768px/1024px breakpoints
- [x] Backend performance optimization: 5 composite database indexes, `*WithData` permission methods, `Promise.all()` parallelization, JOIN queries (40-60% query reduction on update/delete endpoints)
- [x] Frontend performance optimization: Scoped TanStack Query invalidations, increased staleTime for stable data, `React.memo` + `useCallback` for list-rendered cards, conditional ReactQueryDevtools, `date-fns` tree-shaking
- [x] Test coverage: 25 new unit tests for PermissionsService `*WithData` methods, 5 E2E test fixes

**Error Codes Added:**

- `CANNOT_DEMOTE_CREATOR` (400) — Cannot change the role of the trip creator
- `CANNOT_MODIFY_OWN_ROLE` (400) — Cannot modify your own organizer role
- `EVENT_LIMIT_EXCEEDED` (400) — Maximum 50 events per trip reached
- `ACCOMMODATION_LIMIT_EXCEEDED` (400) — Maximum 10 accommodations per trip reached
- `MEMBER_TRAVEL_LIMIT_EXCEEDED` (400) — Maximum 20 travel entries per member reached

**Database Changes:**

- Migration `0009_*`: Converted `check_in`/`check_out` columns from DATE to TIMESTAMP WITH TIMEZONE
- Migration `0010_*`: Added 5 composite indexes for query performance
  - `events_trip_id_deleted_at_idx` on `events(tripId, deletedAt)`
  - `accommodations_trip_id_deleted_at_idx` on `accommodations(tripId, deletedAt)`
  - `member_travel_member_id_deleted_at_idx` on `memberTravel(memberId, deletedAt)`
  - `member_travel_trip_id_deleted_at_idx` on `memberTravel(tripId, deletedAt)`
  - `members_trip_id_is_organizer_idx` on `members(tripId, isOrganizer)`

**API Endpoints Added:**

- `PATCH /api/trips/:tripId/members/:memberId` — Promote/demote co-organizer (organizer only)

---

## Table of Contents

1. [Implementation Progress](#implementation-progress)
2. [System Overview](#system-overview)
3. [Architecture Diagram](#architecture-diagram)
4. [Technology Stack](#technology-stack)
5. [System Components](#system-components)
6. [Data Model](#data-model)
7. [API Design](#api-design)
8. [Authentication Flow](#authentication-flow)
9. [Key Features Implementation](#key-features-implementation)
10. [Development Practices](#development-practices)
11. [Testing Strategy](#testing-strategy)
12. [Security Considerations](#security-considerations)
13. [Performance Considerations](#performance-considerations)

---

## System Overview

Journiful is a collaborative trip planning platform that enables group travel coordination through shared itineraries. The system follows a modern client-server architecture with a **Next.js frontend** and a **Fastify backend API**, backed by **PostgreSQL** with **Drizzle ORM**.

### Architecture Style

- **Client-Server Architecture**: Clear separation between frontend and backend
- **RESTful API**: HTTP-based API following REST principles
- **Server-Side Rendering (SSR)**: Next.js App Router with React Server Components
- **Service-Oriented**: Modular service layer for business logic

### Core Requirements

- Mobile-first responsive web application
- Phone-based authentication with SMS verification
- Real-time timezone handling (store UTC, display in trip/local timezone)
- Collaborative itinerary editing with permission system
- Soft delete support for data recovery
- Support for up to 25 members per trip, 50 events per trip

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         Next.js 16 App Router (TypeScript)              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │   Pages      │  │  Components  │  │   App State  │  │   │
│  │  │  (RSC + CC)  │  │   (React)    │  │  (TanStack)  │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              │ HTTP/REST                         │
│                              ▼                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         API LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Fastify Server (TypeScript)                   │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │   Routes     │  │  Controllers │  │  Middleware  │  │   │
│  │  │  (REST API)  │  │              │  │  (Auth/CORS) │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Service Layer (Business Logic)             │   │
│  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌─────────┐  │   │
│  │  │ Trip  │ │ Event │ │ Auth  │ │Invite │ │ Storage │  │   │
│  │  │Service│ │Service│ │Service│ │Service│ │ Service │  │   │
│  │  └───────┘ └───────┘ └───────┘ └───────┘ └─────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │        Drizzle ORM (Type-Safe Query Builder)            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │   Schema     │  │  Migrations  │  │   Queries    │  │   │
│  │  │ Definitions  │  │              │  │  (Type-Safe) │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PostgreSQL 16 Database                      │   │
│  │   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐          │   │
│  │   │ Users  │ │ Trips  │ │ Events │ │ RSVPs  │  ...     │   │
│  │   └────────┘ └────────┘ └────────┘ └────────┘          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES (MVP)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │  SMS Service │  │File Storage  │                             │
│  │  (Mock Dev)  │  │  (Abstract)  │                             │
│  └──────────────┘  └──────────────┘                             │
│                                                                   │
│  Note: Verification codes stored in database for MVP             │
│  Production: Redis for distributed caching (optional)            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend

- **Framework**: Next.js 16 (App Router with React Server Components)
- **Language**: TypeScript 5.7.3
- **UI Library**: React 19
- **Styling**: Tailwind CSS 4.x
- **UI Components**: shadcn/ui (copy-paste component library)
  - Built on Radix UI primitives
  - Fully customizable and accessible
  - Includes Dialog, Form, Input, Button, Card, etc.
- **State Management**: TanStack Query v5 (React Query)
- **Form Handling**: React Hook Form + Zod validation
- **Validation**: Zod (shared with backend)
- **Date/Time**: date-fns + date-fns-tz (timezone handling)

### Backend

- **Runtime**: Node.js 22.x (LTS)
- **Framework**: Fastify v5.x
- **Language**: TypeScript 5.7.3
- **ORM**: Drizzle ORM v0.36+
- **Database**: PostgreSQL 16+
- **Validation**: Zod (shared with frontend)
- **Authentication**: Custom JWT implementation with database-backed verification codes

### External Services (MVP - Mocked)

- **SMS Provider**: Mock SMS service (console logging)
  - Production: Twilio or AWS SNS
- **File Storage**: Abstract storage adapter (in-memory for MVP)
  - Interface compatible with S3, Cloudinary, local filesystem
  - Production: AWS S3 with presigned URLs

### Development Tools

- **Testing**: Vitest (unit tests) + Playwright (E2E tests)
- **API Testing**: MSW (Mock Service Worker) for frontend
- **Linting**: ESLint 9.x (flat config)
- **Type Checking**: TypeScript strict mode
- **Git Hooks**: Husky + lint-staged
- **Package Manager**: pnpm (workspace support)

---

## System Components

### 1. Frontend Application (Next.js)

#### Directory Structure

```
apps/web/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth routes group
│   │   ├── login/
│   │   └── verify/
│   ├── (app)/                    # Authenticated routes group
│   │   ├── dashboard/
│   │   ├── trips/[id]/
│   │   │   ├── page.tsx          # Trip itinerary view
│   │   │   ├── edit/
│   │   │   └── settings/
│   │   └── create-trip/
│   ├── layout.tsx                # Root layout with providers
│   ├── providers.tsx             # TanStack Query provider
│   └── globals.css
├── components/
│   ├── ui/                       # shadcn/ui components (Dialog, Button, Input, etc.)
│   ├── trip/                     # Trip-specific components
│   ├── event/                    # Event components
│   └── forms/                    # Form components
├── lib/
│   ├── api/                      # API client functions
│   ├── hooks/                    # Custom React hooks
│   ├── utils.ts                  # Utility functions (includes cn() from shadcn)
│   └── schemas/                  # Zod validation schemas
├── types/
│   └── api.ts                    # API response types
├── components.json               # shadcn/ui configuration
└── public/
    └── assets/
```

#### shadcn/ui Setup

shadcn/ui is a collection of re-usable components built with Radix UI and Tailwind CSS. Components are copied directly into your codebase for full customization.

**Installation:**

```bash
# Initialize shadcn/ui in Next.js project
npx shadcn@latest init

# Add components as needed
npx shadcn@latest add dialog
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add form
npx shadcn@latest add card
npx shadcn@latest add select
npx shadcn@latest add calendar
npx shadcn@latest add popover
```

**Configuration (components.json):**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

**Key Components for Journiful:**

- `Dialog` - Event creation, trip settings
- `Form` - All forms with React Hook Form integration
- `Input`, `Textarea` - Form fields
- `Button` - CTAs and actions
- `Card` - Trip cards, event cards
- `Select` - Dropdowns (timezone, event type)
- `Calendar` + `Popover` - Date pickers
- `Badge` - Event types, RSVP status
- `Avatar` - User profiles

#### Key Features

**React Server Components (RSC)**

- Initial page loads with server-rendered content
- Automatic code splitting and optimization
- Direct database access in server components (for public data)
- Reduced client bundle size

**Client Components**

- Interactive UI elements (forms, modals, animations)
- TanStack Query for data fetching and caching
- Optimistic updates for better UX
- Real-time timezone conversion

**TanStack Query Integration**

```typescript
// app/providers.tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        gcTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  })
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = makeQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
```

#### Routing Strategy

- `/` - Landing page (public)
- `/login` - Phone authentication
- `/verify` - SMS code verification
- `/dashboard` - User's trip list
- `/trips/[id]` - Trip itinerary view (requires RSVP)
- `/trips/[id]/settings` - Trip settings (organizer only)
- `/create-trip` - Create new trip

**Modal/Dialog Patterns:**

- Events, accommodations, and member travel are created via **shadcn/ui Dialog** components (not routes)
- Edit operations also use dialogs for better UX
- Reduces navigation complexity and provides better mobile experience

### 2. Backend API (Fastify)

#### Directory Structure

```
apps/api/
├── src/
│   ├── app.ts                    # buildApp() factory - configures and returns FastifyInstance
│   ├── server.ts                 # Production server entry (calls buildApp, listens, graceful shutdown)
│   ├── errors.ts                 # Typed errors via @fastify/error (UnauthorizedError, TripNotFoundError, etc.)
│   ├── config/
│   │   ├── database.ts           # Drizzle config
│   │   ├── env.ts                # Zod-validated environment variables
│   │   └── jwt.ts                # JWT configuration
│   ├── plugins/                  # Fastify plugins (dependency injection via fastify.decorate)
│   │   ├── config.ts             # fastify.config - validated env
│   │   ├── database.ts           # fastify.db - Drizzle instance
│   │   ├── auth-service.ts       # fastify.authService
│   │   ├── permissions-service.ts # fastify.permissionsService
│   │   ├── trip-service.ts       # fastify.tripService
│   │   ├── upload-service.ts     # fastify.uploadService
│   │   ├── sms-service.ts        # fastify.smsService
│   │   ├── health-service.ts     # fastify.healthService
│   │   ├── event-service.ts      # ✅ fastify.eventService
│   │   ├── accommodation-service.ts # ✅ fastify.accommodationService
│   │   └── member-travel-service.ts # ✅ fastify.memberTravelService
│   ├── routes/
│   │   ├── auth.routes.ts        # Zod schema validation + rate limiting
│   │   ├── trip.routes.ts        # Scoped hooks for auth + profile completion
│   │   ├── health.routes.ts      # /health, /health/live, /health/ready
│   │   ├── event.routes.ts       # ✅ Events CRUD + soft delete/restore
│   │   ├── accommodation.routes.ts # ✅ Accommodations CRUD + soft delete/restore
│   │   ├── member-travel.routes.ts # ✅ Member travel CRUD + soft delete/restore
│   │   └── invitation.routes.ts   # ✅ Invitations, RSVP, member removal
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── trip.controller.ts
│   │   ├── health.controller.ts
│   │   └── ...
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── trip.service.ts       # Transactions, pagination, column selection
│   │   ├── sms.service.ts        # Mock SMS (console logging for dev/test)
│   │   ├── upload.service.ts     # File upload with validation
│   │   └── permissions.service.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts    # JWT verification + profile completion check
│   │   ├── error.middleware.ts   # Handles Zod, rate limit, JWT, multipart, DB constraint errors
│   │   └── rate-limit.middleware.ts # SMS (5/hr) and verify code (10/15min) rate limits
│   ├── db/
│   │   ├── schema/
│   │   │   ├── index.ts           # ✅ Table definitions (users, verification_codes, trips, members, events, accommodations, member_travel)
│   │   │   └── relations.ts       # ✅ Drizzle relations (users↔trips↔members↔events↔accommodations↔member_travel)
│   │   │                          # ✅ invitations table
│   │   └── migrations/
│   ├── types/
│   │   └── index.ts              # FastifyInstance type augmentation (config, db, services)
│   └── utils/
│       └── phone.ts              # Phone number formatting
├── tests/
│   ├── unit/
│   ├── integration/
│   └── helpers.ts                # Test helpers using buildApp()
└── package.json
```

#### Fastify Configuration

**Plugin Architecture with `buildApp()`**

The API uses a `buildApp()` factory pattern for testable server setup. All services are registered as Fastify plugins using `fastify-plugin` and injected via `fastify.decorate()`.

```typescript
// src/app.ts - Configures and returns a fully wired FastifyInstance
export async function buildApp(
  opts: BuildAppOptions,
): Promise<FastifyInstance> {
  const fastify = Fastify(opts.fastify);

  // 1. Core plugins (config must be first, database depends on config)
  await fastify.register(configPlugin);
  await fastify.register(databasePlugin);

  // 2. Security & middleware plugins
  await fastify.register(cors, {
    origin: fastify.config.FRONTEND_URL,
    credentials: true,
  });
  await fastify.register(helmet, { contentSecurityPolicy: false });
  await fastify.register(rateLimit, { max: 100, timeWindow: "15 minutes" });
  await fastify.register(jwt, { secret: fastify.config.JWT_SECRET });
  await fastify.register(cookie);
  await fastify.register(multipart, {
    limits: { fileSize: fastify.config.MAX_FILE_SIZE },
  });

  // 3. Service plugins (decorated onto fastify instance)
  await fastify.register(authServicePlugin);
  await fastify.register(tripServicePlugin);
  await fastify.register(permissionsServicePlugin);
  await fastify.register(uploadServicePlugin);
  await fastify.register(smsServicePlugin);
  await fastify.register(healthServicePlugin);

  // 4. Error handler + routes
  fastify.setErrorHandler(errorHandler);
  await fastify.register(healthRoutes, { prefix: "/api/health" });
  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.register(tripRoutes, { prefix: "/api/trips" });
  await fastify.register(eventRoutes, { prefix: "/api" });
  await fastify.register(accommodationRoutes, { prefix: "/api" });
  await fastify.register(memberTravelRoutes, { prefix: "/api" });
  await fastify.register(invitationRoutes, { prefix: "/api" });
  await fastify.register(userRoutes, { prefix: "/api/users" });

  return fastify;
}
```

```typescript
// src/server.ts - Production entry point
const app = await buildApp({
  fastify: { logger: { level: config.LOG_LEVEL } },
});
await app.listen({ port: config.PORT, host: config.HOST });

// Graceful shutdown via close-with-grace
```

**Registered Fastify Plugins**

- `@fastify/cors` - CORS handling (allows frontend origin)
- `@fastify/jwt` - JWT authentication with httpOnly cookies
- `@fastify/rate-limit` - Rate limiting (global + per-endpoint)
- `@fastify/helmet` - Security headers (CSP, HSTS, etc.)
- `@fastify/multipart` - File uploads with size limits
- `@fastify/cookie` - Cookie parsing for JWT
- `@fastify/under-pressure` - Health monitoring
- `@fastify/static` - Static file serving (uploads)
- `@fastify/error` - Typed error creation
- `@fastify/swagger` - API documentation (future)

### 3. Database Layer (PostgreSQL + Drizzle ORM)

#### Drizzle Configuration

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

#### Schema Examples

**Users Table**

```typescript
// src/db/schema/users.ts
import { pgTable, uuid, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull().unique(),
  displayName: varchar("display_name", { length: 50 }).notNull(),
  profilePhotoUrl: text("profile_photo_url"),
  timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

**Verification Codes Table**

```typescript
// src/db/schema/verification_codes.ts
import { pgTable, varchar, timestamp } from "drizzle-orm/pg-core";

export const verificationCodes = pgTable("verification_codes", {
  phoneNumber: varchar("phone_number", { length: 20 }).primaryKey(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type VerificationCode = typeof verificationCodes.$inferSelect;
export type NewVerificationCode = typeof verificationCodes.$inferInsert;
```

**Members Table (trip membership and RSVP status)**

```typescript
// src/db/schema/members.ts
import { pgTable, uuid, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { trips, users } from ".";

export const rsvpStatusEnum = pgEnum("rsvp_status", [
  "going",
  "not_going",
  "maybe",
  "no_response",
]);

export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: rsvpStatusEnum("status").notNull().default("no_response"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
```

**Note:** The `members` table represents trip membership and RSVP status. When a user is invited, a member record is created with status `no_response`. This table serves dual purpose: membership tracking and response status.

**Trips Table**

```typescript
// src/db/schema/trips.ts
import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const trips = pgTable("trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  destination: text("destination").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  preferredTimezone: varchar("preferred_timezone", { length: 100 }).notNull(),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  allowMembersToAddEvents: boolean("allow_members_to_add_events")
    .notNull()
    .default(true),
  cancelled: boolean("cancelled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;
```

**Events Table**

```typescript
// src/db/schema/events.ts
import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  time,
  timestamp,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { trips, users } from ".";

export const eventTypeEnum = pgEnum("event_type", [
  "travel",
  "meal",
  "activity",
]);

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  eventType: eventTypeEnum("event_type").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  startTime: time("start_time"),
  endTime: time("end_time"),
  allDay: boolean("all_day").notNull().default(false),
  location: varchar("location", { length: 500 }),
  meetupLocation: text("meetup_location"),
  meetupTime: timestamp("meetup_time", { withTimezone: true }),
  description: text("description"),
  links: text("links").array(),
  isOptional: boolean("is_optional").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
```

**Accommodations Table**

```typescript
// src/db/schema/accommodations.ts
import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { trips } from ".";

export const accommodations = pgTable("accommodations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  address: text("address"),
  checkInDate: date("check_in_date"),
  checkOutDate: date("check_out_date"),
  description: text("description"),
  links: text("links").array(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Accommodation = typeof accommodations.$inferSelect;
export type NewAccommodation = typeof accommodations.$inferInsert;
```

**Travel Table (member arrivals/departures)**

```typescript
// src/db/schema/travel.ts
import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  time,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { trips, members } from ".";

export const travelTypeEnum = pgEnum("travel_type", ["arrival", "departure"]);

export const travel = pgTable("travel", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  travelType: travelTypeEnum("travel_type").notNull(),
  date: date("date").notNull(),
  departingFrom: varchar("departing_from", { length: 200 }),
  departureTime: time("departure_time"),
  arrivingAt: varchar("arriving_at", { length: 200 }),
  arrivalTime: time("arrival_time"),
  travelMethod: varchar("travel_method", { length: 100 }),
  details: text("details"),
  links: text("links").array(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Travel = typeof travel.$inferSelect;
export type NewTravel = typeof travel.$inferInsert;
```

#### Relationships Definition

```typescript
// src/db/schema/index.ts
import { relations } from "drizzle-orm";
import * as schema from ".";

export const usersRelations = relations(schema.users, ({ many }) => ({
  tripsCreated: many(schema.trips),
  eventsCreated: many(schema.events),
  members: many(schema.members),
}));

export const tripsRelations = relations(schema.trips, ({ one, many }) => ({
  creator: one(schema.users, {
    fields: [schema.trips.createdBy],
    references: [schema.users.id],
  }),
  events: many(schema.events),
  accommodations: many(schema.accommodations),
  members: many(schema.members),
  travel: many(schema.travel),
  invitations: many(schema.invitations),
}));

export const eventsRelations = relations(schema.events, ({ one }) => ({
  trip: one(schema.trips, {
    fields: [schema.events.tripId],
    references: [schema.trips.id],
  }),
  creator: one(schema.users, {
    fields: [schema.events.createdBy],
    references: [schema.users.id],
  }),
}));

export const membersRelations = relations(schema.members, ({ one, many }) => ({
  user: one(schema.users, {
    fields: [schema.members.userId],
    references: [schema.users.id],
  }),
  trip: one(schema.trips, {
    fields: [schema.members.tripId],
    references: [schema.trips.id],
  }),
  travel: many(schema.travel),
}));

export const travelRelations = relations(schema.travel, ({ one }) => ({
  trip: one(schema.trips, {
    fields: [schema.travel.tripId],
    references: [schema.trips.id],
  }),
  member: one(schema.members, {
    fields: [schema.travel.memberId],
    references: [schema.members.id],
  }),
}));
```

#### Database Queries with Drizzle

```typescript
// Example: Get trip with events and creator info
import { db } from "@/config/database";
import { trips, events, users } from "@/db/schema";
import { eq } from "drizzle-orm";

const tripWithDetails = await db
  .select({
    trip: trips,
    creator: users,
  })
  .from(trips)
  .leftJoin(users, eq(trips.createdBy, users.id))
  .where(eq(trips.id, tripId))
  .limit(1);

const tripEvents = await db
  .select()
  .from(events)
  .where(eq(events.tripId, tripId))
  .orderBy(events.startDate, events.startTime);
```

### 4. Service Layer (Business Logic)

#### Abstract Service Interfaces

**SMS Service**

```typescript
// src/services/sms.service.ts
export interface ISMSService {
  sendVerificationCode(phoneNumber: string, code: string): Promise<void>;
  sendInvitation(
    phoneNumber: string,
    tripName: string,
    tripLink: string,
  ): Promise<void>;
  sendTripUpdate(phoneNumber: string, message: string): Promise<void>;
  sendCancellation(phoneNumber: string, tripName: string): Promise<void>;
}

// Mock implementation for MVP
export class MockSMSService implements ISMSService {
  async sendVerificationCode(phoneNumber: string, code: string) {
    console.log(`[MOCK SMS] Verification code for ${phoneNumber}: ${code}`);
    // In development: Also log to a file or display in UI
  }

  async sendInvitation(
    phoneNumber: string,
    tripName: string,
    tripLink: string,
  ) {
    console.log(`[MOCK SMS] Invitation to ${phoneNumber}:`);
    console.log(`You've been invited to ${tripName}! ${tripLink}`);
  }

  async sendTripUpdate(phoneNumber: string, message: string) {
    console.log(`[MOCK SMS] Trip update to ${phoneNumber}: ${message}`);
  }

  async sendCancellation(phoneNumber: string, tripName: string) {
    console.log(
      `[MOCK SMS] Cancellation to ${phoneNumber}: ${tripName} has been cancelled`,
    );
  }
}

// Future Twilio implementation
export class TwilioSMSService implements ISMSService {
  // Real implementation with Twilio SDK
}
```

**Storage Service**

```typescript
// src/services/storage.service.ts
export interface IStorageService {
  uploadFile(file: Buffer, filename: string, mimeType: string): Promise<string>;
  deleteFile(url: string): Promise<void>;
  getSignedUrl(url: string, expiresIn?: number): Promise<string>;
}

// Mock implementation for MVP
export class MockStorageService implements IStorageService {
  private files = new Map<string, Buffer>();

  async uploadFile(file: Buffer, filename: string, mimeType: string) {
    const fileId = `mock-${Date.now()}-${filename}`;
    this.files.set(fileId, file);
    return `http://localhost:8000/mock-storage/${fileId}`;
  }

  async deleteFile(url: string) {
    const fileId = url.split("/").pop()!;
    this.files.delete(fileId);
  }

  async getSignedUrl(url: string, expiresIn = 3600) {
    return `${url}?expires=${Date.now() + expiresIn * 1000}`;
  }
}

// Future S3 implementation
export class S3StorageService implements IStorageService {
  // Real implementation with AWS SDK
}
```

#### Permission Service

```typescript
// src/services/permissions.service.ts
export class PermissionsService {
  // Check if user is organizer
  // An organizer is either:
  // 1. The trip creator (trips.createdBy)
  // 2. A co-organizer (member with status='going')
  async isOrganizer(userId: string, tripId: string): Promise<boolean> {
    const result = await db
      .select({
        tripId: trips.id,
        createdBy: trips.createdBy,
        memberUserId: members.userId,
        memberStatus: members.status,
      })
      .from(trips)
      .leftJoin(
        members,
        and(
          eq(members.tripId, trips.id),
          eq(members.userId, userId),
          eq(members.status, "going"),
        ),
      )
      .where(
        and(
          eq(trips.id, tripId),
          or(
            eq(trips.createdBy, userId), // User is the creator
            eq(members.userId, userId), // User is a co-organizer (status='going')
          ),
        ),
      )
      .limit(1);

    return result.length > 0;
  }

  // Check if user can add events
  async canAddEvent(userId: string, tripId: string): Promise<boolean> {
    // Must have "Going" RSVP status
    const member = await db
      .select()
      .from(members)
      .where(
        and(
          eq(members.userId, userId),
          eq(members.tripId, tripId),
          eq(members.status, "going"),
        ),
      )
      .limit(1);

    if (member.length === 0) return false;

    // Check if trip allows members to add events OR user is organizer
    const trip = await db
      .select({ allowMembersToAddEvents: trips.allowMembersToAddEvents })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!trip[0]) return false;

    if (trip[0].allowMembersToAddEvents) return true;

    // If setting is disabled, only organizers can add
    return await this.isOrganizer(userId, tripId);
  }

  // Check if user can edit event
  async canEditEvent(userId: string, eventId: string): Promise<boolean> {
    const event = await db
      .select({
        createdBy: events.createdBy,
        tripId: events.tripId,
      })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event[0]) return false;

    // Creator can edit their own events (if still Going)
    if (event[0].createdBy === userId) {
      const member = await db
        .select()
        .from(members)
        .where(
          and(
            eq(members.userId, userId),
            eq(members.tripId, event[0].tripId),
            eq(members.status, "going"),
          ),
        )
        .limit(1);

      return member.length > 0;
    }

    // Organizers can edit any event
    return await this.isOrganizer(userId, event[0].tripId);
  }
}
```

---

## Data Model

### Entity Relationship Diagram

```
┌──────────────┐            ┌──────────────┐
│    Users     │            │    Trips     │
├──────────────┤            ├──────────────┤
│ id (PK)      │◄───────────┤ created_by   │
│ phone_number │            │ id (PK)      │
│ display_name │            │ name         │
│ timezone     │            │ destination  │
└──────────────┘            │ start_date   │
       │                    │ end_date     │
       │                    │ timezone     │
       │                    └──────────────┘
       │                           │
       │                           │
       │                    ┌──────┴───────┐
       │                    │              │
       │              ┌─────▼────┐   ┌────▼─────┐
       │              │ Events   │   │ Members  │
       │              ├──────────┤   ├──────────┤
       └──────────────┤created_by│   │id (PK)   │
                      │trip_id   │   │user_id   │
                      │type      │   │trip_id   │
                      │title     │   │status    │
                      │date/time │   └──────────┘
                      └──────────┘         │
                            │              │
                      ┌─────┴──────────────┴──┐
                      │                       │
              ┌───────▼──────┐  ┌────────────▼─┐
              │Accommodations│  │Member Travel │
              ├──────────────┤  ├──────────────┤
              │trip_id       │  │trip_id       │
              │name          │  │member_id (FK)│
              │address       │  │travel_type   │
              │check_in      │  │date/times    │
              └──────────────┘  └──────────────┘
```

### Core Tables

See [Database Layer](#3-database-layer-postgresql--drizzle-orm) section for detailed schema definitions.

**Primary Tables:**

1. ✅ `users` - User accounts
2. ✅ `verification_codes` - Phone verification codes with expiry
3. ✅ `trips` - Trip information
4. ✅ `members` - **Trip membership, RSVP status, and co-organizer tracking** (combined entity)
5. ✅ `invitations` - Trip invitations by phone with batch invite flow
6. ✅ `events` - Itinerary events with event_type enum (travel, meal, activity) and soft delete
7. ✅ `accommodations` - Multi-day lodging with date ranges and soft delete
8. ✅ `member_travel` - Individual member arrivals/departures with soft delete

**Note on Members:** The `members` table serves as the trip membership table. When a user is invited, a member record is created, making them a trip member. The `status` field tracks their RSVP response (going/not_going/maybe/no_response). This design keeps membership and status in sync.

**Note on Co-Organizers:** Co-organizers are identified by the `isOrganizer` boolean column on the members table. The trip creator (trips.createdBy) is automatically an organizer, and additional co-organizers are flagged via `isOrganizer = true`. This explicit column replaced the earlier role-based approach for clearer permission checks.

**Indexes:**

- `users.phone_number` (unique)
- `trips.created_by`
- `events.trip_id, events.start_date` (composite)
- `members.user_id, members.trip_id` (composite, unique)
- `members.id` (primary key)
- `invitations.invitee_phone_number, invitations.trip_id` (composite)

---

## API Design

### REST API Endpoints

#### Authentication (✅ Implemented)

**File:** `apps/api/src/routes/auth.routes.ts`

**1. Request Verification Code**

```http
POST /api/auth/request-code

Request:
  Content-Type: application/json
  {
    "phoneNumber": "5551234567"  // 10-20 digits
  }

Response (200):
  {
    "success": true,
    "message": "Verification code sent to +15551234567"
  }

Response (400 - Validation Error):
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Phone number must be between 10 and 20 characters"
    }
  }

Response (429 - Rate Limited):
  {
    "success": false,
    "error": {
      "code": "RATE_LIMIT_EXCEEDED",
      "message": "Too many requests. Please try again in 60 minutes."
    }
  }

Rate Limit: 5 requests per phone number per hour
Phone Format: Converted to E.164 (+15551234567) using libphonenumber-js
Code Expiry: 5 minutes
Dev/Test: Fixed code "123456" | Production: Random 6-digit code
```

**2. Verify Code and Login**

```http
POST /api/auth/verify-code

Request:
  Content-Type: application/json
  {
    "phoneNumber": "5551234567",
    "code": "123456"
  }

Response (200 - New User):
  Set-Cookie: auth_token=<jwt>; HttpOnly; Secure; SameSite=Strict
  {
    "success": true,
    "user": {
      "id": "uuid",
      "phoneNumber": "+15551234567",
      "displayName": "",
      "timezone": "UTC",
      "profilePhotoUrl": null,
      "createdAt": "2026-02-04T...",
      "updatedAt": "2026-02-04T..."
    },
    "requiresProfile": true
  }

Response (200 - Existing User):
  Set-Cookie: auth_token=<jwt>; HttpOnly; Secure; SameSite=Strict
  {
    "success": true,
    "user": { /* ... with displayName */ },
    "requiresProfile": false
  }

Response (400 - Invalid Code):
  {
    "success": false,
    "error": {
      "code": "INVALID_CODE",
      "message": "Invalid or expired verification code"
    }
  }

JWT Payload: { sub, phone, name, iat, exp }
Expiry: 7 days
```

**3. Complete Profile**

```http
POST /api/auth/complete-profile
Authentication: Required (JWT in cookie or Authorization header)

Request:
  {
    "displayName": "John Doe",   // 3-50 characters
    "timezone": "America/New_York"  // Optional, IANA timezone
  }

Response (200):
  Set-Cookie: auth_token=<new-jwt>; HttpOnly; Secure; SameSite=Strict
  {
    "success": true,
    "user": {
      "id": "uuid",
      "phoneNumber": "+15551234567",
      "displayName": "John Doe",
      "timezone": "America/New_York",
      /* ... */
    }
  }

Response (401 - Not Authenticated):
  {
    "success": false,
    "error": {
      "code": "UNAUTHORIZED",
      "message": "Missing authentication token"
    }
  }
```

**4. Get Current User**

```http
GET /api/auth/me
Authentication: Required

Response (200):
  {
    "success": true,
    "user": {
      "id": "uuid",
      "phoneNumber": "+15551234567",
      "displayName": "John Doe",
      "timezone": "America/New_York",
      "profilePhotoUrl": null,
      "createdAt": "2026-02-04T...",
      "updatedAt": "2026-02-04T..."
    }
  }
```

**5. Logout**

```http
POST /api/auth/logout
Authentication: Required

Response (200):
  Set-Cookie: auth_token=; Max-Age=0  // Clears cookie
  {
    "success": true,
    "message": "Logged out successfully"
  }
```

---

#### Trips (✅ Implemented)

**File:** `apps/api/src/routes/trip.routes.ts`

**1. List User's Trips**

```http
GET /api/trips
Authentication: Required

Response (200):
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "name": "Summer Vacation",
        "destination": "Hawaii",
        "startDate": "2026-07-01",
        "endDate": "2026-07-10",
        "preferredTimezone": "Pacific/Honolulu",
        "description": "Beach vacation with friends",
        "coverImageUrl": "https://example.com/image.jpg",
        "allowMembersToAddEvents": true,
        "cancelled": false,
        "createdBy": "uuid",
        "createdAt": "2026-02-01T...",
        "updatedAt": "2026-02-01T...",
        "isOrganizer": true,
        "rsvpStatus": "going",
        "organizerInfo": [
          {
            "id": "uuid",
            "displayName": "John Doe",
            "profilePhotoUrl": null
          }
        ],
        "memberCount": 5,
        "eventCount": 12
      }
    ],
    "meta": {
      "page": 1,
      "limit": 50,
      "total": 1,
      "totalPages": 1
    }
  }

Additional Information:
  - Returns all trips where user is organizer or member
  - Includes role information (isOrganizer)
  - Includes RSVP status for member trips
  - Includes organizer list and counts
  - Ordered by start date (descending), then created date (descending)
```

**2. Get Trip Details**

```http
GET /api/trips/:id
Authentication: Required

Response (200):
  {
    "success": true,
    "data": {
      "trip": {
        "id": "uuid",
        "name": "Summer Vacation",
        "destination": "Hawaii",
        "startDate": "2026-07-01",
        "endDate": "2026-07-10",
        "preferredTimezone": "Pacific/Honolulu",
        "description": "Beach vacation with friends",
        "coverImageUrl": "https://example.com/image.jpg",
        "allowMembersToAddEvents": true,
        "cancelled": false,
        "createdBy": "uuid",
        "createdAt": "2026-02-01T...",
        "updatedAt": "2026-02-01T..."
      },
      "creator": {
        "id": "uuid",
        "displayName": "John Doe",
        "profilePhotoUrl": null
      },
      "organizers": [
        {
          "id": "uuid",
          "displayName": "John Doe",
          "profilePhotoUrl": null
        }
      ],
      "isOrganizer": true,
      "rsvpStatus": "going"
    }
  }

Note: The "organizers" array is populated from the members table (all members with status='going'), not from a separate organizers junction table. This design simplifies the schema while maintaining co-organizer functionality.

Response (404 - Not Found):
  {
    "success": false,
    "error": {
      "code": "NOT_FOUND",
      "message": "Trip not found"
    }
  }

Response (403 - Forbidden):
  {
    "success": false,
    "error": {
      "code": "FORBIDDEN",
      "message": "You must be a member of this trip"
    }
  }

Authorization: User must be organizer or member of the trip
```

**3. Create Trip**

```http
POST /api/trips
Authentication: Required
Authorization: Complete profile required

Request:
  Content-Type: application/json
  {
    "name": "Summer Vacation",          // 3-100 characters
    "destination": "Hawaii",            // 3-500 characters
    "startDate": "2026-07-01",         // Optional, ISO date (YYYY-MM-DD)
    "endDate": "2026-07-10",           // Optional, ISO date (YYYY-MM-DD)
    "preferredTimezone": "Pacific/Honolulu",  // IANA timezone identifier
    "description": "Beach vacation",    // Optional, max 2000 characters
    "allowMembersToAddEvents": true    // Optional, default: true
  }

Response (201):
  {
    "success": true,
    "data": {
      "trip": {
        "id": "uuid",
        "name": "Summer Vacation",
        /* ... full trip object */
      }
    }
  }

Response (400 - Validation Error):
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Trip name must be between 3 and 100 characters"
    }
  }

Additional Information:
  - Creator automatically becomes organizer
  - Creator automatically becomes member with "going" status
  - endDate must be >= startDate if both provided
```

**4. Update Trip**

```http
PUT /api/trips/:id
Authentication: Required
Authorization: Must be organizer

Request:
  Content-Type: application/json
  {
    "name": "Updated Trip Name",       // Optional
    "destination": "Updated Location", // Optional
    "startDate": "2026-07-15",        // Optional
    "endDate": "2026-07-20",          // Optional
    "preferredTimezone": "America/New_York",  // Optional
    "description": "Updated description",     // Optional
    "allowMembersToAddEvents": false  // Optional
  }

Response (200):
  {
    "success": true,
    "data": {
      "trip": {
        /* ... updated trip object */
      }
    }
  }

Response (403 - Forbidden):
  {
    "success": false,
    "error": {
      "code": "FORBIDDEN",
      "message": "Only organizers can update trip details"
    }
  }

Additional Information:
  - Only provided fields are updated
  - Validates dates if both provided
  - Updates updatedAt timestamp
```

**5. Cancel/Delete Trip**

```http
DELETE /api/trips/:id
Authentication: Required
Authorization: Must be organizer

Response (200):
  {
    "success": true,
    "message": "Trip cancelled successfully"
  }

Response (403 - Forbidden):
  {
    "success": false,
    "error": {
      "code": "FORBIDDEN",
      "message": "Only organizers can cancel trips"
    }
  }

Additional Information:
  - Sets cancelled field to true (soft delete)
  - Trip still accessible but marked as cancelled
  - Does not delete related data (members, events, etc.)
```

**6. Add Co-Organizer**

```http
POST /api/trips/:id/co-organizers
Authentication: Required
Authorization: Must be organizer

Request:
  Content-Type: application/json
  {
    "phoneNumber": "+15551234567"  // E.164 format
  }

Response (200):
  {
    "success": true
  }

Response (400 - User Not Found):
  {
    "success": false,
    "error": {
      "code": "NOT_FOUND",
      "message": "User with phone number +15551234567 not found"
    }
  }

Response (409 - Already Co-Organizer):
  {
    "success": false,
    "error": {
      "code": "CONFLICT",
      "message": "User is already a co-organizer (has status='going')"
    }
  }

Additional Information:
  - User must exist in system (registered)
  - Adds user as member with status='going' (which grants co-organizer permissions)
  - If user is already a member, updates their status to 'going'
```

**7. Remove Co-Organizer**

```http
DELETE /api/trips/:id/co-organizers/:userId
Authentication: Required
Authorization: Must be organizer

Response (200):
  {
    "success": true,
    "message": "Co-organizer removed successfully"
  }

Response (400 - Cannot Remove Creator):
  {
    "success": false,
    "error": {
      "code": "FORBIDDEN",
      "message": "Cannot remove trip creator as organizer"
    }
  }

Response (404 - Not Organizer):
  {
    "success": false,
    "error": {
      "code": "NOT_FOUND",
      "message": "User is not an organizer of this trip"
    }
  }

Additional Information:
  - Cannot remove trip creator (createdBy user)
  - Removes organizer role but keeps as member
  - User remains member with their RSVP status
```

**8. Upload Cover Image**

```http
POST /api/trips/:id/cover-image
Authentication: Required
Authorization: Must be organizer
Content-Type: multipart/form-data

Request:
  Form Data:
    file: <image file>  // JPEG, PNG, or WebP, max 5MB

Response (200):
  {
    "success": true,
    "data": {
      "coverImageUrl": "/uploads/trip-uuid-timestamp.jpg"
    }
  }

Response (400 - File Too Large):
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "File size exceeds maximum of 5MB"
    }
  }

Response (400 - Invalid Type):
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Invalid file type. Allowed: image/jpeg, image/png, image/webp"
    }
  }

Additional Information:
  - Deletes old cover image if exists
  - Stores in UPLOAD_DIR (default: uploads/)
  - File named: trip-{tripId}-{timestamp}.{ext}
  - Updates trip.coverImageUrl field
```

**9. Delete Cover Image**

```http
DELETE /api/trips/:id/cover-image
Authentication: Required
Authorization: Must be organizer

Response (200):
  {
    "success": true,
    "message": "Cover image deleted successfully"
  }

Response (404 - No Image):
  {
    "success": false,
    "error": {
      "code": "NOT_FOUND",
      "message": "Trip has no cover image"
    }
  }

Additional Information:
  - Deletes file from filesystem
  - Sets trip.coverImageUrl to null
  - No error if file doesn't exist on filesystem
```

#### Invitations & Members (✅ Implemented)

**File:** `apps/api/src/routes/invitation.routes.ts`

```
GET    /api/trips/:tripId/invitations
  Authentication: Required
  Response: { success: true, invitations: Invitation[] }
  Permissions: Organizer only

POST   /api/trips/:tripId/invitations
  Authentication: Required + Complete Profile
  Body: { phoneNumbers: string[] }  // 1-25 E.164 phone numbers
  Response: { success: true, invitations: Invitation[], skipped: string[] }
  Permissions: Organizer only
  Rate Limit: 30/min per user

DELETE /api/invitations/:id
  Authentication: Required + Complete Profile
  Response: { success: true }
  Permissions: Organizer only
  Rate Limit: 30/min per user

GET    /api/trips/:tripId/members
  Authentication: Required
  Response: { success: true, members: MemberWithProfile[] }
  Permissions: Trip member

DELETE /api/trips/:tripId/members/:memberId
  Authentication: Required + Complete Profile
  Response: 204 No Content
  Permissions: Organizer only (cannot remove trip creator)
  Rate Limit: 30/min per user

POST   /api/trips/:tripId/rsvp
  Authentication: Required + Complete Profile
  Body: { status: 'going' | 'not_going' | 'maybe' }
  Response: { success: true, member: MemberWithProfile }
  Permissions: Any trip member
  Rate Limit: 30/min per user

PATCH  /api/trips/:tripId/members/:memberId
  Authentication: Required + Complete Profile
  Body: { isOrganizer: boolean }
  Response: { success: true, member: MemberWithProfile }
  Permissions: Organizer only (cannot change trip creator or own role)
  Rate Limit: 30/min per user
```

#### Events (✅ Implemented)

**File:** `apps/api/src/routes/event.routes.ts`

```
GET    /api/trips/:tripId/events
  Authentication: Required
  Query: { type?: 'travel' | 'meal' | 'activity', includeDeleted?: boolean }
  Response: { success: true, events: Event[] }
  Permissions: Trip member (Going members get full data; others get PREVIEW_ACCESS_ONLY error)
  Limit: Max 50 events per trip

POST   /api/trips/:tripId/events
  Authentication: Required + Complete Profile
  Body: { name, eventType, startTime, endTime?, description?, location?, meetupLocation?, meetupTime?, allDay?, isOptional?, links? }
  Response: { success: true, event: Event }
  Permissions: Organizer, or member if allowMembersToAddEvents is true
  Rate Limit: 30/min per user

GET    /api/events/:id
  Authentication: Required
  Response: { success: true, event: Event }

PUT    /api/events/:id
  Authentication: Required + Complete Profile
  Body: Partial<CreateEventInput>
  Response: { success: true, event: Event }
  Permissions: Organizer or event creator
  Rate Limit: 30/min per user

DELETE /api/events/:id
  Authentication: Required + Complete Profile
  Response: { success: true }
  Permissions: Organizer or event creator (soft delete)
  Rate Limit: 30/min per user

POST   /api/events/:id/restore
  Authentication: Required + Complete Profile
  Response: { success: true, event: Event }
  Permissions: Organizer only
  Rate Limit: 30/min per user
```

#### Accommodations (✅ Implemented)

**File:** `apps/api/src/routes/accommodation.routes.ts`

```
GET    /api/trips/:tripId/accommodations
  Authentication: Required
  Query: { includeDeleted?: boolean }
  Response: { success: true, accommodations: Accommodation[] }
  Permissions: Trip member
  Limit: Max 10 accommodations per trip

POST   /api/trips/:tripId/accommodations
  Authentication: Required + Complete Profile
  Body: { name, address?, checkIn (ISO datetime), checkOut (ISO datetime), description?, links? }
  Response: { success: true, accommodation: Accommodation }
  Permissions: Organizer only
  Rate Limit: 30/min per user

GET    /api/accommodations/:id
  Authentication: Required
  Response: { success: true, accommodation: Accommodation }

PUT    /api/accommodations/:id
  Authentication: Required + Complete Profile
  Body: Partial<CreateAccommodationInput>
  Response: { success: true, accommodation: Accommodation }
  Permissions: Organizer only
  Rate Limit: 30/min per user

DELETE /api/accommodations/:id
  Authentication: Required + Complete Profile
  Response: { success: true }
  Permissions: Organizer only (soft delete)
  Rate Limit: 30/min per user

POST   /api/accommodations/:id/restore
  Authentication: Required + Complete Profile
  Response: { success: true, accommodation: Accommodation }
  Permissions: Organizer only
  Rate Limit: 30/min per user
```

Note: checkIn/checkOut use TIMESTAMP WITH TIMEZONE (ISO 8601 datetime strings).
Accommodations appear on all spanned days in the day-by-day itinerary view.

#### Member Travel (✅ Implemented)

**File:** `apps/api/src/routes/member-travel.routes.ts`

```
GET    /api/trips/:tripId/member-travel
  Authentication: Required
  Query: { includeDeleted?: boolean }
  Response: { success: true, memberTravels: MemberTravel[] }
  Permissions: Trip member
  Limit: Max 20 travel entries per member

POST   /api/trips/:tripId/member-travel
  Authentication: Required + Complete Profile
  Body: { travelType: 'arrival' | 'departure', time (ISO datetime), location?, details?, memberId? }
  Response: { success: true, memberTravel: MemberTravel }
  Permissions: Any trip member (memberId field requires organizer for delegation)
  Rate Limit: 30/min per user

GET    /api/member-travel/:id
  Authentication: Required
  Response: { success: true, memberTravel: MemberTravel }

PUT    /api/member-travel/:id
  Authentication: Required + Complete Profile
  Body: { travelType?, time?, location?, details? }
  Response: { success: true, memberTravel: MemberTravel }
  Permissions: Organizer or travel entry creator
  Rate Limit: 30/min per user

DELETE /api/member-travel/:id
  Authentication: Required + Complete Profile
  Response: { success: true }
  Permissions: Organizer or travel entry creator (soft delete)
  Rate Limit: 30/min per user

POST   /api/member-travel/:id/restore
  Authentication: Required + Complete Profile
  Response: { success: true, memberTravel: MemberTravel }
  Permissions: Organizer only
  Rate Limit: 30/min per user
```

Note: The optional `memberId` field in the create request allows organizers to add
travel entries on behalf of other trip members (member travel delegation).

#### User Profile (✅ Implemented)

**File:** `apps/api/src/routes/user.routes.ts`

```
PUT    /api/users/me
  Authentication: Required
  Body: { displayName? (3-50 chars), timezone? (IANA string or null), handles? { venmo?, instagram? } }
  Response: { success: true, user: User }
  Rate Limit: 30/min per user

POST   /api/users/me/photo
  Authentication: Required
  Body: multipart/form-data with image file (JPEG/PNG/WebP, max 5MB)
  Response: { success: true, user: User }
  Rate Limit: 30/min per user

DELETE /api/users/me/photo
  Authentication: Required
  Response: { success: true, user: User }
  Rate Limit: 30/min per user
```

#### Health (✅ Implemented)

**File:** `apps/api/src/routes/health.routes.ts`

```
GET    /api/health
  Authentication: None
  Response: { status: 'ok' | 'degraded', timestamp: string, database: 'connected' | 'disconnected' }

GET    /api/health/live
  Authentication: None
  Response: { status: 'ok' }

GET    /api/health/ready
  Authentication: None
  Response: { status: 'ok' | 'degraded', timestamp: string, database: 'connected' | 'disconnected' }
  Returns 503 if database is disconnected
```

### API Conventions

**Response Format**

```typescript
// Success
{
  success: true,
  data: { ... },
  message?: string
}

// Error
{
  success: false,
  error: {
    code: 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'NOT_FOUND' | ...,
    message: string,
    details?: any
  }
}
```

**Pagination** (trips list endpoint)

```typescript
// GET /api/trips?page=1&limit=20
{
  success: true,
  data: TripSummary[],
  meta: {
    total: number,     // Total matching trips
    page: number,      // Current page (1-indexed)
    limit: number,     // Items per page (max 100)
    totalPages: number // Computed ceil(total/limit)
  }
}
```

**Error Codes**

| Code                           | HTTP Status | Description                                        |
| ------------------------------ | ----------- | -------------------------------------------------- |
| `VALIDATION_ERROR`             | 400         | Invalid input data (Zod schema validation failure) |
| `INVALID_CODE`                 | 400         | Invalid or expired verification code               |
| `INVALID_DATE_RANGE`           | 400         | End date/time is before start date/time            |
| `FILE_TOO_LARGE`               | 400         | Upload exceeds maximum file size (5MB)             |
| `INVALID_FILE_TYPE`            | 400         | Unsupported file type (only JPEG/PNG/WebP)         |
| `CO_ORGANIZER_NOT_FOUND`       | 400         | Phone number not registered in system              |
| `CANNOT_REMOVE_CREATOR`        | 400         | Cannot remove trip creator as co-organizer         |
| `CANNOT_DEMOTE_CREATOR`        | 400         | Cannot change the role of the trip creator         |
| `CANNOT_MODIFY_OWN_ROLE`       | 400         | Cannot modify your own organizer role              |
| `LAST_ORGANIZER`               | 400         | Cannot remove/demote the last organizer            |
| `EVENT_LIMIT_EXCEEDED`         | 400         | Maximum 50 events per trip reached                 |
| `ACCOMMODATION_LIMIT_EXCEEDED` | 400         | Maximum 10 accommodations per trip reached         |
| `MEMBER_TRAVEL_LIMIT_EXCEEDED` | 400         | Maximum 20 travel entries per member reached       |
| `UNAUTHORIZED`                 | 401         | Missing or invalid authentication token            |
| `PROFILE_INCOMPLETE`           | 403         | Profile setup required before this action          |
| `PERMISSION_DENIED`            | 403         | Insufficient permissions for this action           |
| `TRIP_LOCKED`                  | 403         | Trip has ended and is now read-only                |
| `PREVIEW_ACCESS_ONLY`          | 403         | Non-Going member cannot access full trip data      |
| `NOT_FOUND`                    | 404         | Trip not found                                     |
| `EVENT_NOT_FOUND`              | 404         | Event not found                                    |
| `ACCOMMODATION_NOT_FOUND`      | 404         | Accommodation not found                            |
| `MEMBER_TRAVEL_NOT_FOUND`      | 404         | Member travel entry not found                      |
| `INVITATION_NOT_FOUND`         | 404         | Invitation not found                               |
| `MEMBER_NOT_FOUND`             | 404         | Member not found                                   |
| `CO_ORGANIZER_NOT_IN_TRIP`     | 404         | Co-organizer not found in trip                     |
| `DUPLICATE_MEMBER`             | 409         | User is already a member of the trip               |
| `MEMBER_LIMIT_EXCEEDED`        | 400         | Maximum 25 members per trip reached                |
| `EVENT_CONFLICT`               | 409         | Event time conflicts with existing event           |
| `ACCOUNT_LOCKED`               | 429         | Too many failed verification attempts              |
| `RATE_LIMIT_EXCEEDED`          | 429         | Too many requests                                  |
| `INTERNAL_SERVER_ERROR`        | 500         | Unexpected server error                            |

---

## Authentication Flow

### Phone Verification Flow

```
┌──────────┐                    ┌──────────┐                    ┌──────────────┐
│  Client  │                    │   API    │                    │  Database    │
│          │                    │          │                    │ (PostgreSQL) │
└────┬─────┘                    └────┬─────┘                    └──────┬───────┘
     │                               │                                  │
     │ 1. POST /auth/request-code    │                                  │
     │ { phoneNumber }                │                                  │
     ├──────────────────────────────►│                                  │
     │                               │                                  │
     │                               │ 2. Generate 6-digit code         │
     │                               │    Store in verification_codes   │
     │                               │    table (5min expiry)           │
     │                               ├─────────────────────────────────►│
     │                               │                                  │
     │                               │ 3. Send SMS (mock console log)   │
     │                               │                                  │
     │ 4. { success: true }          │                                  │
     │◄──────────────────────────────┤                                  │
     │                               │                                  │
     │ 5. User enters code           │                                  │
     │                               │                                  │
     │ 6. POST /auth/verify-code     │                                  │
     │ { phoneNumber, code }          │                                  │
     ├──────────────────────────────►│                                  │
     │                               │                                  │
     │                               │ 7. Verify code from database     │
     │                               │    Check expiry timestamp        │
     │                               ├─────────────────────────────────►│
     │                               │◄─────────────────────────────────┤
     │                               │                                  │
     │                               │ 8. Create/fetch user             │
     │                               │    Generate JWT token            │
     │                               │    Delete code from database     │
     │                               │                                  │
     │ 9. { token, user }            │                                  │
     │◄──────────────────────────────┤                                  │
     │                               │                                  │
     │ 10. Store token in cookie     │                                  │
     │     (httpOnly, secure)        │                                  │
     │                               │                                  │

Note: For MVP, verification codes are stored in the database with expiry timestamps.
This eliminates the need for in-memory storage or Redis for simple verification flows.
```

### JWT Token Structure (✅ Implemented)

**Token Payload** (generated by `apps/api/src/services/auth.service.ts`):

```typescript
interface JWTPayload {
  sub: string; // User ID (UUID)
  phone: string; // Phone number in E.164 format
  name: string; // Display name (empty if profile incomplete)
  iat: number; // Issued at timestamp
  exp: number; // Expires at (iat + 7 days)
}
```

**Signing Configuration** (`apps/api/src/server.ts`):

- Algorithm: HS256
- Secret: From JWT_SECRET env var (min 32 characters)
- Expiration: 7 days
- Stored in httpOnly cookie: `auth_token`
  - Path: `/`
  - SameSite: `strict`
  - Secure: `true` (production only)

### Authentication Middleware (✅ Implemented)

**File:** `apps/api/src/middleware/auth.middleware.ts`

#### 1. `authenticate()` Middleware

Validates JWT from cookie or Authorization header:

```typescript
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    // Check cookie first, fallback to Authorization header
    const token =
      request.cookies.auth_token ||
      request.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return reply.status(401).send({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing authentication token",
        },
      });
    }

    // Verify JWT signature and expiry
    const decoded = await request.server.jwt.verify<JWTPayload>(token);

    // Attach user to request object
    request.user = {
      id: decoded.sub,
      phoneNumber: decoded.phone,
      displayName: decoded.name,
    };
  } catch (err) {
    return reply.status(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token",
      },
    });
  }
}
```

#### 2. `requireCompleteProfile()` Middleware

Ensures authenticated user has completed their profile:

```typescript
export async function requireCompleteProfile(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // Must have displayName to access protected features
  if (!request.user?.displayName || request.user.displayName.trim() === "") {
    return reply.status(403).send({
      success: false,
      error: {
        code: "PROFILE_INCOMPLETE",
        message: "Please complete your profile first",
      },
    });
  }
}
```

**Usage in Routes:**

```typescript
// Protected route requiring auth
fastify.get("/api/trips", { preHandler: authenticate }, tripsController.list);

// Protected route requiring complete profile
fastify.post(
  "/api/trips",
  { preHandler: [authenticate, requireCompleteProfile] },
  tripsController.create,
);
```

---

## Trip Management Flow

### Trip Creation and Management (✅ Implemented)

**Services Layer:**

1. **TripService** (`apps/api/src/services/trip.service.ts`)
   - CRUD operations for trips
   - List user's trips with role and RSVP information
   - Co-organizer management
   - Member and organizer tracking

2. **PermissionsService** (`apps/api/src/services/permissions.service.ts`)
   - Check if user is organizer
   - Check if user can perform specific actions
   - Enforce permission rules based on trip settings

3. **UploadService** (`apps/api/src/services/upload.service.ts`)
   - Handle file uploads with validation
   - Support for trip cover images
   - File size and MIME type validation
   - Cleanup of old files

**Database Schema:**

```typescript
// Trips table
export const trips = pgTable("trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  destination: text("destination").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  preferredTimezone: varchar("preferred_timezone", { length: 100 }).notNull(),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  allowMembersToAddEvents: boolean("allow_members_to_add_events")
    .notNull()
    .default(true),
  cancelled: boolean("cancelled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Members table (includes RSVP status and co-organizer tracking)
// Note: Co-organizers are identified by status='going' rather than a separate table
export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: rsvpStatusEnum("status").notNull().default("no_response"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

**Permission Rules:**

1. **Organizer Actions** (must be organizer):
   - Update trip details (name, destination, dates, description)
   - Change trip settings (allowMembersToAddEvents)
   - Add/remove co-organizers
   - Upload/delete cover images
   - Cancel/delete trip

2. **Member Actions** (based on RSVP status and settings):
   - View trip details (any member)
   - Add events (if RSVP="going" AND trip allows OR is organizer)
   - Edit own events (if still RSVP="going")
   - Delete own events (if still RSVP="going")

3. **Trip Creator Special Rules**:
   - Cannot be removed as organizer
   - Always has full permissions

**Frontend Components:**

1. **Dashboard** (`apps/web/src/app/(app)/dashboard/page.tsx`)
   - Lists all user's trips grouped by status
   - Search functionality
   - Trip grouping: Your Trips, Other Trips, Past Trips
   - CreateTripDialog trigger button

2. **CreateTripDialog** (`apps/web/src/components/trip/create-trip-dialog.tsx`)
   - Two-step form:
     - Step 1: Basic info (name, destination, dates, timezone)
     - Step 2: Optional details (description, cover image)
   - Zod validation with inline errors
   - TanStack Query mutation for optimistic updates

3. **TripCard** (`apps/web/src/components/trip/trip-card.tsx`)
   - Displays trip summary with cover image
   - Shows RSVP status badge
   - Shows organizer badge if applicable
   - Displays organizer avatars (stacked, max 3)
   - Shows event count
   - Animated entrance with staggered delays

4. **Trip Detail Page** (`apps/web/src/app/(app)/trips/[id]/page.tsx`)
   - Full trip information display
   - EditTripDialog trigger (organizers only)
   - Future: Events list, accommodations, member travel

5. **EditTripDialog** (`apps/web/src/components/trip/edit-trip-dialog.tsx`)
   - Tabbed interface:
     - **Details**: Edit basic trip info
     - **Settings**: Manage permissions and co-organizers
     - **Cover Image**: Upload/replace/delete image
     - **Delete**: Cancel trip (danger zone)
   - Permission-based rendering (organizers only)
   - Optimistic updates with TanStack Query

6. **ImageUpload** (`apps/web/src/components/trip/image-upload.tsx`)
   - Drag-and-drop or click to upload
   - File validation (size, type)
   - Image preview with metadata
   - Clear selection button

**API Flow Example - Creating a Trip:**

```
User Action → Frontend → API → Database → Response
─────────────────────────────────────────────────

1. User clicks "Create Trip" button
   └─> Opens CreateTripDialog

2. User fills Step 1 (name, destination, dates, timezone)
   └─> Validates locally with Zod schema
   └─> Clicks "Next" to Step 2

3. User fills Step 2 (description, cover image)
   └─> Validates locally with Zod schema
   └─> Clicks "Create Trip"

4. Frontend: TanStack Query mutation
   └─> POST /api/trips (trip data without image)
   └─> Optimistic update: Add trip to cache

5. API: TripService.createTrip()
   ├─> Validate request with Zod schema
   ├─> Check user has complete profile
   ├─> Insert into trips table
   ├─> Insert creator as organizer
   ├─> Insert creator as member (status: "going")
   └─> Return created trip

6. Frontend: Upload cover image (if selected)
   └─> POST /api/trips/:id/cover-image (multipart/form-data)

7. API: UploadService.uploadFile()
   ├─> Validate file size (<= 5MB)
   ├─> Validate MIME type (image/jpeg, image/png, image/webp)
   ├─> Save file to uploads/ directory
   ├─> Update trip.coverImageUrl
   └─> Return image URL

8. Frontend: Success
   ├─> Close dialog
   ├─> Invalidate trips query cache
   ├─> Navigate to trip detail page
   └─> Show success toast
```

**Environment Variables:**

```bash
# File upload configuration
UPLOAD_DIR=uploads                                    # Directory for uploaded files
MAX_FILE_SIZE=5242880                                # 5MB in bytes
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp  # Accepted image formats
```

**Testing:**

- **Unit Tests**: TripService, PermissionsService, UploadService
- **Integration Tests**: All 9 trip API endpoints
- **E2E Tests**: Complete trip management flows (902 lines, 4 test suites)
  - Trip creation with 2-step form
  - Trip editing with all tabs
  - Permission enforcement
  - Co-organizer management

---

## Key Features Implementation

### 1. Timezone Handling

**Strategy:**

- Store all dates/times in UTC in the database
- Each trip has a `preferredTimezone` field (IANA timezone identifier)
- Users can toggle between trip timezone and their local timezone in UI

**Implementation:**

```typescript
// Backend: Save times in UTC
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'

function convertToUTC(dateTime: Date, timezone: string): Date {
  return zonedTimeToUtc(dateTime, timezone)
}

// Frontend: Display in trip timezone or user timezone
import { formatInTimeZone } from 'date-fns-tz'

function formatEventTime(
  utcDateTime: Date,
  displayTimezone: string,
  format: string = 'h:mm a'
): string {
  return formatInTimeZone(utcDateTime, displayTimezone, format)
}

// Example usage in component
function EventCard({ event, trip, userTimezone, showInLocalTime }) {
  const displayTimezone = showInLocalTime ? userTimezone : trip.preferredTimezone
  const timeStr = formatEventTime(event.startTime, displayTimezone)

  return <div>{timeStr}</div>
}
```

### 2. Soft Delete Pattern

**Implementation:**

```typescript
// Soft delete event
async function deleteEvent(eventId: string, userId: string) {
  await db
    .update(events)
    .set({
      deletedAt: new Date(),
      deletedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));
}

// Restore event
async function restoreEvent(eventId: string) {
  await db
    .update(events)
    .set({
      deletedAt: null,
      deletedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));
}

// Query non-deleted events
const activeEvents = await db
  .select()
  .from(events)
  .where(and(eq(events.tripId, tripId), isNull(events.deletedAt)));

// Organizers can view deleted items
const deletedEvents = await db
  .select()
  .from(events)
  .where(and(eq(events.tripId, tripId), isNotNull(events.deletedAt)));
```

### 3. Permission System

**Permission Matrix:**

| Action                     | Member (Going) | Member (Not Going) | Organizer |
| -------------------------- | -------------- | ------------------ | --------- |
| View itinerary             | ✓              | ✗                  | ✓         |
| Add event                  | ✓\*            | ✗                  | ✓         |
| Edit own event             | ✓              | ✗                  | ✓         |
| Delete own event           | ✓              | ✗                  | ✓         |
| Edit any event             | ✗              | ✗                  | ✓         |
| Delete any event           | ✗              | ✗                  | ✓         |
| Add accommodation          | ✗              | ✗                  | ✓         |
| Add member travel (self)   | ✓              | ✗                  | ✓         |
| Add member travel (others) | ✗              | ✗                  | ✓         |
| Edit trip                  | ✗              | ✗                  | ✓         |
| Invite members             | ✗              | ✗                  | ✓         |

\*Only if trip setting `allowMembersToAddEvents` is enabled

### 4. Optimistic Updates

**TanStack Query Implementation:**

```typescript
// hooks/useTripEvents.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useAddEvent(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newEvent: NewEvent) => api.events.create(tripId, newEvent),

    // Optimistic update
    onMutate: async (newEvent) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["events", tripId] });

      // Snapshot previous value
      const previousEvents = queryClient.getQueryData(["events", tripId]);

      // Optimistically update
      queryClient.setQueryData(["events", tripId], (old: Event[]) => [
        ...old,
        { ...newEvent, id: "temp-id", createdAt: new Date() },
      ]);

      return { previousEvents };
    },

    // Rollback on error
    onError: (err, newEvent, context) => {
      queryClient.setQueryData(["events", tripId], context.previousEvents);
    },

    // Refetch on success
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["events", tripId] });
    },
  });
}
```

### 5. Multi-Day Events

**Display Strategy:**

- Events with `endDate` different from `startDate` appear once on the start date
- Show "Multi-day" badge with date range (e.g., "Oct 12-14")
- Do NOT duplicate across each day

**Query Implementation:**

```typescript
// Group events by day, handling multi-day events
function groupEventsByDay(events: Event[]) {
  const grouped = new Map<string, Event[]>();

  events.forEach((event) => {
    // Multi-day events only appear on start date
    const dateKey = format(event.startDate, "yyyy-MM-dd");

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(event);
  });

  return grouped;
}
```

---

## Development Practices

### Monorepo Structure (✅ Implemented)

**Current Structure:**

```
journiful/
├── apps/
│   ├── api/              (@journiful/api) - Fastify backend server
│   │   ├── src/
│   │   │   ├── server.ts             # Entry point, Fastify app setup
│   │   │   ├── config/
│   │   │   │   ├── env.ts            # Environment variable validation
│   │   │   │   └── database.ts       # Drizzle connection
│   │   │   ├── controllers/
│   │   │   │   └── auth.controller.ts  # Auth endpoint handlers
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts     # Business logic for auth
│   │   │   │   └── sms.service.ts      # Mock SMS service
│   │   │   ├── middleware/
│   │   │   │   ├── auth.middleware.ts  # JWT verification
│   │   │   │   ├── error.middleware.ts # Error handling
│   │   │   │   └── rate-limit.middleware.ts  # SMS rate limiting
│   │   │   ├── db/
│   │   │   │   ├── schema/
│   │   │   │   │   └── index.ts        # Users, verification_codes tables
│   │   │   │   └── migrations/
│   │   │   │       └── 0000_smooth_sharon_ventura.sql
│   │   │   ├── routes/
│   │   │   │   └── auth.routes.ts      # Auth route registration
│   │   │   └── utils/
│   │   │       └── phone.ts            # Phone validation (libphonenumber-js)
│   │   ├── tests/
│   │   │   ├── unit/                   # 8 unit test files
│   │   │   └── integration/            # 9 integration test files
│   │   ├── drizzle.config.ts
│   │   ├── vitest.config.ts
│   │   └── package.json
│   └── web/              (@journiful/web) - Next.js 16 frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/             # Auth route group
│       │   │   │   ├── login/page.tsx
│       │   │   │   ├── verify/page.tsx
│       │   │   │   └── complete-profile/page.tsx
│       │   │   ├── (app)/              # Protected route group
│       │   │   │   └── dashboard/page.tsx
│       │   │   ├── providers/
│       │   │   │   ├── auth-provider.tsx  # Auth context
│       │   │   │   └── query-provider.tsx
│       │   │   └── layout.tsx
│       │   ├── components/ui/          # Radix UI + shadcn components
│       │   │   ├── button.tsx
│       │   │   ├── input.tsx
│       │   │   ├── label.tsx
│       │   │   ├── select.tsx
│       │   │   └── form.tsx
│       │   └── lib/
│       │       └── api.ts              # API client wrapper
│       ├── tests/e2e/
│       │   └── auth-flow.spec.ts       # 4 E2E test scenarios
│       ├── playwright.config.ts
│       └── package.json
├── shared/               (@journiful/shared) - Shared types & schemas
│   ├── schemas/
│   │   ├── auth.ts                 # Zod schemas for auth endpoints
│   │   └── index.ts
│   ├── types/
│   │   ├── user.ts                 # User, AuthResponse interfaces
│   │   └── index.ts                # ApiResponse, ErrorResponse types
│   └── package.json
├── docs/
│   └── 2026-02-01-journiful-mvp/
│       ├── PRD.md
│       ├── DESIGN.md
│       └── ARCHITECTURE.md (this file)
├── docker-compose.yml        # PostgreSQL 16 (port 5433)
├── turbo.json                # Build pipeline configuration
├── pnpm-workspace.yaml       # Workspace package list
├── tsconfig.base.json        # Shared TypeScript config
└── package.json              # Root workspace scripts
```

**Package Details:**

| Package         | Version | Description                              |
| --------------- | ------- | ---------------------------------------- |
| @journiful/api    | private | Fastify backend with auth implementation |
| @journiful/web    | private | Next.js 16 frontend with Radix UI        |
| @journiful/shared | private | Shared Zod schemas and TypeScript types  |

**Note:** All packages are private (not published). Shared package uses root-level structure (not nested under `packages/`).

### Environment Variables (✅ Implemented)

**Backend (apps/api/.env)**

Validated via `/apps/api/src/config/env.ts` using Zod schemas:

```bash
# Server Configuration
NODE_ENV=development              # development | test | production
PORT=8000                         # Default: 8000
HOST=0.0.0.0                      # Default: 0.0.0.0
LOG_LEVEL=info                    # fatal | error | warn | info | debug | trace

# Database (Required)
DATABASE_URL=postgresql://journiful:journiful_dev@localhost:5433/journiful

# JWT Authentication (Required in production, auto-generated in dev)
JWT_SECRET=your-secret-key-min-32-characters-for-security

# CORS
FRONTEND_URL=http://localhost:3000

# SMS (Future - Twilio)
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_PHONE_NUMBER=

# Storage (Future - AWS S3)
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_S3_BUCKET=
# AWS_REGION=

# Caching (Future - Redis)
# REDIS_URL=redis://localhost:6379
```

**Frontend (apps/web/.env.local)**

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

**Docker PostgreSQL Configuration (docker-compose.yml):**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: journiful
      POSTGRES_PASSWORD: journiful_dev
      POSTGRES_DB: journiful
    ports:
      - "5433:5432" # External:Internal (avoids conflict with local PostgreSQL)
```

### Development Workflow (✅ Implemented)

**1. Start PostgreSQL Database**

```bash
pnpm db:up
# Starts PostgreSQL 16 on localhost:5433
```

**2. Run Database Migrations**

```bash
cd apps/api
pnpm db:generate      # Generate migrations from schema changes
pnpm db:migrate       # Apply migrations to database
```

**3. Start Development Servers**

**Option A: Start all services (recommended)**

```bash
# From root directory
pnpm dev
# Starts both API (8000) and Web (3000) in parallel via Turbo
```

**Option B: Start individual services**

```bash
# API only
pnpm dev:api
# or
pnpm --filter @journiful/api dev

# Web only
pnpm dev:web
# or
pnpm --filter @journiful/web dev
```

**4. Run Tests**

```bash
# All tests (unit + integration + E2E)
pnpm test

# E2E tests only (Playwright)
pnpm test:e2e

# Watch mode (unit tests)
pnpm test:watch

# API tests only
pnpm --filter @journiful/api test
```

**5. Database Management**

```bash
# Open Drizzle Studio (visual DB editor)
cd apps/api
pnpm db:studio

# Stop database
pnpm db:down
```

**6. Linting & Type Checking**

```bash
# Lint all packages
pnpm lint

# Auto-fix lint issues
pnpm lint:fix

# TypeScript type checking
pnpm typecheck
```

**Available Scripts (Root `package.json`):**

| Script            | Description                       |
| ----------------- | --------------------------------- |
| `pnpm dev`        | Start all dev servers in parallel |
| `pnpm dev:api`    | Start API server only             |
| `pnpm dev:web`    | Start web server only             |
| `pnpm build`      | Build all packages for production |
| `pnpm test`       | Run all tests                     |
| `pnpm test:e2e`   | Run Playwright E2E tests          |
| `pnpm test:watch` | Watch mode for tests              |
| `pnpm lint`       | Run ESLint on all packages        |
| `pnpm lint:fix`   | Fix auto-fixable lint issues      |
| `pnpm typecheck`  | Run TypeScript compiler checks    |
| `pnpm db:up`      | Start PostgreSQL via Docker       |
| `pnpm db:down`    | Stop PostgreSQL                   |

### Code Quality

**TypeScript Configuration**

- TypeScript 5.7.3
- Strict mode enabled
- Target: ES2023 for Node.js 22
- Module: "nodenext" for modern module resolution
- Shared `tsconfig.base.json` for consistency
- Path aliases for clean imports

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true
  }
}
```

**Linting**

- ESLint 9.x with flat config (`eslint.config.js`)
- `@eslint/js` for recommended configs
- TypeScript ESLint plugin for type-aware linting

```javascript
// eslint.config.js
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];
```

**Scripts**

```bash
pnpm lint       # ESLint
pnpm typecheck  # TypeScript
```

**Git Hooks (Husky)**

- Pre-commit: Lint staged files, typecheck
- Pre-push: Run unit tests

---

## Testing Strategy

### ✅ Unit Tests (Vitest) - 8 Test Files Implemented

**Location:** `apps/api/tests/unit/`

**Configuration:** `apps/api/vitest.config.ts`

- Environment: Node.js
- Test timeout: 10 seconds
- Parallel execution: 4 max concurrency
- Pool: threads with isolation disabled

**Implemented Test Files:**

1. **`phone.test.ts`** - Phone number validation
   - Validates E.164 format conversion
   - Tests country code detection
   - Validates test numbers (555) in dev/test

2. **`auth.service.test.ts`** - Authentication service logic
   - Code generation (6 digits)
   - Code storage with expiry
   - Code verification logic
   - User creation and retrieval
   - JWT token generation

3. **`schema.test.ts`** - Zod schema validation
   - `requestCodeSchema` validation
   - `verifyCodeSchema` validation
   - `completeProfileSchema` validation
   - Error message testing

4. **`jwt-config.test.ts`** - JWT configuration
   - Token signing
   - Token verification
   - Expiry validation
   - Payload structure

5. **`sms.service.test.ts`** - SMS service mocking
   - Mock SMS logging
   - Phone number formatting
   - Code delivery simulation

6. **`env.test.ts`** - Environment variable validation
7. **`database.test.ts`** - Database connection testing
8. **`rate-limit.test.ts`** - Rate limiting logic

**Running Tests:**

```bash
cd apps/api
pnpm test           # Run all tests
pnpm test:watch     # Watch mode
```

---

### ✅ Integration Tests (Vitest) - 9 Test Files Implemented

**Location:** `apps/api/tests/integration/`

**Implemented Test Files:**

1. **`health.test.ts`** - Health check endpoint
   - GET /health returns 200

2. **`rate-limit.middleware.test.ts`** - Rate limiting
   - 5 requests per phone per hour
   - Rate limit reset after timeout
   - Custom error responses

3. **`auth.request-code.test.ts`** - Request verification code
   - Valid phone number accepts request
   - Invalid phone number rejects
   - Code stored in database
   - 5-minute expiry set correctly
   - Rate limiting enforced

4. **`auth.verify-code.test.ts`** - Verify code flow
   - Valid code creates/fetches user
   - Invalid code returns error
   - Expired code returns error
   - JWT token set in cookie
   - `requiresProfile` flag correct

5. **`auth.complete-profile.test.ts`** - Profile completion
   - Updates displayName and timezone
   - Validates input (3-50 chars)
   - Returns new JWT with updated name
   - Requires authentication

6. **`auth.me-logout.test.ts`** - Get user and logout
   - GET /api/auth/me returns current user
   - POST /api/auth/logout clears cookie
   - Requires valid JWT

7. **`auth.middleware.test.ts`** - Auth middleware
   - `authenticate()` validates JWT
   - `requireCompleteProfile()` checks displayName
   - Cookie and header token extraction
   - 401/403 error responses

8. **`database.test.ts`** - Database operations
   - Connection pooling
   - Query execution
   - Transaction handling

9. **`error.middleware.test.ts`** - Error handling
   - Validation errors (400)
   - Unauthorized errors (401)
   - Rate limit errors (429)
   - Server errors (500)

**Running Tests:**

```bash
cd apps/api
pnpm test           # Includes integration tests
```

**All 17 tests (unit + integration) passing.**

---

### ✅ E2E Tests (Playwright) - 4 Scenarios Implemented

**Location:** `apps/web/tests/e2e/auth-flow.spec.ts`

**Configuration:** `apps/web/playwright.config.ts`

- Base URL: http://localhost:3000
- Timeout: 30 seconds per test
- Sequential execution (no parallelism for DB isolation)
- Auto-start both API (8000) and web (3000) servers
- HTML reporter with screenshots on failure

**Implemented Test Scenarios:**

#### Test 1: Complete Authentication Journey

```typescript
test("complete authentication flow from login to dashboard", async ({
  page,
}) => {
  const phoneNumber = `+1555${Date.now()}`;

  // 1. Login page - enter phone number
  await page.goto("/login");
  await page.fill('input[type="tel"]', phoneNumber.slice(2));
  await page.click('button[type="submit"]');

  // 2. Verify page - enter code
  await page.waitForURL("/verify*");
  await page.fill('input[maxlength="6"]', "123456");
  await page.click('button:has-text("Verify")');

  // 3. Complete profile
  await page.waitForURL("/complete-profile");
  await page.fill('input[name="displayName"]', "Test User");
  await page.click('button[type="submit"]');

  // 4. Dashboard - verify logged in
  await page.waitForURL("/dashboard");
  await expect(page.locator("text=Test User")).toBeVisible();

  // 5. Verify auth cookie set
  const cookies = await page.context().cookies();
  const authCookie = cookies.find((c) => c.name === "auth_token");
  expect(authCookie).toBeDefined();
  expect(authCookie?.httpOnly).toBe(true);
  expect(authCookie?.secure).toBe(true); // In production
});
```

#### Test 2: Logout Flow

```typescript
test("logout clears cookie and redirects to login", async ({ page }) => {
  // Complete auth flow first
  // ...

  // Logout
  await page.click('button:has-text("Logout")');
  await page.waitForURL("/login");

  // Verify cookie cleared
  const cookies = await page.context().cookies();
  const authCookie = cookies.find((c) => c.name === "auth_token");
  expect(authCookie).toBeUndefined();

  // Verify cannot access protected route
  await page.goto("/dashboard");
  await page.waitForURL("/login");
});
```

#### Test 3: Protected Route Access

```typescript
test("accessing protected route without auth redirects to login", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page.waitForURL("/login");
});
```

#### Test 4: Existing User Path

```typescript
test("existing user skips profile completion", async ({ page }) => {
  // Create user via API
  const phoneNumber = `+1555${Date.now()}`;
  await fetch("http://localhost:8000/api/auth/request-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber }),
  });
  await fetch("http://localhost:8000/api/auth/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber, code: "123456" }),
  });

  // Complete profile via API
  // ...

  // Login again
  await page.goto("/login");
  await page.fill('input[type="tel"]', phoneNumber.slice(2));
  await page.click('button[type="submit"]');
  await page.fill('input[maxlength="6"]', "123456");
  await page.click('button:has-text("Verify")');

  // Should go directly to dashboard (skip profile)
  await page.waitForURL("/dashboard");
});
```

**Running E2E Tests:**

```bash
# From root
pnpm test:e2e

# From web directory
cd apps/web
pnpm test:e2e              # Headless mode
pnpm test:e2e:ui           # Playwright UI
pnpm test:e2e:headed       # Headed browser mode
```

**All 4 E2E tests passing.**

### Test Coverage Goals & Strategy

**Backend Testing:**

- Unit tests colocated with services (`service.ts` + `service.test.ts`)
- Focus on business logic and edge cases
- Target: 70%+ coverage for services
- Integration tests for all API endpoints

**Frontend Testing:**

- Focus on **integration tests** over unit tests
- Avoid over-testing individual components
- Test **core workflows** end-to-end
- Use Playwright for critical user journeys

**Test Organization:**

```
apps/api/src/
├── services/
│   ├── auth.service.ts
│   ├── auth.service.test.ts      # Colocated unit tests
│   ├── trips.service.ts
│   └── trips.service.test.ts

apps/web/
├── app/
│   └── trips/
│       └── __tests__/            # Integration tests for workflows
│           └── create-trip.test.tsx
```

**Priority:**

1. E2E tests for critical flows (auth, trip creation, RSVP, event management)
2. Backend integration tests (API endpoints)
3. Backend unit tests (services with complex logic)
4. Frontend integration tests (multi-component workflows)
5. Frontend unit tests (only for complex utilities)

---

## Security Considerations

### 1. Authentication Security

- **JWT Tokens**: Signed with strong secret, 7-day expiration
- **Refresh Strategy**: New token on each request (optional)
- **Cookie Storage**: `httpOnly`, `secure`, `sameSite: strict`
- **Rate Limiting**: 5 attempts per phone number per hour for SMS codes

### 2. Authorization

- **Trip Access**: Verify phone number in invitations table before showing preview
- **Event Permissions**: Check RSVP status and organizer role
- **Resource Ownership**: Validate user owns resource before updates

### 3. Input Validation

- **Zod Route Schemas**: Routes use `fastify-type-provider-zod` for schema validation at the route level
- **Shared Schemas**: Zod schemas shared between frontend and backend (`@journiful/shared/schemas`)
- **Typed Errors**: All API errors use `@fastify/error` with specific error codes and HTTP status codes
- **File Uploads**: Validate MIME types, file size limits (configurable via `MAX_FILE_SIZE`)

```typescript
// Route-level Zod schema validation
fastify.post(
  "/request-code",
  {
    schema: { body: requestCodeSchema },
    preHandler: fastify.rateLimit(smsRateLimitConfig),
  },
  authController.requestCode,
);

// Typed errors (src/errors.ts)
const TripNotFoundError = createError("TRIP_NOT_FOUND", "Trip not found", 404);
const PermissionDeniedError = createError("PERMISSION_DENIED", "...", 403);
```

### 3a. Security Headers

- **Helmet**: `@fastify/helmet` adds security headers (X-Content-Type-Options, X-Frame-Options, HSTS, etc.)
- **CSP**: Content Security Policy disabled for development (configurable)

### 4. Data Privacy

- **Phone Numbers**: Hashed in database (but kept readable for SMS)
- **PII Protection**: Minimal data collection, no tracking
- **Soft Delete**: Data retained but marked deleted (GDPR consideration)

### 5. SQL Injection Prevention

- **Drizzle ORM**: Parameterized queries by default
- **No Raw SQL**: Avoid `.sql` unless necessary and carefully reviewed

### 6. CORS Configuration

```typescript
fastify.register(cors, {
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE"],
});
```

### 7. Rate Limiting

```typescript
// Global rate limit (registered in buildApp)
fastify.register(rateLimit, { max: 100, timeWindow: "15 minutes" });

// Per-endpoint rate limits (src/middleware/rate-limit.middleware.ts)
smsRateLimitConfig:     // 5 requests/hour per phone number
verifyCodeRateLimitConfig: // 10 attempts/15 minutes per phone number
```

### 8. Health Endpoints

Three health endpoints for monitoring and orchestration:

- `GET /api/health` - Full status with database connection check
- `GET /api/health/live` - Liveness probe (instant 200)
- `GET /api/health/ready` - Readiness probe (503 if DB unavailable)

---

## Performance Considerations

### 1. Database Optimization

**Indexes**

```sql
CREATE INDEX idx_events_trip_date ON events(trip_id, start_date);
CREATE INDEX idx_members_user_trip ON members(user_id, trip_id);
CREATE INDEX idx_invitations_phone ON invitations(invitee_phone_number);
CREATE INDEX idx_verification_codes_expiry ON verification_codes(expires_at);
```

**Query Optimization**

- Use Drizzle's `leftJoin` for related data in single query
- Limit results with `.limit()` and `.offset()`
- Select only needed columns with `.select({ ... })`

### 2. Caching Strategy

**Database-Based Verification Codes (MVP)**

For MVP, verification codes are stored directly in the database with expiry timestamps:

```typescript
// Database verification code service
class VerificationCodeService {
  async set(phoneNumber: string, code: string, ttlMinutes: number = 5) {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await db
      .insert(verificationCodes)
      .values({
        phoneNumber,
        code,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: verificationCodes.phoneNumber,
        set: { code, expiresAt, createdAt: new Date() },
      });
  }

  async get(phoneNumber: string): Promise<string | null> {
    const result = await db
      .select()
      .from(verificationCodes)
      .where(eq(verificationCodes.phoneNumber, phoneNumber))
      .limit(1);

    if (!result[0]) return null;

    // Check expiry
    if (new Date() > result[0].expiresAt) {
      await this.delete(phoneNumber);
      return null;
    }

    return result[0].code;
  }

  async delete(phoneNumber: string) {
    await db
      .delete(verificationCodes)
      .where(eq(verificationCodes.phoneNumber, phoneNumber));
  }
}
```

**Benefits:**

- No need for Redis or in-memory storage in MVP
- Automatic cleanup via periodic job or trigger
- Persists across server restarts
- Simpler deployment

**Production:** Consider Redis for high-volume scenarios and distributed caching.

**TanStack Query Caching** (Frontend)

- `staleTime: 60000` (1 minute) - Consider data fresh
- `gcTime: 300000` (5 minutes) - Cache persists in background
- Automatic background refetching on window focus

### 3. Next.js Optimizations

**React Server Components**

- Initial page loads with pre-rendered content
- Reduced client JavaScript bundle
- Streaming SSR for faster Time to First Byte (TTFB)

**Image Optimization**

```tsx
import Image from "next/image";

<Image
  src={trip.coverImageUrl}
  alt={trip.name}
  width={800}
  height={400}
  priority={false}
/>;
```

**Code Splitting**

- Automatic route-based splitting
- Dynamic imports for modals and heavy components

```tsx
import dynamic from "next/dynamic";

const EventFormModal = dynamic(() => import("@/components/EventFormModal"), {
  ssr: false,
  loading: () => <Spinner />,
});
```

### 4. API Response Times

**Goals:**

- GET endpoints: <200ms (p95)
- POST/PATCH endpoints: <500ms (p95)
- File uploads: <2s (p95)

**Optimization Techniques:**

- Connection pooling for PostgreSQL
- Redis for session storage (not database)
- Compress responses with `@fastify/compress`

```typescript
fastify.register(compress, {
  encodings: ["gzip", "deflate"],
});
```

### 5. Frontend Performance

**Bundle Size**

- Target: <200KB initial JS bundle (gzipped)
- Use tree-shaking for unused code
- Lazy load routes and components

**Rendering Performance**

- Use `React.memo` for expensive list items
- Virtualize long event lists (future: `react-window`)
- Debounce search/filter inputs

---

## Appendix

### Technology Version Summary

| Technology     | Version | Notes                            |
| -------------- | ------- | -------------------------------- |
| Next.js        | 16.x    | Latest with App Router           |
| React          | 19.x    | Latest stable                    |
| TypeScript     | 5.7.3   | Target: ES2023                   |
| Fastify        | 5.x     | Latest v5                        |
| Drizzle ORM    | 0.36+   | Latest with improved types       |
| TanStack Query | 5.x     | React Query v5                   |
| PostgreSQL     | 16+     | Latest stable                    |
| Node.js        | 22.x    | LTS                              |
| ESLint         | 9.x     | Flat config                      |
| shadcn/ui      | Latest  | Copy-paste components (Radix UI) |

### Development Timeline

**Phase 1: Project Setup & Infrastructure** ✅ COMPLETE
**Git Commit:** `faeb16c - Phase 1: Monorepo Setup with pnpm + Turbo + TypeScript`

- ✅ Monorepo setup (pnpm workspaces, Turbo)
- ✅ Backend: Fastify server, Drizzle ORM, PostgreSQL connection
- ✅ Frontend: Next.js App Router, Tailwind CSS, shadcn/ui setup
- ✅ Shared: Zod schemas, TypeScript configs, ESLint 9 flat config
- ✅ Docker Compose for PostgreSQL

**Phase 2: Authentication Feature** ✅ COMPLETE
**Git Commit:** `1fe5e5e - Phase 2: SMS Authentication with E2E Testing`

- ✅ Backend: Phone verification endpoints, JWT generation, mock SMS service
- ✅ Backend: Database-backed verification codes (5-min expiry)
- ✅ Backend: Rate limiting (5 SMS requests/hour per phone)
- ✅ Backend: Auth middleware (authenticate + requireCompleteProfile)
- ✅ Backend: Profile completion endpoint
- ✅ Backend: 17 tests (8 unit, 9 integration) - all passing
- ✅ Frontend: Login/verify pages, auth context, protected routes
- ✅ Frontend: Complete profile page with timezone selection
- ✅ Frontend: Dashboard with logout functionality
- ✅ Frontend: AuthProvider with TanStack Query
- ✅ Shared: Auth schemas, JWT types, User types
- ✅ E2E tests: 4 scenarios covering complete auth flow - all passing
- ✅ Database: users and verification_codes tables with migration

**Phase 3: Trip Management** ✅ COMPLETE
**Git Commit:** `2c31b4f - Ralph: Task 30 - Task 7.3: Code review and cleanup`

- ✅ Backend: Trip CRUD endpoints, organizer management, permissions service
- ✅ Frontend: Dashboard, create trip dialog (shadcn), trip detail page
- ✅ Shared: Trip schemas, permission types
- ✅ E2E test: User can create and view trips

**Phase 4: Itinerary Events, Accommodations & Member Travel** ✅ COMPLETE

- ✅ Backend: Events/accommodations/member travel CRUD with soft delete/restore, extended permissions
- ✅ Frontend: Day-by-day view, group-by-type view, timezone toggle, create/edit/delete dialogs
- ✅ Shared: Event/accommodation/member travel schemas and types
- ✅ Testing: 24 test files, 35 E2E tests, 16 manual screenshots
- Note: Combined original Phases 5-7 scope (Itinerary Events + Accommodations & Member Travel + Advanced Itinerary Features)

**Phase 5: Invitations & RSVP** ✅

- ✅ Backend: InvitationService with batch invite, RSVP, members/invitations listing, rate limiting, response schemas
- ✅ Frontend: InviteMembersDialog, TripPreview, MembersList dialog, RsvpBadge, trip detail refactor (no tabs)
- ✅ Shared: Invitation/RSVP schemas and types, PHONE_REGEX, response schemas for all routes
- ✅ Database: `invitations` table, `isOrganizer` column on members
- ✅ Testing: 15 E2E tests all passing, unit + integration tests

**Phase 6: Advanced Itinerary Features** ✅ COMPLETE

- ✅ Backend: Meetup fields, auto-lock past trips, member removal, deleted items restore
- ✅ Frontend: Deleted items (organizers), multi-day badges, meetup info on event cards
- ✅ E2E test: Restore flow, meetup display, multi-day badges, auto-lock, member removal

**Phase 7: Polish & Testing** ✅ COMPLETE

- ✅ Co-organizer promote/demote (PATCH endpoint + dropdown UI)
- ✅ Member travel delegation (organizers can add travel for any member)
- ✅ Entity count limits (50 events, 10 accommodations, 20 travel/member)
- ✅ Accommodation redesign (datetime columns, multi-day display, compact cards)
- ✅ Responsive design audit (11 fixes across 13 files)
- ✅ Backend performance (5 indexes, parallelized queries, 40-60% reduction)
- ✅ Frontend performance (scoped invalidations, memo, conditional devtools)
- ✅ Test coverage (25 new unit tests, 5 E2E fixes, 1,845 total tests)
- ✅ Documentation (API reference, updated architecture)

### Future Enhancements (Post-MVP)

**Phase 2 Features:**

- Rich text editor for descriptions
- Map integration for locations
- Search and filtering
- Notification center UI
- Per-event RSVP tracking

**Advanced Features:**

- Cost tracking and split payments
- Comments and discussion threads
- Photo sharing per event
- Calendar export (iCal, Google Calendar)
- Trip templates
- Packing lists
- Weather integration

---

## References

- [PRD.md](./PRD.md) - Product Requirements Document
- [DESIGN.md](./DESIGN.md) - UI/UX Design Documentation
- [Next.js Documentation](https://nextjs.org/docs)
- [Fastify Documentation](https://fastify.dev/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [TanStack Query Documentation](https://tanstack.com/query)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

## Document Revision History

**Document Version**: 6.0
**Last Updated**: 2026-02-14
**Status**: Phase 1-7 Complete — Full MVP with Polish & Testing

**Version 6.0 Updates (2026-02-14)**:

- ✅ Documented Phase 7 completion: Co-organizer promote/demote, member travel delegation, entity count limits, accommodation redesign, responsive design, performance optimization, test coverage
- ✅ Updated all API endpoint documentation to match actual implementation (correct HTTP methods, paths, request/response schemas)
- ✅ Added Invitations & Members section with 7 endpoints (was partially documented under RSVPs)
- ✅ Added User Profile section with 3 endpoints (was undocumented)
- ✅ Added Health Check section with 3 endpoints (was undocumented)
- ✅ Expanded error codes from 7 generic entries to 30 specific error codes with HTTP status and descriptions
- ✅ Updated pagination documentation from "future" to actual implementation on trips list endpoint
- ✅ Fixed stale endpoint paths: member travel routes corrected from `/api/travel` to `/api/member-travel`
- ✅ Fixed stale HTTP methods: events and accommodations update corrected from PATCH to PUT
- ✅ Added rate limiting details to all endpoint sections
- ✅ Added permission requirements to all endpoint sections
- ✅ Added entity count limits to relevant endpoint sections
- ✅ 1,845 total tests (shared: 197, api: 803, web: 845)

**Document Version**: 5.0
**Last Updated**: 2026-02-10
**Status**: Phase 1-5 Complete - Monorepo + Auth + Trip Management + Itinerary View Modes + Invitations & RSVP

**Version 5.0 Updates (2026-02-10)**:

- ✅ Documented Phase 5 completion: Invitations & RSVP with batch invite, trip preview, members dialog
- ✅ Added 5 new API endpoints for invitations, RSVP, and member listing
- ✅ Documented InvitationService with batch invite, RSVP, and pending invitation processing
- ✅ Added `invitations` table and `isOrganizer` column on members table
- ✅ Documented frontend components: InviteMembersDialog, TripPreview, MembersList, RsvpBadge
- ✅ Documented trip detail refactor: single-page layout replacing tab UI, members dialog
- ✅ Added response schemas and rate limiting on all Fastify routes
- ✅ Updated shared package: invitation schemas/types, PHONE_REGEX, response schemas
- ✅ 15 E2E tests all passing

**Version 4.0 Updates (2026-02-08)**:

- ✅ Documented Phase 4 completion: Itinerary View Modes with events, accommodations, and member travel
- ✅ Added 18 new API endpoints (6 per resource: events, accommodations, member travel)
- ✅ Documented 3 new database tables with enums, indexes, and soft delete support
- ✅ Documented 3 new services: EventService, AccommodationService, MemberTravelService
- ✅ Documented extended PermissionsService with 9 new permission methods
- ✅ Added 13 new frontend components (itinerary views, cards, dialogs)
- ✅ Documented 6 new TanStack Query hooks with optimistic updates
- ✅ Documented shared validation schemas for events, accommodations, and member travel
- ✅ Updated directory structure to reflect new files
- ✅ Marked Phase 4-8 roadmap as partially complete (Phase 4 done, 5-8 pending as future work)

**Version 3.0 Updates (2026-02-06)**:

- ✅ Documented Phase 3 completion: Trip Management with CRUD, permissions, and image uploads
- ✅ Added 9 trip API endpoints with full request/response documentation
- ✅ Documented 3 new services: TripService, PermissionsService, UploadService
- ✅ Added comprehensive trip management flow documentation
- ✅ Documented database schema updates (trips, organizers, members tables)
- ✅ Added frontend components documentation (CreateTripDialog, EditTripDialog, ImageUpload)
- ✅ Documented permission system and access control rules
- ✅ Added environment variables for file uploads (UPLOAD_DIR, MAX_FILE_SIZE, ALLOWED_MIME_TYPES)
- ✅ Documented E2E tests for trip management (902 lines, 4 test suites)
- ✅ Updated dashboard with trip grouping and search functionality
- ✅ Marked Phase 4-8 as planned (invitations, events, accommodations, etc.)

**Version 2.0 Updates (2026-02-04)**:

- ✅ Documented Phase 1 completion: Monorepo setup with pnpm + Turbo + TypeScript
- ✅ Documented Phase 2 completion: SMS authentication with E2E testing
- ✅ Added actual codebase structure with file paths
- ✅ Documented 17 backend tests (8 unit, 9 integration) - all passing
- ✅ Documented 4 E2E tests covering complete auth flow - all passing
- ✅ Added actual API endpoint documentation with request/response examples
- ✅ Documented JWT implementation with httpOnly cookie storage
- ✅ Added auth middleware implementation details
- ✅ Updated environment variables with Zod validation
- ✅ Added development workflow scripts and commands
- ✅ Marked Phase 3-8 as planned (not yet implemented)

**Version 1.1 Updates (2026-02-01)**:

- Renamed `rsvps` table to `members` with proper ID primary key
- Changed verification codes from in-memory to database-backed storage
- Added comprehensive schema definitions for all tables
- Noted that core flows have been implemented in demo

**Git Commits Referenced**:

- `2c31b4f` - Ralph: Task 30 - Task 7.3: Code review and cleanup (Phase 3)
- `1fe5e5e` - Phase 2: SMS Authentication with E2E Testing
- `faeb16c` - Phase 1: Monorepo Setup with pnpm + Turbo + TypeScript
- `2c8a3eb` - MVP Demo: Journiful Core Features Implementation
