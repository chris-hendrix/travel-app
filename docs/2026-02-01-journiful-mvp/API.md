# Journiful API Reference

> Base URL: `http://localhost:8000` (development)
>
> All endpoints under `/api/` prefix. Authentication via `auth_token` httpOnly cookie or `Authorization: Bearer <jwt>` header.

## Authentication

All endpoints except health checks and auth flow require a valid JWT token.

Write endpoints additionally require a completed user profile (`displayName` set).

### Rate Limits

| Scope  | Max Requests | Window | Applied To                                     |
| ------ | ------------ | ------ | ---------------------------------------------- |
| SMS    | 5            | 1 hour | `POST /api/auth/request-code` (per phone)      |
| Verify | 10           | 15 min | `POST /api/auth/verify-code` (per phone)       |
| Read   | 100          | 1 min  | All GET endpoints (per user)                   |
| Write  | 30           | 1 min  | All POST/PUT/DELETE/PATCH endpoints (per user) |
| Global | 100          | 15 min | All endpoints (per IP, fallback)               |

### Response Format

**Success:**

```json
{
  "success": true,
  "trip": { ... }
}
```

**Error:**

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": []
  },
  "requestId": "uuid"
}
```

---

## Auth Endpoints

### POST /api/auth/request-code

Request SMS verification code.

| Field       | Type   | Required | Description                                    |
| ----------- | ------ | -------- | ---------------------------------------------- |
| phoneNumber | string | Yes      | Phone number (10-20 chars, converted to E.164) |

**Response:** `{ success: true, message: "Verification code sent to ..." }`

---

### POST /api/auth/verify-code

Verify SMS code and authenticate.

| Field       | Type   | Required | Description                     |
| ----------- | ------ | -------- | ------------------------------- |
| phoneNumber | string | Yes      | Phone number (10-20 chars)      |
| code        | string | Yes      | 6-digit code (regex: /^\d{6}$/) |

**Response:** `{ success: true, user: User, requiresProfile: boolean }`

Sets `auth_token` httpOnly cookie (7-day expiry).

---

### POST /api/auth/complete-profile

Complete user profile after first login. **Auth required.**

| Field       | Type           | Required | Description               |
| ----------- | -------------- | -------- | ------------------------- |
| displayName | string         | Yes      | Display name (3-50 chars) |
| timezone    | string \| null | No       | IANA timezone identifier  |

**Response:** `{ success: true, user: User }`

---

### GET /api/auth/me

Get current authenticated user. **Auth required.**

**Response:** `{ success: true, user: User }`

---

### POST /api/auth/logout

Log out and clear auth cookie. **Auth required.**

**Response:** `{ success: true, message: "Logged out successfully" }`

---

## Trip Endpoints

### GET /api/trips

List authenticated user's trips (paginated).

| Query | Type   | Default | Description              |
| ----- | ------ | ------- | ------------------------ |
| page  | number | 1       | Page number (1-indexed)  |
| limit | number | 20      | Items per page (max 100) |

**Response:** `{ success: true, data: TripSummary[], meta: { total, page, limit, totalPages } }`

---

### GET /api/trips/:id

Get trip details. Non-Going members receive limited preview data.

**Response:** `{ success: true, trip: TripDetail, isPreview?: boolean, userRsvpStatus?: string, isOrganizer?: boolean }`

---

### POST /api/trips

Create a new trip. **Auth + Profile required.**

| Field                   | Type           | Required | Description                                 |
| ----------------------- | -------------- | -------- | ------------------------------------------- |
| name                    | string         | Yes      | Trip name (3-100 chars)                     |
| destination             | string         | Yes      | Destination (1+ chars)                      |
| timezone                | string         | Yes      | IANA timezone identifier                    |
| startDate               | string         | No       | Start date (YYYY-MM-DD)                     |
| endDate                 | string         | No       | End date (YYYY-MM-DD, must be >= startDate) |
| description             | string         | No       | Description (max 2000 chars)                |
| coverImageUrl           | string \| null | No       | Cover image URL or path                     |
| allowMembersToAddEvents | boolean        | No       | Default: true                               |
| coOrganizerPhones       | string[]       | No       | Phone numbers to invite as co-organizers    |

**Response (201):** `{ success: true, trip: Trip }`

---

### PUT /api/trips/:id

Update trip. **Organizer only.**

Same fields as create, all optional. **Response:** `{ success: true, trip: Trip }`

---

### DELETE /api/trips/:id

Cancel trip (soft delete). **Organizer only.**

**Response:** `{ success: true }`

---

### POST /api/trips/:id/co-organizers

Add co-organizer by phone number. **Organizer only.**

| Field       | Type   | Required | Description        |
| ----------- | ------ | -------- | ------------------ |
| phoneNumber | string | Yes      | E.164 phone number |

**Response:** `{ success: true }`

---

### DELETE /api/trips/:id/co-organizers/:userId

Remove co-organizer. **Organizer only.**

**Response:** `{ success: true }`

---

### POST /api/trips/:id/cover-image

Upload trip cover image. **Organizer only.** Multipart form data.

Accepts: JPEG, PNG, WebP (max 5MB).

**Response:** `{ success: true, trip: Trip }`

---

### DELETE /api/trips/:id/cover-image

Delete trip cover image. **Organizer only.**

**Response:** `{ success: true, trip: Trip }`

---

## Member Management Endpoints

### GET /api/trips/:tripId/members

List trip members with profile info.

**Response:** `{ success: true, members: MemberWithProfile[] }`

---

### PATCH /api/trips/:tripId/members/:memberId

Promote or demote co-organizer. **Organizer only.**

Cannot change trip creator's role. Cannot modify own role.

| Field       | Type    | Required | Description                    |
| ----------- | ------- | -------- | ------------------------------ |
| isOrganizer | boolean | Yes      | true = promote, false = demote |

**Response:** `{ success: true, member: MemberWithProfile }`

---

### DELETE /api/trips/:tripId/members/:memberId

Remove member from trip. **Organizer only.** Cannot remove trip creator.

**Response:** 204 No Content

---

### POST /api/trips/:tripId/rsvp

Update RSVP status.

| Field  | Type   | Required | Description                      |
| ------ | ------ | -------- | -------------------------------- |
| status | string | Yes      | `going`, `not_going`, or `maybe` |

**Response:** `{ success: true, member: MemberWithProfile }`

---

## Invitation Endpoints

### GET /api/trips/:tripId/invitations

List pending invitations. **Organizer only.**

**Response:** `{ success: true, invitations: Invitation[] }`

---

### POST /api/trips/:tripId/invitations

Send batch invitations. **Organizer only.**

| Field        | Type     | Required | Description              |
| ------------ | -------- | -------- | ------------------------ |
| phoneNumbers | string[] | Yes      | 1-25 E.164 phone numbers |

**Response:** `{ success: true, invitations: Invitation[], skipped: string[] }`

---

### DELETE /api/invitations/:id

Revoke a pending invitation. **Organizer only.**

**Response:** `{ success: true }`

---

## Event Endpoints

### GET /api/trips/:tripId/events

List events for a trip. Limit: **50 events per trip.**

| Query          | Type    | Default | Description                                        |
| -------------- | ------- | ------- | -------------------------------------------------- |
| type           | string  | —       | Filter by event type: `travel`, `meal`, `activity` |
| includeDeleted | boolean | false   | Include soft-deleted events (organizer only)       |

**Response:** `{ success: true, events: Event[] }`

---

### GET /api/events/:id

Get single event.

**Response:** `{ success: true, event: Event }`

---

### POST /api/trips/:tripId/events

Create event. **Auth + Profile required.** Organizer or member (if `allowMembersToAddEvents`).

| Field          | Type     | Required | Description                             |
| -------------- | -------- | -------- | --------------------------------------- |
| name           | string   | Yes      | Event name (1-255 chars)                |
| eventType      | string   | Yes      | `travel`, `meal`, or `activity`         |
| startTime      | string   | Yes      | ISO 8601 datetime                       |
| endTime        | string   | No       | ISO 8601 datetime (must be > startTime) |
| description    | string   | No       | Description (max 2000 chars)            |
| location       | string   | No       | Event location                          |
| meetupLocation | string   | No       | Meetup location (max 200 chars)         |
| meetupTime     | string   | No       | ISO 8601 datetime for meetup            |
| allDay         | boolean  | No       | Default: false                          |
| isOptional     | boolean  | No       | Default: false                          |
| links          | string[] | No       | URLs (max 10)                           |

**Response (201):** `{ success: true, event: Event }`

---

### PUT /api/events/:id

Update event. **Organizer or event creator.**

Same fields as create, all optional. **Response:** `{ success: true, event: Event }`

---

### DELETE /api/events/:id

Soft-delete event. **Organizer or event creator.**

**Response:** `{ success: true }`

---

### POST /api/events/:id/restore

Restore soft-deleted event. **Organizer only.**

**Response:** `{ success: true, event: Event }`

---

## Accommodation Endpoints

### GET /api/trips/:tripId/accommodations

List accommodations. Limit: **10 accommodations per trip.**

| Query          | Type    | Default | Description                                          |
| -------------- | ------- | ------- | ---------------------------------------------------- |
| includeDeleted | boolean | false   | Include soft-deleted accommodations (organizer only) |

**Response:** `{ success: true, accommodations: Accommodation[] }`

---

### GET /api/accommodations/:id

Get single accommodation.

**Response:** `{ success: true, accommodation: Accommodation }`

---

### POST /api/trips/:tripId/accommodations

Create accommodation. **Organizer only.**

| Field       | Type     | Required | Description                                         |
| ----------- | -------- | -------- | --------------------------------------------------- |
| name        | string   | Yes      | Accommodation name (1-255 chars)                    |
| address     | string   | No       | Street address                                      |
| checkIn     | string   | Yes      | ISO 8601 datetime (with or without timezone offset) |
| checkOut    | string   | Yes      | ISO 8601 datetime (must be > checkIn)               |
| description | string   | No       | Description (max 2000 chars)                        |
| links       | string[] | No       | URLs (max 10)                                       |

**Response (201):** `{ success: true, accommodation: Accommodation }`

---

### PUT /api/accommodations/:id

Update accommodation. **Organizer only.**

Same fields as create, all optional. **Response:** `{ success: true, accommodation: Accommodation }`

---

### DELETE /api/accommodations/:id

Soft-delete accommodation. **Organizer only.**

**Response:** `{ success: true }`

---

### POST /api/accommodations/:id/restore

Restore soft-deleted accommodation. **Organizer only.**

**Response:** `{ success: true, accommodation: Accommodation }`

---

## Member Travel Endpoints

### GET /api/trips/:tripId/member-travel

List member travel entries. Limit: **20 entries per member.**

| Query          | Type    | Default | Description                                   |
| -------------- | ------- | ------- | --------------------------------------------- |
| includeDeleted | boolean | false   | Include soft-deleted entries (organizer only) |

**Response:** `{ success: true, memberTravels: MemberTravel[] }`

---

### GET /api/member-travel/:id

Get single member travel entry.

**Response:** `{ success: true, memberTravel: MemberTravel }`

---

### POST /api/trips/:tripId/member-travel

Create member travel entry. Organizers can delegate via `memberId`.

| Field      | Type          | Required | Description                                  |
| ---------- | ------------- | -------- | -------------------------------------------- |
| travelType | string        | Yes      | `arrival` or `departure`                     |
| time       | string        | Yes      | ISO 8601 datetime                            |
| location   | string        | No       | Travel location                              |
| details    | string        | No       | Additional details (max 500 chars)           |
| memberId   | string (UUID) | No       | Target member ID (organizer delegation only) |

**Response (201):** `{ success: true, memberTravel: MemberTravel }`

---

### PUT /api/member-travel/:id

Update member travel. **Organizer or travel entry creator.**

| Field      | Type   | Required | Description                        |
| ---------- | ------ | -------- | ---------------------------------- |
| travelType | string | No       | `arrival` or `departure`           |
| time       | string | No       | ISO 8601 datetime                  |
| location   | string | No       | Travel location                    |
| details    | string | No       | Additional details (max 500 chars) |

**Response:** `{ success: true, memberTravel: MemberTravel }`

---

### DELETE /api/member-travel/:id

Soft-delete member travel. **Organizer or travel entry creator.**

**Response:** `{ success: true }`

---

### POST /api/member-travel/:id/restore

Restore soft-deleted member travel. **Organizer only.**

**Response:** `{ success: true, memberTravel: MemberTravel }`

---

## User Profile Endpoints

### PUT /api/users/me

Update own profile. **Auth required.**

| Field       | Type           | Required | Description                                                   |
| ----------- | -------------- | -------- | ------------------------------------------------------------- |
| displayName | string         | No       | Display name (3-50 chars)                                     |
| timezone    | string \| null | No       | IANA timezone identifier                                      |
| handles     | object         | No       | Social handles: `{ venmo?, instagram? }` (max 100 chars each) |

**Response:** `{ success: true, user: User }`

---

### POST /api/users/me/photo

Upload profile photo. **Auth required.** Multipart form data.

Accepts: JPEG, PNG, WebP (max 5MB).

**Response:** `{ success: true, user: User }`

---

### DELETE /api/users/me/photo

Remove profile photo. **Auth required.**

**Response:** `{ success: true, user: User }`

---

## Health Check Endpoints

### GET /api/health

Full health check with database connectivity.

**Response:** `{ status: "ok" | "degraded", timestamp: string, database: "connected" | "disconnected" }`

---

### GET /api/health/live

Liveness probe (always 200 if server is running).

**Response:** `{ status: "ok" }`

---

### GET /api/health/ready

Readiness probe. Returns 503 if database is disconnected.

**Response:** `{ status: "ok" | "degraded", timestamp: string, database: "connected" | "disconnected" }`

---

## Error Codes

| Code                           | HTTP | Description                             |
| ------------------------------ | ---- | --------------------------------------- |
| `VALIDATION_ERROR`             | 400  | Invalid input data (Zod schema failure) |
| `INVALID_CODE`                 | 400  | Invalid or expired verification code    |
| `INVALID_DATE_RANGE`           | 400  | End date/time before start date/time    |
| `FILE_TOO_LARGE`               | 400  | Upload exceeds 5MB                      |
| `INVALID_FILE_TYPE`            | 400  | Unsupported file type                   |
| `CO_ORGANIZER_NOT_FOUND`       | 400  | Phone number not registered             |
| `CANNOT_REMOVE_CREATOR`        | 400  | Cannot remove trip creator              |
| `CANNOT_DEMOTE_CREATOR`        | 400  | Cannot change trip creator's role       |
| `CANNOT_MODIFY_OWN_ROLE`       | 400  | Cannot modify own organizer role        |
| `LAST_ORGANIZER`               | 400  | Cannot remove/demote last organizer     |
| `EVENT_LIMIT_EXCEEDED`         | 400  | Max 50 events per trip                  |
| `ACCOMMODATION_LIMIT_EXCEEDED` | 400  | Max 10 accommodations per trip          |
| `MEMBER_TRAVEL_LIMIT_EXCEEDED` | 400  | Max 20 travel entries per member        |
| `UNAUTHORIZED`                 | 401  | Missing/invalid auth token              |
| `PROFILE_INCOMPLETE`           | 403  | Profile setup required                  |
| `PERMISSION_DENIED`            | 403  | Insufficient permissions                |
| `TRIP_LOCKED`                  | 403  | Trip ended, read-only                   |
| `PREVIEW_ACCESS_ONLY`          | 403  | Non-Going member limited access         |
| `NOT_FOUND`                    | 404  | Trip not found                          |
| `EVENT_NOT_FOUND`              | 404  | Event not found                         |
| `ACCOMMODATION_NOT_FOUND`      | 404  | Accommodation not found                 |
| `MEMBER_TRAVEL_NOT_FOUND`      | 404  | Member travel not found                 |
| `INVITATION_NOT_FOUND`         | 404  | Invitation not found                    |
| `MEMBER_NOT_FOUND`             | 404  | Member not found                        |
| `CO_ORGANIZER_NOT_IN_TRIP`     | 404  | Co-organizer not in trip                |
| `DUPLICATE_MEMBER`             | 409  | Already a trip member                   |
| `MEMBER_LIMIT_EXCEEDED`        | 400  | Max 25 members per trip                 |
| `EVENT_CONFLICT`               | 409  | Event time conflict                     |
| `ACCOUNT_LOCKED`               | 429  | Too many failed attempts                |
| `RATE_LIMIT_EXCEEDED`          | 429  | Rate limit exceeded                     |
| `INTERNAL_SERVER_ERROR`        | 500  | Unexpected server error                 |

---

## Entity Limits

| Entity              | Limit | Scope                   |
| ------------------- | ----- | ----------------------- |
| Members             | 25    | Per trip                |
| Events              | 50    | Per trip                |
| Accommodations      | 10    | Per trip                |
| Member Travel       | 20    | Per member per trip     |
| Invitations (batch) | 25    | Per request             |
| Links               | 10    | Per event/accommodation |
| File Upload         | 5 MB  | Per image               |

---

## Permission Matrix

| Action                    | Creator | Organizer       | Member (Going) | Member (Other) |
| ------------------------- | ------- | --------------- | -------------- | -------------- |
| View trip detail          | ✅      | ✅              | ✅             | Preview only   |
| Edit trip                 | ✅      | ✅              | ❌             | ❌             |
| Cancel trip               | ✅      | ✅              | ❌             | ❌             |
| Invite members            | ✅      | ✅              | ❌             | ❌             |
| Remove members            | ✅      | ✅              | ❌             | ❌             |
| Promote/demote            | ✅      | ✅\*            | ❌             | ❌             |
| Create event              | ✅      | ✅              | If allowed\*\* | ❌             |
| Edit event                | ✅      | ✅              | Own only       | ❌             |
| Delete event              | ✅      | ✅              | Own only       | ❌             |
| Restore event             | ✅      | ✅              | ❌             | ❌             |
| Create accommodation      | ✅      | ✅              | ❌             | ❌             |
| Edit/delete accommodation | ✅      | ✅              | ❌             | ❌             |
| Create member travel      | ✅      | ✅ (any member) | Own only       | ❌             |
| Edit/delete member travel | ✅      | ✅              | Own only       | ❌             |
| Update RSVP               | ✅      | ✅              | ✅             | ✅             |

\* Cannot promote/demote trip creator or self
\*\* Controlled by trip's `allowMembersToAddEvents` setting
