# Placeholder Members — "Not-yet-invited users" Implementation Plan

**Date:** 2026-08-19
**Status:** in-progress
**Branch:** `feat/placeholder-members`

## Overview

Replace the settle-only `tripGuests` "fake users" with a unified **placeholder member** concept: a `members` row with a `NULL userId` that appears in the member list, can carry flight/travel info in the itinerary, participates in settle, and can later be connected to a real account (via SMS invite or direct link). Guests and placeholders become one and the same — the old guest system is removed entirely.

**Prod context:** no settlement data exists in prod (`trip_guests`, `payments`, `payment_participants` are all empty). The migration is therefore pure schema DDL — no data backfill — and `trip_guests` can be hard-dropped safely.

## Success Criteria

- [x] A placeholder (name, optional phone) can be created and appears in the member list under a "Not invited" group.
- [x] Organizers can add member travel (arrival/departure/flight) for a placeholder, and for members of any status (going/maybe/not-going/no-response).
- [x] Placeholders appear as payers/participants in settle (payments) and in balances.
- [x] A placeholder with a phone can be invited (SMS); on accept, its `userId` is set and travel + payments stay attached to the same member row.
- [x] A placeholder can be linked directly to an existing user (no SMS); duplicate member rows are merged.
- [x] No data migration needed (settle tables empty in prod); migration is pure DDL verified by a pre-flight `count(*) == 0` check.
- [x] Guest code (routes/controller/service/hooks/UI/tests) is fully removed; `trip_guests` table dropped.
- [x] Deleting a member/placeholder cascade-deletes their payments + travel.
- [x] All existing unit/service/component/E2E tests pass (updated where behavior changed); no new lint/typecheck errors.

## What We're NOT Doing

- No public/self-serve "claim" flow for placeholders (connection is organizer-initiated only).
- No placeholder avatar/handles/profile (name + phone only).
- No change to the 25-member limit semantics (placeholders count as members).
- No soft-delete of members (deletion is hard + cascade).
- No data backfill of `tripGuests` → placeholders (no guest rows in prod).
- No API-level E2E for settle (existing pyramid unchanged); no new E2E beyond existing critical flows.

## Risks & Blockers

- **Large settle rewrite** — `payment.service.ts` + `balance.service.ts` + schemas/types/tests all shift from `userId|guestId` to `memberId`. Highest regression risk; mitigate with service-integration tests against real Postgres.
- **`members.userId` nullable ripple** — many queries assume `userId` non-null (`getTripMembers`, `member-travel` list join, `members_trip_user_unique`, `isMemberTravelOwner`, plus workers `notification-batch`, `notification.service`, `trip.service` who filter `isNull(members.userId)` for placeholders). Each must be audited; list joins flip `innerJoin(users)` → `leftJoin(users)` and add `isNull` import.
- **Behavior change on member removal** — today removing a real member leaves their `payments.userId` intact; after this change, removal cascade-deletes their payments. Decision: accepted ("cascade delete everything").
- **Placeholder phone uniqueness** — add a partial unique index `(trip_id, phone_number) WHERE phone_number IS NOT NULL`. Duplicate → map Postgres `23505` on `(trip_id, phone)` to `phoneNumber` field error, not generic 500. `invitePlaceholder` without phone → field error “Add a phone number first” with CTA.
- **Member limit UX** — 25 total (placeholders count). When at 25, disable `Add person` + surface `MemberLimitExceededError` as inline helper, not toast.
- **Mute/role for placeholders** — placeholders have `userId NULL` and no `handles`; exclude from `isMuted`/`isOrganizer` promotion and mute flows (`isPlaceholder` guard).
- No external blockers. Requires `make migrate` after schema changes; tests run in devcontainer.

## Branch & Commit Strategy

- Branch: `feat/placeholder-members` off `main`.
- Commit after each GREEN cycle (conventional: `feat:`, `refactor:`, `test:`).
- Phases are sequential commits on the single branch; squash-merge at the end.

## Architecture

### Database (`apps/api/src/db/schema/index.ts`)

**`members`** (currently `:127`):
- `userId` → **nullable** (drop `.notNull()`).
- Add `displayName: varchar("display_name", { length: 100 })` (nullable — placeholder name; real members derive name from `users`).
- Add `phoneNumber: varchar("phone_number", { length: 20 })` (nullable — placeholder phone, for later invite).
- Keep `status` (rsvp enum; placeholders default `no_response`).
- Partial unique index: `(trip_id, phone_number) WHERE phone_number IS NOT NULL`.
- `members_trip_user_unique` stays; NULL `userId` rows don't collide (Postgres treats NULLs as distinct).

**`payments`** (`:711`): drop `userId`, `guestId`; add `memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" })`.

**`paymentParticipants`** (`:749`): drop `userId`, `guestId`; add `memberId` (notNull, FK cascade).

**`invitations`** (`:164`): add `memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" })` (nullable — links a pending invite to its placeholder; NULL for phone-only invites).

**`memberTravel`** (`:293`): unchanged (already keys `members.id`).

**`tripGuests`** (`:686`): **drop** (safe — empty in prod).

**Migration** (hand-authored SQL, following `00XX_name.sql` convention):
1. Pre-flight CHECK: `SELECT count(*) FROM trip_guests; SELECT count(*) FROM payments; SELECT count(*) FROM payment_participants;` — all `0` (dev/CI scratch DB too).
2. Alter `members`: `user_id DROP NOT NULL`, add `display_name`, `phone_number`, partial unique idx.
3. Alter `invitations`: add `member_id` (nullable FK).
4. Recreate `payments` + `payment_participants` with `member_id` (tables empty — drop + recreate is clean and avoids column gymnastics).
5. `DROP TABLE trip_guests`.

### Shared (`shared/`)

- Delete `shared/schemas/guest.ts` + `shared/types/guest.ts`; remove re-exports from `index.ts` barrels.
- `shared/schemas/payment.ts`: `participantSchema`/payer → `{ memberId }`; `createPaymentSchema`/`updatePaymentSchema` use `memberId`; entity schemas use `memberId`, `payerIsPlaceholder` (replaces `isGuest`).
- `shared/schemas/balance.ts`: `balancePersonSchema` → `{ id, name, isPlaceholder }`.
- `shared/schemas/invitation.ts`: `memberWithProfileSchema` → `userId` nullable, add `isPlaceholder: z.boolean()`, `phoneNumber` optional, `displayName` (member name or user name).
- `shared/schemas/member-travel.ts`: `memberTravelEntitySchema.userId` → nullable.
- New `shared/schemas/placeholder.ts`: `createPlaceholderSchema` (`name` 1–100 required, `phoneNumber` optional E.164), `updatePlaceholderSchema` (both optional).
- Mirror all in `shared/types/*`.

### API (`apps/api/src/`)

**`member-travel.service.ts`**: `getMemberTravelByTrip` — `leftJoin(users)` instead of `innerJoin`; `memberName = users.displayName ?? members.displayName`; return `userId` nullable. `createMemberTravel` delegation path already resolves `memberId` from `members` (works for placeholders). `canEditMemberTravelWithData` (permissions) returns false for placeholder owner (null userId) → organizer-only edits, acceptable.

**`payment.service.ts`**: rewrite payer/participants to `memberId`; `buildNameMap` → single `members` query with `leftJoin users`, name = `COALESCE(users.displayName, members.displayName)`.

**`balance.service.ts`**: key balances by `member:<id>`; `buildPersonMap` reads `members` + `users` (left join), `isPlaceholder = members.userId IS NULL`.

**`invitation.service.ts`** (primary home for member/placeholder logic):
- `getTripMembers` → `leftJoin users`, include placeholders (`userId` null), add `isPlaceholder` + (organizer-only) `phoneNumber` (`phone = COALESCE(users.phoneNumber, members.phoneNumber)`), filter `isMuted` with `!== null` guard; `isPlaceholder = userId IS NULL`.
- New: `createPlaceholder(userId, tripId, {name, phoneNumber})`, `updatePlaceholder`, `deletePlaceholder` (hard delete; cascade removes travel/payments/invitations), `invitePlaceholder(userId, memberId)` (requires phone → `InvitationNotFoundError` “Add a phone number first” if missing → create `invitation` with `memberId`, SMS via boss/`smsService`), `linkPlaceholder(userId, memberId, targetUserId)` (verify mutual via `members` self-join, set `userId`; if target already has a member row, transfer travel+payments to it and delete placeholder).
- `processPendingInvitations` / `acceptInvitation`: resolve placeholder by invitation `memberId` (fallback: phone match on `members.phoneNumber WHERE userId IS NULL`); SET `userId` instead of INSERT; if the user already has a real member row, merge (transfer `memberTravel`/`payments`/`paymentParticipants` by `memberId`, delete dup).
- `createInvitations` (bulk) — claim-or-create: if `phone` matches `members(phoneNumber, userId IS NULL, tripId)` then set `invitations.memberId = placeholder.id` (and, if phone belongs to existing `users` row, `UPDATE members SET userId`); else insert new `members` + `invitations`. Duplicate phone on `(trip_id, phone)` → surface as `phoneNumber` field error.
- Workers: `notification-batch`, `notification.service`, `trip.service` filter `isNull(members.userId)` — placeholders never get push/SMS and never count as organizers.

**Routes**: new `apps/api/src/routes/placeholders.routes.ts` (or extend `invitation.routes.ts`): `POST /trips/:tripId/placeholders`, `PUT /placeholders/:id`, `DELETE /placeholders/:id`, `POST /placeholders/:id/invite`, `POST /placeholders/:id/link`.

**Remove** (full guest teardown):
- `guest.service.ts`, `guest.controller.ts`, `guest.routes.ts`, `plugins/guest-service.ts` — delete.
- `app.ts:44,71,253,285` — remove registration + imports.
- `types/index.ts:29,91` — remove `IGuestService` + decorate.
- `errors.ts` — remove `GuestNotFoundError`, `GuestHasPaymentsError`, "Cannot delete guest with existing payments".
- `relations.ts` — drop tripGuests relations; add `members`→payments/participants/invitations relations; `payments.member`.
- Tests: delete `guest.routes.test.ts`; update `balance.service.test.ts:242` guest-participant case.

**Leave alone (false positives):** `shared/types/poi.ts:78` (`guest_house` Google lodging category), `db/seed.ts:328` (`guest2026` wifi password string).

### Frontend (`apps/web/src/` — Vivid Capri: `globals.css` hex-only `@theme` — `#f5edd6` linen, `#2e5984` primary, `#b8432e` accent, `font-playfair`, `linen-texture`/`card-noise`, `slideUp` stagger `i*50ms`, `a11y` focus trap)

- **`components/trip/members-list.tsx`**: replace `Tabs` with a single grouped list (section headers w/ counts: Going / Maybe / Not going / Invited / Not invited; organizer-only groups hidden for others). **Partition rule:** `Not invited = isPlaceholder && !hasPendingInvite(memberId)`; `Invited = pendingInvitations` (memberId or phone). Sticky bottom **two-button** CTA (`sticky bottom-0` `bg-background` + `border-t` + `padding-bottom`): `Invite members` (bulk) + `+ Add person` (placeholder dialog) — **no header `+`**. Placeholder rows in `Not invited` use `MemberRow` `…` menu: *Edit name/phone* → same dialog pre-filled, *Send invite* → `invitePlaceholder` (if no phone → field error “Add a phone number first”), *Link user* → sheet picking mutuals (`useMutuals` → `linkPlaceholder` merge), *Remove* → `deletePlaceholder` (cascade). `isPlaceholder` guards `isMuted`/`isOrganizer`/`canUpdateRole`/`canMute`.
- **New hooks** `hooks/use-placeholders.ts`: `useCreatePlaceholder`, `useUpdatePlaceholder`, `useDeletePlaceholder`, `useInvitePlaceholder`, `useLinkPlaceholder` + invalidation `memberKeys` + `invitationKeys` + `paymentKeys` + `balanceKeys`.
- **`components/trip/add-placeholder-dialog.tsx`** (reused): `Dialog` on desktop / `Sheet bottom` on mobile (`useIsMobile`), `useForm` + `zodResolver(createPlaceholderSchema)` / `updatePlaceholderSchema`, fields `name` + `phoneNumber` optional E.164 with `formatPhoneNumber`, duplicate → field error, 25-limit disables submit, `data-testid` `add-placeholder-name`/`phone`/`submit`, hex-only theme, `UserCircle` dotted avatar.
- **`components/trip/invite-members-dialog.tsx`**: unchanged bulk path; no placeholder logic here (creation is via MembersList / Settle).
- **`components/settle/payment-form.tsx`** + **`settlement-form.tsx`**: single `useMembers` picker (placeholders included); **reuse same `AddPlaceholderDialog`** — replace inline `Input` + `handleAddPerson` with trigger opening dialog; on success auto-select `member.id` in `selectedParticipants`.
- **`components/settle/guest-manager.tsx`**: remove.
- **`components/itinerary/create-member-travel-dialog.tsx`**: organizer picker lists `useMembers` with `displayName` + `isPlaceholder` (no `userId` self-branch for placeholders); `currentMember = members.find(m => m.userId===user.id)` handles `null`.
- **Remove** `hooks/use-guests.ts`, `hooks/guest-queries.ts`; `hooks/use-payments.ts:69,80,169` `guestId` → `memberId`; `membersQueryOptions` leftJoin already.

## Testing Strategy (pyramid: backend unit → service → route; frontend RTL-heavy, E2E capped at 7 flows per `apps/web/tests/e2e/AGENTS.md`)

- **Unit** (`shared/__tests__/`): `placeholder` schema (name 1–100, phone E.164), updated `payment`/`balance`/`invitation` (`memberId`/`isPlaceholder`/`userId` nullable) — `pnpm --filter @journiful/shared test`.
- **Service integration** (`apps/api/tests/service/`, real Postgres, external mocked): `payment.service` `memberId` flow, `balance.service` `isPlaceholder` participants, `invitation.service` placeholder CRUD + `invitePlaceholder` (requires phone → `InvitationNotFoundError` if null) + `linkPlaceholder` (mutual check → merge) + `acceptInvitation` phone fallback + `processPendingInvitations` loop; `member-travel.service` leftJoin + nullable `userId` (organizer-only edit for placeholder). `balance.service.test.ts:242` guest-participant case updated to `isPlaceholder`.
- **Route integration** (`apps/api/tests/integration/`, `app.inject()`): `placeholders.routes.test.ts` (organizer-only, 25-limit, duplicate phone `23505` → field error, invite without phone → 404) ; delete `guest.routes.test.ts`.
- **Component integration** (`apps/web/src/**/__tests__/`, RTL, API mocked): `members-list` grouped headers + counts, `Not invited` empty-state CTA + sticky two-button footer, placeholder `…` *Edit*/*Send invite*/*Link*/*Remove* (phone-less invite → “Add a phone number first”); `AddPlaceholderDialog` (renders, validates `name`/`phone`, duplicate → field error, 25-limit disables `data-testid=add-placeholder-submit`, focus trap, `aria-label`); `payment-form` single `memberId` picker + opening same dialog + auto-select; `use-placeholders` invalidates `memberKeys`+`paymentKeys`+`balanceKeys`; remove `guest-manager` tests. `pnpm test` + `typecheck` + `lint` (turbo cache: `pnpm --filter @journiful/shared test` not `pnpm test -- shared`).
- **E2E** (`apps/web/tests/e2e/`): no new E2E (trophy cap); if `settle-journey.spec.ts` references guests, update comment only.
- **Code quality**: `make test-exec CMD="pnpm typecheck"` and `make test-exec CMD="pnpm lint"` (0 errors; `any` warnings pre-existing in `trip-detail`).

## Implementation Checklist

### Phase 1: Schema + migration + shared types

- [x] **Task 1: Schema changes in Drizzle**
  - RED: `apps/api/tests/service/schema.test.ts` — assert `members.userId` nullable, new `displayName`/`phoneNumber` columns; `payments.memberId`/`paymentParticipants.memberId` present; `tripGuests` gone.
  - GREEN: Edit `apps/api/src/db/schema/index.ts` + `relations.ts`.
  - CHECK: `pnpm db:generate` produces expected SQL; `make test-exec CMD="pnpm typecheck"`.

- [x] **Task 2: Pure-DDL data migration**
  - RED: `apps/api/tests/integration/` migration verification — pre-flight `count(*) == 0` on the three settle tables, then run migration; assert `members`/`payments`/`payment_participants` schema shape.
  - GREEN: Author `00XX_placeholder_members.sql` per Architecture above.
  - CHECK: `make migrate` on a scratch DB; verification query passes.

- [x] **Task 3: Shared schemas/types**
  - RED: `shared/__tests__/` placeholder + payment/balance/invitation schema tests.
  - GREEN: Edit `shared/schemas/*`, `shared/types/*`, barrels; delete guest files.
  - CHECK: `make test-exec CMD="pnpm test -- shared"`.

### Phase 2: Backend services

- [x] **Task 4: member-travel service for placeholders** (`member-travel.service.ts`) — leftJoin users, nullable userId, placeholder names.
- [x] **Task 5: payment service → memberId** (`payment.service.ts`)
- [x] **Task 6: balance service → memberId** (`balance.service.ts`)
- [x] **Task 7: invitation service — members list + placeholder CRUD + invite/link/merge** (`invitation.service.ts` + `permissions.service.ts` as needed)
- [x] **Task 8: routes + plugin wiring; remove guest service** (`placeholders.routes.ts`, `app.ts`, delete guest files + errors + types refs)
  - Each task: RED service/integration test → GREEN minimal impl → CHECK `pnpm test` + typecheck.

### Phase 3: Frontend

- [x] **Task 9: placeholder hooks + remove guest hooks**
- [x] **Task 10: members-list grouped rendering + placeholder actions + sticky CTA**
- [x] **Task 11: payment/settlement form single-member picker**
- [x] **Task 12: member-travel selector includes placeholders**
- [x] **Task 13: link-user sheet + remove guest-manager**
  - Each task: RED component test → GREEN → CHECK `pnpm test` + lint.

### Phase 4: Cleanup & E2E

- [x] **Task 14: delete guest tests, update settle E2E**
- [x] **Task 15: full suite** — `make test-exec CMD="pnpm test && pnpm typecheck && pnpm lint"`, `make test-exec CMD="pnpm test:e2e"`.

### Phase 5: Unified Placeholder Form (Vivid Capri) — NEW

Goal: single reusable `AddPlaceholderDialog` (Vivid Capri editorial) used in both **Members → Not invited** and **Settle → Add person**, closing the gap where members-list had no entry and settle used an inline input. Grilled 2026-08-20: user chose **B trimmed — sticky footer two-button only, no header `+`**; confirmed settle must reuse **same** dialog.

- [x] **Task 16: reusable placeholder form dialog** — `components/trip/add-placeholder-dialog.tsx` (client, `useForm` + `zodResolver(createPlaceholderSchema)` for create / `updatePlaceholderSchema` for edit, shadcn `Dialog` on desktop / `Sheet bottom` on mobile via `useIsMobile`, Vivid Capri tokens from `apps/web/src/app/globals.css` — hex-only `@theme` (`#f5edd6` linen, `#2e5984` primary, `#b8432e` accent), `font-playfair` display, `linen-texture`/`card-noise`, `slideUp` stagger `i*50ms`, `UserCircle` dotted avatar). Fields: `name` 1–100 required (stripControlChars), `phoneNumber` optional E.164 with `formatPhoneNumber` display, duplicate `members_trip_phone_unique` → `23505` mapped to `phoneNumber` field error, 25-limit disables `data-testid=add-placeholder-submit`. Hooks: `useCreatePlaceholder` / `useUpdatePlaceholder` / `useInvitePlaceholder` / `useLinkPlaceholder` invalidate `memberKeys` + `invitationKeys` + `paymentKeys` + `balanceKeys`. (RED: RTL renders dialog, validates, calls hook; GREEN: minimal dialog; CHECK: `pnpm typecheck` + RTL)
- [x] **Task 17: integrate into members-list (no header button)** — sticky footer **two-button only**: `Invite members` (bulk) + `+ Add person` (dialog) — `sticky bottom-0 bg-background border-t`. Empty-state when `placeholders.length===0`: dashed `EmptyState` with `UserPlus` dotted avatar + copy “No extra travelers yet …” + `Add person` CTA (same dialog). **Partition rule:** `Not invited = isPlaceholder && !hasPendingInvite(memberId)`; `Invited = pendingInvitations + no_response members`. Row `…` menu: *Edit name/phone* → same dialog pre-filled → `updatePlaceholder`, *Send invite* → `invitePlaceholder` (if `!phoneNumber` → field error “Add a phone number first” + open edit), *Link user* → sheet picking mutuals (`useMutuals` + `mutualKeys.suggestion`) → `linkPlaceholder` merge, *Remove* → `deletePlaceholder` cascade. Guards `isPlaceholder` for `isMuted`/`isOrganizer`. (RED: `members-list` grouped + placeholder row actions; GREEN; CHECK)
- [x] **Task 18: settle parity — reuse same dialog** — replace inline `Input` + `handleAddPerson` in `payment-form.tsx` (keep trigger `Add person…` row but open same `AddPlaceholderDialog` instead of inline input) with `useCreatePlaceholder`; on success auto-select `member.id` in `selectedParticipants` and invalidate same keys. Remove duplicated `name` length / phone validation. `settlement-form` already `memberId` single-picker — no dialog needed. (RED: `payment-form` single picker + dialog; GREEN; CHECK)
- [x] **Task 19: polish + full suite** — a11y (focus first input on open, `aria-label`, `FormMessage`, `data-testid` `add-placeholder-name`/`phone`/`submit`), Capacitor thumb-reach (`Sheet` bottom), `NEXT_EXPORT` guard, hex-only `@theme`, `pnpm test` + `typecheck` + `lint` green; no new E2E (trophy cap). Single branch `feat/placeholder-members`.

---

## Tracked Changes

**2026-08-20** - Frontend placeholder hooks implemented as new `use-placeholders.ts` (not extending `use-invitations`). Member-travel selector already included placeholders via `useMembers` leftJoin — no separate selector change needed beyond backend fix. Settlement/payment forms migrated to `memberId` single picker; inline Add person uses placeholder hook. `notification-batch` and `trip` services patched to filter `NULL userId` placeholders for typecheck green — not in original plan but required for nullable ripple.

**2026-08-20** - Typecheck initially failed in `notification-batch`, `notification`, `trip` services due to `members.userId` nullable; fixed by filtering placeholders and adding guards.

**2026-08-21** - Evaluation fixes: promoted nullable ripple filtering into Architecture; added claim-or-create bulk invite rule + `23505` → field error + `Send invite` phone-less error; clarified `Not invited = isPlaceholder && !hasPendingInvite`; locked Phase 5 to sticky footer two-button only (no header `+`) per user’s B-trim choice and reuse same `AddPlaceholderDialog` in settle; expanded Testing to RTL specs for dialog + grouped list and `use-placeholders` invalidations; added Vivid Capri token + `Dialog`/`Sheet` + `data-testid` constraints. Phase 5 Tasks 16-19 rewritten surgically per evaluation.

## References

- Schema: `apps/api/src/db/schema/index.ts:127` (members), `:164` (invitations), `:293` (memberTravel), `:686` (tripGuests), `:711` (payments), `:749` (participants)
- Services: `apps/api/src/services/{guest,payment,balance,invitation,member-travel}.service.ts`, `permissions.service.ts`
- UI: `apps/web/src/components/trip/members-list.tsx`, `components/settle/{payment-form,settlement-form,guest-manager}.tsx`, `components/itinerary/create-member-travel-dialog.tsx`
- Related plan: `.thoughts/plans/2026-03-28-settle-expense-splitting.md`
