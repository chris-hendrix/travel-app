# Journiful Mobile — Phase 1

**Status:** Mockup brief
**Last updated:** 2026-09-18

---

## What this is

Defines what the Phase 1 mockups must cover. Not a plan, not a spec — the design system is the mockups' **output**.

The mockups are built in **Expo** with mock data. They may diverge completely from the current app; nothing in its visual language is inherited by default.

**Design reference:** [elsewhere.club/events](https://www.elsewhere.club/events) — a starting point, not a specification.

---

## Product

Group trips fail in the coordination phase, not the booking phase. Someone becomes the de-facto organizer, builds a plan in a spreadsheet or a chat thread, and it decays.

**The organizer builds one itinerary. Every traveler can find it, see who's coming, and get where they need to be.**

Phase 1 centres on the **itinerary** and **Discover**, joined by an **invite flow** that brings travelers in.

---

## Who it's for

| Persona | Share | Job |
|---|---|---|
| **Organizer** | Small | Creates the trip. Authors the itinerary. Invites people. |
| **Traveler** | Large | Reads the itinerary. RSVPs. Adds their own travel. |

One rule: **trip-level things are organizer-authored; person-level things are self-authored.**

So every authoring surface needs an **organizer variant** and a **traveler variant**. This is the biggest source of state multiplication, and the easiest thing to miss.

---

## Scope

**In:** auth · trips · invites & RSVP · itinerary · Discover · member travel · accommodations · push notifications · place imagery · phone + wide

**Deferred — not deleted:** messaging · money / settle · themes · weather · photo gallery · mutuals · calendar sync · admin · guest members

Deferred features restore later against the same data model. Don't design for them, but don't design them out either.

---

## Mockups

**Two viewports.** Phone is canonical; wide is a rearrangement of the same information. Wide serves tablet and desktop alike — one layout, not two.

**Screens to cover:**

- **Auth** — login, verify, complete profile
- **Trips** — trip list, create trip, trip settings, delete
- **Invites** — invite members, invite preview, RSVP, phone-sharing consent, member list
- **Itinerary** — trip shell, day listing (grid / list), event detail, create / edit event, deleted items
- **Discover** — POI listing (grid / list), POI detail, convert to event
- **Travel** — my travel, flight lookup, reminder
- **Info** — trip info, accommodations, member profile
- **Covers** — trip hero, trip list tile
- **System** — profile, push prompt, empty / loading / error / offline, sign-out

Every screen carries its organizer and traveler variants where relevant, plus its loading, empty, and error states.

---

## Constraints

- Attribution on hero place photos — a ToS obligation, not a preference
- Cover precedence: user upload → place photo → fallback
- Nothing blocks re-adding the deferred features

---

## Deliverable

An Expo project containing the design system, exercised against mock data across the screens above at both viewports.

Anything not covered by a mockup is not yet designed.
