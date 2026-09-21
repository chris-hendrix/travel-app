# Parked planning — Journiful Mobile Phase 1

**Status:** PARKED. Not in scope until the design system is defined.

Everything in this file was written before the decision to define the design system first — as Expo components with mock data. It is preserved so the reasoning isn't lost, **not** as an active plan. Do not act on it, and do not treat any of it as settled.

The active document is [`PRD.md`](./PRD.md) — a mockup brief.

---

## Platform & Technical Approach

**Recommended:** Expo universal — one codebase producing iOS, Android, and web.

Rationale:

- **CI cannot build iOS today.** Every job in `.github/workflows/` runs `ubuntu-latest`; there is no macOS runner. EAS Build's free tier (15 iOS + 15 Android builds/month) removes the need for one entirely.
- **The web target is already a static SPA.** `output: "export"` / `"standalone"`, `force-static` on the relevant routes, no `[id]` dynamic routes, client-side data fetching. The only server-side logic is one `cookies()` auth redirect that already has a client-side fallback. Expo static web output is a small downgrade, not a large one.
- **Capacitor's first-party OTA is sunsetting** (Appflow, Dec 31 2027). EAS Update is first-party and mature.

**Gated on a spike.** One real screen in Expo, live API, on-device plus web export. Do not begin the build until the spike passes.

**Reusable as-is:** `apps/api` (Fastify/Drizzle/JWT), `shared/` (~4,080 lines of Zod schemas, types, utils), the 37 TanStack Query hooks, and the hex design tokens.

**Known costs:** NativeWind v5 (Tailwind 4) is preview-only — the styling layer needs re-expression. The 38 shadcn/radix primitives need RN equivalents. The 104 component tests and 7 Playwright specs do not port; the 6 core flows become the acceptance plan.

---

## Data Model

**The mobile rebuild makes no data model changes.** It reuses the existing schema as-is — every table, column, enum, and relation. This is a hard constraint, and it is what makes deferred features cheap to restore: nothing has to be migrated back.

Consequences:

- **`trips.allow_members_to_add_events` stays.** Phase 1 does not expose it. No column is dropped.
- **`members.user_id` stays nullable.** The guest-member model is retained; Phase 1 just doesn't build its UI.
- **`users.temperature_unit`, `trips.theme_id` / `theme_font`, `users.calendar_token`, `members.calendar_excluded` all stay.** Their features return later.
- **`members.share_phone` stays** — phone-sharing consent is retained.
- **No migration.** Nothing is dropped, so nothing has to be restored. Existing rows keep their values and Phase 1 ignores the fields it doesn't surface.

### Baseline from the place-photos plan

The place-photos work is assumed **complete** before this rebuild starts, so its additive changes are part of the schema this app reuses rather than work it owns:

| Change | Detail |
|---|---|
| `place_provider`, `external_place_id` | On `trips`, `events`, `accommodations` — nullable, composite index |
| `place_photo_cache` | Keyed `(provider, place_id)`, 30-day TTL-on-read |
| `poi_cache` re-key | `(lat, lon)` → `(lat, lon, category)` |

**Open question this raises:** the place-photos plan *does* modify the data model. If "no data model changes" was meant to include that plan, there is a genuine conflict and the photo work needs re-scoping.

---

## Assumed dependency — the Place Photos work is complete

**Assumption:** `feat/place-photos-poi-links` has landed in full — backend *and* web frontend — before this rebuild starts.

### Inherited — the API contract the mobile app consumes

- `place_provider` + `external_place_id` on trips, events, accommodations
- `placePhoto` on trip / event / accommodation responses (joined server-side)
- `GET /api/locations/photos/:ref?size=thumb|card|hero` — named sizes only; arbitrary pixel dimensions rejected
- `GET /api/config` → `features.googleMaps`, for honest UI degradation
- Per-category Discover (`?category=`) with lazy per-category cache rows
- `GoogleMapsGateway` + `GOOGLE_MAPS_ENABLED` kill switch

### Rebuilt — the UI does not port

The plan's Next.js frontend is **not** carried over. It is reimplemented against the same contract:

| Plan artifact | Mobile equivalent |
|---|---|
| `CoverImage` (branches `next/image` vs `<img>`) | One `expo-image` component; the upload path points at the S3 URL directly |
| `PlacePhotoAttribution` | Same component, RN primitives |
| `mobile/animated-hero.tsx` (Capacitor) | Replaced by the Expo trip hero |
| Detail-sheet heroes | Rebuilt in RN sheets |
| Service-worker photo caching (web/PWA only) | `expo-image`'s disk cache — revisit |

### Carried forward unchanged

- **Cover precedence** becomes `coverImageUrl → place photo → gradient`. Theming is deferred, so the `preset.defaultCoverUrl` step is absent until themes return.
- **Attribution requirements** — a Places ToS obligation, not a design choice.
- **The kill switch and config endpoint** — the mobile app consumes both.

### The itinerary rework

The plan's "Cut (deferred, not cancelled)" assumption kept event and accommodation images in the **detail sheets only**, leaving `event-card.tsx` and `accommodation-line-item.tsx` untouched pending a separate "itinerary presenter rework." That rework is Phase 1 scope, because the photo-forward itinerary is what makes place photos load-bearing rather than decorative.

- `event-card.tsx` (36px text-only row, `border-l-3` type accent) and `accommodation-line-item.tsx` are **rewritten**, not preserved.
- `CoverImage`'s `thumb` variant gets a consumer in the day row.
- **`day-by-day-view.tsx` (611L) is replaced**: sticky date headers, the spliced `NowIndicator`, the weather badge in the sticky header, and the vertical interleaving of events with travel rows all go.
- `EVENT_TYPE_CONFIG`'s 9 type colours must survive the rework in some form, or the type distinction goes with it. **This is now a design decision for the mockup phase** — and the design may diverge entirely from the current app (see PRD §1).

---

## Success Metrics

| Metric | Why |
|---|---|
| Invite → join completion rate | The growth loop |
| Time from trip creation → first itinerary item | Does the organizer get value fast? |
| Organizer weekly active (during trip window) | Retention of the authoring persona |
| Traveler repeat opens per trip | Is the itinerary actually being consulted? |
| POI → itinerary conversion rate | Is Discover earning its place as a core feature? |
| Crash-free session rate | Table stakes |

Phase 1 is not the finish line. These metrics measure the first slice only; deferred features are re-added later and bring their own metrics with them.

---

## Milestones

| Phase | Contents | Exit criteria |
|---|---|---|
| **0. Spike** | One real screen (itinerary) in Expo, live API, on-device + web export | Stack decision answered with evidence |
| **1. Foundation** | Auth, session, navigation shell, two-breakpoint layout primitives, design tokens | F1 passes end-to-end |
| **2. Trips & membership** | Trip CRUD, trip list, co-organizers, invite by phone | F2 passes |
| **3. Invite & RSVP** | Invite link, preview, RSVP, phone consent, member list | F3 passes |
| **4. Itinerary** | Events CRUD + restore, photo-forward card presenter, event detail | F4 (minus Discover) passes |
| **5. Discover & lodging** | POI search, convert to event, accommodations | F4 complete |
| **6. Member travel & push** | Travel legs, flight lookup, push notifications | F5, F6 pass |
| **7. Native ship** | iOS + Android builds, EAS Submit, TestFlight/Play internal | Both stores accept a build |
| **8. Feature restoration** | Re-add deferred features onto the new foundation — gallery, messaging, settle, themes, weather, mutuals, calendar, guests, admin. One phase each. | Each restored feature matches its prior behaviour, with no schema change |

Phase 8 is open-ended by design. The sequencing above is the *rebuild*; the product roadmap after it is a separate document. What matters is that Phase 1 leaves the door open — same schema, same API, same shared schemas — so restoration is additive UI work rather than re-platforming.

---

## Core Flows

Six flows, each a candidate for end-to-end coverage.

| # | Flow | Actor | Must cover |
|---|---|---|---|
| **F1** | **Auth** | both | signup (phone → code → profile) · existing user skips profile · logout · route guards |
| **F2** | **Trip creation & membership** | ORG | create trip · edit · delete · promote/demote co-organizer |
| **F3** | **Invite → RSVP → join** | ORG→TRV | invite by phone · invitee opens link logged out → signup → join · logged in as wrong account → switch → join · already-accepted → redirect · RSVP · phone-sharing consent |
| **F4** | **Itinerary authoring** | ORG | create event w/ location · edit · delete · restore · convert POI from Discover |
| **F5** | **Traveler contribute** | TRV | add arrival leg · add departure leg · flight lookup · edit own travel |
| **F6** | **Propagation** | ORG→TRV | organizer edits itinerary → traveler sees update · traveler receives push |

**Qualification rule:** a flow is critical if it is **(a)** auth, **(b)** the growth loop, **(c)** core value delivery, or **(d)** the propagation loop. *(The former "money" criterion is void — no money features in Phase 1.)*

---

## Resolved questions (recorded, not open)

| # | Question | Resolution |
|---|---|---|
| ~~Q1~~ | Discover: wedge or utility? | **Utility** — an authoring input and a read-only browse surface |
| ~~Q2~~ | Does the traveler ever write? | Yes, but only **member travel** (plus RSVP and phone consent) |
| ~~Q3~~ | Do travelers create accommodations? | **No** — accommodations are trip-level, so organizer-only |
| ~~Q4~~ | `allowMembersToAddEvents`? | Stays in the schema, **unexposed** in Phase 1 |
| ~~Q5~~ | Guest members? | Schema retained; Phase 1 shows invited phones as pending invitations |
| ~~Q6~~ | Discover visibility | **Traveler-visible, read-only**; convert stays organizer-only |
| ~~Q7~~ | Discover anchor | Auto-derived: active → next upcoming → trip destination. Undated accommodations skipped. No picker. |
| ~~Q8~~ | Travel cards in the day row? | **Yes** — same day row, as a distinct non-photo card type |
| ~~Q9~~ | Itinerary presenter | **Photo-forward, day-grouped card rows.** The plan's deferred rework is Phase 1 scope. |
| ~~Q10~~ | Data model | **No changes.** Reuse as-is; features restore without migration. |
| ~~Q11~~ | Place photos | **Assumed complete** before this rebuild starts. |
| ~~Q12~~ | What is "wide"? | **One wide layout serving tablet and desktop alike.** No tablet-specific breakpoint, no separate desktop treatment. |
