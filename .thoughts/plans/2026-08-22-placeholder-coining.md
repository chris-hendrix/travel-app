# Placeholder Coining — “Add person without inviting” (Phase 5 follow-up)

**Date:** 2026-08-22
**Status:** in-progress
**Branch:** `feat/placeholder-members`
**Depends on:** `.thoughts/plans/2026-08-19-placeholder-members.md` (Tasks 16-19 done, commit `9184139b`)

## Overview

Coin “placeholder” as the *noun* for `members.userId NULL` (appears in member list, itinerary, Settle, invite/link later) while keeping the **action explicit and quiet**: CTA = **“Add person without inviting”** (text-link, `font-normal`, not bold/gradient) stacked *below* the primary `Invite members`. Move the educational copy `No extra travelers yet / Add people you’re planning for — you can invite them later.` out of the buried `Not invited` empty-state into the `Invite members` dialog footer where discovery happens. Vivid Capri de-emphasis (`frontend-design`).

## Success Criteria

- [ ] No primary CTA says `Add placeholder` — all creation CTAs are `Add person` / `Add person without inviting` (text-link, `font-normal`, not bold).
- [ ] `Invite members` remains the only bold/gradient primary; “without inviting” is quiet, stacked below (12px gap), not side-by-side `flex-1`.
- [ ] `Not invited` empty-state is slim: icon `UserPlus` dotted + `No one extra yet` + text-link `Add person without inviting` (no long paragraph, no `outline` button).
- [ ] `InviteMembersDialog` footer has new section: `Separator` + text-link `Add person without inviting` + helper `Planning for someone who isn’t on Journiful yet? They’ll appear in the member list, itinerary & Settle — no SMS until you invite.` (moved copy).
- [ ] `AddPlaceholderDialog` still `Dialog` desktop / `Sheet bottom` mobile via `useIsMobile`, but title stays `Add person` (to match CTA) with subtitle `Placeholder: someone you’re planning for before inviting. They appear in the itinerary & Settle; send an invite or link them later.` — this is where “placeholder” is coined. Row badge `Placeholder` (`variant=secondary`, muted) on `isPlaceholder` rows.
- [ ] `payment-form.tsx` trigger `Add person…` → `Add person without inviting…` text-link, still opens same dialog and auto-selects `member.id`.
- [ ] `pnpm typecheck` + `pnpm lint` 0 errors, `members-list` + `invite-members-dialog` + `payment-form` RTL green. No new E2E (trophy cap).

## What We're NOT Doing

- No rename of backend `isPlaceholder` / DB columns / `members_trip_phone_unique`.
- No change to 25-member limit, no change to settle `memberId` FK, no data migration.
- No public “claim” flow, no placeholder avatar/handles.
- No new E2E; no change to `Trip` deep-link or SMS flow.

## Risks & Blockers

- **Jargon vs clarity:** “Placeholder” coined only as noun (badge/helper), not verb — explicit CTA avoids learnability tax. If we made button `Add placeholder` it would be shorter but first-time organizers translate “what’s a placeholder?”
- **Discoverability:** Moving educational copy out of `Not invited` could hide it from users who never open Invite. Mitigated by keeping slim `Not invited` CTA (text-link) and adding same helper in `AddPlaceholderDialog` subtitle — two touchpoints.
- **Stacked dialogs:** `Invite` Sheet + `Add placeholder` Dialog/Sheet both Radix — focus trap and `useDialogBack` (Android back) must not clash. Verify on mobile `Sheet bottom` thumb-reach.
- **Visual hierarchy:** Two `flex-1` bold buttons side-by-side truncate `Add person without inviting` on 375px. Stacked text-link below gives 44px primary + 32px secondary targets, better for Capacitor.

## Branch & Commit Strategy

- Branch: `feat/placeholder-members` (continue, single branch, squash-merge later).
- Commits (conventional, after GREEN):
  - `feat(web): coin placeholder as noun — AddPlaceholderDialog subtitle + Placeholder badge`
  - `feat(web): de-emphasize Add person without inviting — members-list stacked text-link + slim Not invited`
  - `feat(web): payment-form trigger → Add person without inviting`
  - `feat(web): invite dialog footer — Add person without inviting + moved educational copy`
- No migration.

## Architecture

### Frontend (`apps/web/src` — Vivid Capri hex-only `@theme` `#f5edd6` linen, `#2e5984` primary, `#b8432e` accent, `font-playfair`, `linen-texture`)

**`components/trip/add-placeholder-dialog.tsx`** (already `Dialog` desktop / `Sheet bottom` mobile):
- Title: `Add person` (keep to match CTA, not `Add placeholder` verb) — subtitle `Placeholder: someone you’re planning for before inviting. They appear in the itinerary & Settle; send an invite or link them later.` (`text-xs text-muted-foreground`). Keep `UserCircle` dotted avatar, `data-testid` `add-placeholder-name`/`phone`/`submit`, `23505` → field error, 25-limit disables, focus first input, `aria-label`.

**`components/trip/members-list.tsx`**:
- Sticky footer: was `flex gap-2` two `flex-1` sm buttons. New: **stacked** — `Invite members` `variant="gradient" size="lg" class="w-full h-12"` on top, then `Button variant="ghost" size="sm" class="w-full font-normal text-sm text-muted-foreground hover:text-foreground"` `Add person without inviting` 12px below (`mt-3`). Not `flex-1`, not bold, text-link with `underline-offset-4 hover:underline`. `data-testid=add-placeholder-trigger` stays.
- `Not invited` empty-state: was dashed `card` with `Add person` `outline` button + long paragraph. New: same dashed `linen-texture` but **slim**: `UserPlus` dotted 12, `No one extra yet` (`font-playfair` `text-sm`), text-link CTA `Add person without inviting` (`font-normal`), no paragraph. Long copy moved elsewhere.
- Rows: add `Badge variant="secondary" class="bg-muted text-muted-foreground"` `Placeholder` for `isPlaceholder` (next to `Organizer`/`Muted`). Guards `isMuted`/`isOrganizer` already `!isPlaceholder`.

**`components/settle/payment-form.tsx`**:
- Trigger inside `Split with` card: `Add person…` `UserPlus` + `Input` → replaced already with button, now text changes to `Add person without inviting…` `class="text-sm font-normal text-muted-foreground hover:text-primary"` with `UserPlus size-4 text-primary/60`, still opens same `AddPlaceholderDialog` with `onSuccess` auto-select `member.id`.

**`components/trip/invite-members-dialog.tsx`**:
- Import `AddPlaceholderDialog` + `useMembers` count for 25-limit, `useQueryClient`.
- Below `Phone numbers` / `Mutuals` and `Send invitations` primary (`variant="gradient"`), add footer `div class="pt-4 mt-4 border-t border-dashed"` with `p class="text-xs text-muted-foreground"` `Planning for someone who isn’t on Journiful yet? They’ll appear in the member list, itinerary & Settle — no SMS until you invite. Add people you’re planning for — you can invite them later.` + `Button variant="ghost" size="sm" class="font-normal text-muted-foreground hover:text-foreground"` `Add person without inviting` → `setAddPlaceholderOpen(true)`. Dialog `onSuccess` → `toast.success("Person added without invite")` + `invalidate(memberKeys.list(tripId))` + close. Keep `useMutualSuggestions` for link elsewhere.

## Testing Strategy

- **Component (RTL, API mocked):**
  - `members-list` — headings `Going`/`Maybe`/`Not going`/`Invited`/`Not invited` still grouped, `Not invited` slim empty-state shows `No one extra yet` + text-link `Add person without inviting` (`data-testid`), footer stacked: `Invite members` gradient on top, text-link below (not `flex-1`), placeholder row shows `Placeholder` badge.
  - `add-placeholder-dialog` — title `Add person` still, subtitle contains `Placeholder: someone…`, `data-testid` name/phone/submit, `aria-label`.
  - `invite-members-dialog` — footer shows `Add person without inviting` link + helper `Planning for someone…`/`Add people you’re planning for`, clicking opens same dialog.
  - `payment-form` — trigger text `Add person without inviting…` opens dialog + auto-select.
- **Service/integration:** No new backend tests (placeholder CRUD already 45/45, member-travel 43/43, payment/balance 57).
- **Quality:** `make test-exec CMD="pnpm typecheck"` + `make test-exec CMD="pnpm lint"` 0 errors; `make test-exec CMD="pnpm --filter @journiful/web test"` for affected files. No new E2E (trophy cap per `apps/web/tests/e2e/AGENTS.md`). Turbo cache: `pnpm --filter @journiful/shared test` not `pnpm test -- shared`.

## Implementation Checklist

- [x] **Task 20 — AddPlaceholderDialog subtitle (coin noun)** — add subtitle `Placeholder: someone you’re planning for…` under title, keep `Dialog`/`Sheet bottom`, `data-testid`. RED: RTL subtitle contains Placeholder → GREEN → CHECK typecheck.
- [x] **Task 21 — MembersList stacked text-link + slim Not invited + Placeholder badge** — footer `Invite members` gradient top + `Add person without inviting` ghost text-link below (not flex-1, font-normal), empty-state slim, row `Placeholder` badge. RED: footer stacked + empty-state slim + badge → GREEN → CHECK.
- [x] **Task 22 — PaymentForm trigger rename** — `Add person…` → `Add person without inviting…` text-link (`font-normal`). RED: trigger text → GREEN.
- [x] **Task 23 — InviteMembersDialog footer** — `Separator` + helper (moved copy) + text-link `Add person without inviting` → opens `AddPlaceholderDialog` (same component, invalidates `memberKeys`), verify focus trap + sheet bottom thumb-reach. RED: footer link + helper + opens dialog → GREEN → CHECK full suite.

## Tracked Changes

- 2026-08-22 — Added this plan: coin “placeholder” as noun (badge/helper) but keep CTA explicit “Add person without inviting” de-emphasized as stacked text-link below primary (frontend-design quiet secondary). Move educational copy from `Not invited` empty-state to `Invite` footer. See Tasks 20-23.

## References

- Plan: `.thoughts/plans/2026-08-19-placeholder-members.md` (Phase 5 done `9184139b`)
- Web: `apps/web/src/components/trip/members-list.tsx:639` (empty-state), `:669` (sticky footer), `components/trip/add-placeholder-dialog.tsx:219` (title/helper), `components/settle/payment-form.tsx:380` (trigger), `components/trip/invite-members-dialog.tsx:182` (invite), `components/ui/sheet.tsx` (bottom), `hooks/use-placeholders.ts` (invalidation), `app/globals.css` (Vivid Capri)
