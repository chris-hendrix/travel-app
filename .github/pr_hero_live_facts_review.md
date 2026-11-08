# Review: Trip hero live facts (PR #302)

**Verdict: Approve** — with two Required findings, both fixed and pushed in the review (`Hold the hoisted events query on the run's gate; stamp nextEvent tests explicit`).

## Context

The change: spacing-only door run (middle dots retired), `Stay` retired from the run in favor of a named fact line, and a mid-trip pair — `Current stay — <roof name>`, `Next event — <name>, <day> <7:00 PM>` — gated by the run's own gate and the calendar, pressing into stay/event detail. New pure helper `nextEvent` in `lib/itinerary.ts`; events read hoisted from the run's query.

Spec settled in review conversation: run first and constant, fact pair below it, mid-trip only, whole-line links, run's type size, 12-hour human time, no placeholder states.

## Findings

### Required — resolved during review

1. **Hoisted read broke the screen's own fetch rule.** `useEventsSection(trip?.id)` fired `GET /trips/:id/events` for *every* viewer, including members the server refuses; the screen's header documents the opposite: *"Nothing unreachable is fetched either, because the run's own reads live inside the run."* Fix: `useEvents` takes an `enabled` flag, and the header gates it on the run's rule. Held reads read `loading`, matching the absent-id behavior; the run's caller is unaffected (default `true`).

2. **Zoned assertions on device-local stamps.** The new `nextEvent` tests asserted Madrid-zone reads against times the `event()` builder stamps in the runner's own zone — they would flip on a non-UTC runner despite passing on CI. Rebuilt with explicit UTC instants, per the suite's existing convention (`eventTimeLabel`'s test: *"An explicit instant, so the device zone the mocks build in cannot move it"*).

### Nit

The live line reads the event's start clock only; the run's rows read `formatTimeRange` (start – end). Deliberate: the line is one fact and stays one line; the range lives one press away. Flag if a pair of events sharing a clock make the line ambiguous.

### FYI

- While the events query is in flight for an allowed viewer, the pair renders short (events = `[]`) and appears on arrival — the header's no-blank rule holds, the line just appears late. The section-tiering pattern the query layers already document.
- Demo trips are upcoming, so the pair has no demo-render surface; pixel verification is pending a real mid-trip on the dev server. The code path is covered by the unit cases.
- `app/trips/detail.tsx` is now 606 lines — under the inspection boundary, but worth watching before the next feature lands on it.

## Checks

- Correctness: nextEvent's now-rule (end-bound, all-day-by-date), zone selection mirrors the run's, gates match the run's gate — tests cover soonest-ahead / running-vs-ended / all-day / zone labels / empty / deleted.
- Readability: labels are the app's words; helpers named; comments carry the "why" per house style.
- Architecture: one shared pure module (`lib/itinerary.ts`), query reuse with dedupe, no feature logic in shared packages, run's no-fetch rule repaired.
- Security: no new inputs, no secrets, existing router patterns.
- Performance: one deduped query, O(n log n) sort over the run's list per render (same as the grouping the run already does).

## Verification

- `pnpm --filter @journiful/mobile test -- itinerary.test` (and full suite): 1565 passed.
- `pnpm typecheck`, `pnpm lint`: green.
- Manual pixel pass: pending (see FYI).
