import { eq, and, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  trips,
  events,
  accommodations,
  memberTravel,
  members,
  affiliateDismissals,
} from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "@/services/permissions.service.js";
import type { SuggestionCard, GapType, SuggestionType } from "@journiful/shared/types";
import {
  BOOKING_DEEP_LINKS,
  SUGGESTION_TEMPLATES,
  BOOKING_PARTNER,
  MAX_SUGGESTIONS,
  type TripContext,
} from "@/config/affiliates.js";
import { env } from "@/config/env.js";

interface GapSignal {
  type: GapType;
  priority: number;
  day?: string;
}

export interface IAffiliateService {
  getSuggestions(userId: string, tripId: string): Promise<SuggestionCard[]>;
  dismissSuggestion(
    userId: string,
    tripId: string,
    suggestionType: string,
    suggestionKey: string,
  ): Promise<void>;
}

export class AffiliateService implements IAffiliateService {
  constructor(
    private db: AppDatabase,
    private permissionsService: IPermissionsService,
  ) {}

  async getSuggestions(
    userId: string,
    tripId: string,
  ): Promise<SuggestionCard[]> {
    // No suggestions if affiliate ID not configured
    if (!env.BOOKING_AFFILIATE_ID) {
      return [];
    }

    // Check trip access
    const canView = await this.permissionsService.canViewFullTrip(
      userId,
      tripId,
    );
    if (!canView) {
      return [];
    }

    // Load trip data in parallel
    const [tripRows, eventRows, accommodationRows, memberTravelRows, memberRows, dismissalRows] =
      await Promise.all([
        this.db
          .select()
          .from(trips)
          .where(eq(trips.id, tripId))
          .limit(1),
        this.db
          .select()
          .from(events)
          .where(and(eq(events.tripId, tripId), isNull(events.deletedAt))),
        this.db
          .select()
          .from(accommodations)
          .where(
            and(
              eq(accommodations.tripId, tripId),
              isNull(accommodations.deletedAt),
            ),
          ),
        this.db
          .select()
          .from(memberTravel)
          .where(
            and(
              eq(memberTravel.tripId, tripId),
              isNull(memberTravel.deletedAt),
            ),
          ),
        this.db
          .select()
          .from(members)
          .where(eq(members.tripId, tripId)),
        this.db
          .select()
          .from(affiliateDismissals)
          .where(
            and(
              eq(affiliateDismissals.userId, userId),
              eq(affiliateDismissals.tripId, tripId),
            ),
          ),
      ]);

    const trip = tripRows[0];
    if (!trip) {
      return [];
    }

    // Don't show suggestions for cancelled trips
    if (trip.cancelled) {
      return [];
    }

    // Detect gaps
    const gaps = detectGaps(
      trip,
      eventRows,
      accommodationRows,
      memberTravelRows,
      memberRows,
      userId,
    );

    // Filter out dismissed suggestions
    const dismissedKeys = new Set(
      dismissalRows.map((d) => `${d.suggestionType}:${d.suggestionKey}`),
    );

    const filteredGaps = gaps.filter((gap) => {
      const key = gap.day
        ? `${gap.type}:${gap.day}`
        : `${gap.type}:trip`;
      return !dismissedKeys.has(key);
    });

    // Sort by priority and cap
    filteredGaps.sort((a, b) => a.priority - b.priority);
    const topGaps = filteredGaps.slice(0, MAX_SUGGESTIONS);

    // Build suggestion cards
    const tripContext: TripContext = {
      destination: trip.destination,
      lat: trip.destinationLat,
      lon: trip.destinationLon,
      startDate: trip.startDate,
      endDate: trip.endDate,
    };

    return buildSuggestions(topGaps, tripContext);
  }

  async dismissSuggestion(
    userId: string,
    tripId: string,
    suggestionType: string,
    suggestionKey: string,
  ): Promise<void> {
    await this.db
      .insert(affiliateDismissals)
      .values({
        userId,
        tripId,
        suggestionType,
        suggestionKey,
      })
      .onConflictDoNothing();
  }
}

function detectGaps(
  trip: typeof trips.$inferSelect,
  eventRows: (typeof events.$inferSelect)[],
  accommodationRows: (typeof accommodations.$inferSelect)[],
  memberTravelRows: (typeof memberTravel.$inferSelect)[],
  memberRows: (typeof members.$inferSelect)[],
  currentUserId: string,
): GapSignal[] {
  const gaps: GapSignal[] = [];

  // Rule 1: Current user is "going" but has no travel entries
  const currentMember = memberRows.find((m) => m.userId === currentUserId);
  if (currentMember?.status === "going") {
    const hasTravel = memberTravelRows.some(
      (t) => t.memberId === currentMember.id,
    );
    if (!hasTravel) {
      gaps.push({ type: "missing_travel", priority: 1 });
    }
  }

  // Rule 2: No accommodations
  if (accommodationRows.length === 0 && trip.startDate) {
    gaps.push({ type: "no_accommodation", priority: 2 });
  }

  // Rule 3 & 4: Per-day gaps (only if trip has date range)
  if (trip.startDate && trip.endDate) {
    const days = getDateRange(trip.startDate, trip.endDate);
    for (const day of days) {
      const dayEvents = eventRows.filter((e) => isEventOnDay(e, day));
      if (dayEvents.length === 0) {
        gaps.push({ type: "empty_day", priority: 3, day });
      } else {
        const hasMeal = dayEvents.some((e) => e.eventType === "meal");
        if (!hasMeal) {
          gaps.push({ type: "missing_meal", priority: 4, day });
        }
      }
    }
  }

  return gaps;
}

function buildSuggestions(
  gaps: GapSignal[],
  tripContext: TripContext,
): SuggestionCard[] {
  return gaps.map((gap) => {
    const template = SUGGESTION_TEMPLATES[gap.type];
    const ctx: TripContext = { ...tripContext };
    if (gap.day) {
      ctx.dayDate = gap.day;
    }

    const destination = tripContext.destination || "your destination";
    const dayFormatted = gap.day
      ? new Date(gap.day + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      : "";

    const title = template.title;
    const description = template.description
      .replace("{destination}", destination)
      .replace("{day}", dayFormatted);

    const affiliateUrl = BOOKING_DEEP_LINKS[template.linkType](ctx);
    const dismissKey = gap.day ? gap.day : "trip";
    const suggestionType: SuggestionType = template.linkType;

    return {
      id: randomUUID(),
      gapType: gap.type,
      suggestionType,
      title,
      description,
      affiliateUrl,
      partner: { ...BOOKING_PARTNER },
      dismissKey,
      day: gap.day ?? null,
      priority: gap.priority,
    };
  });
}

export function getDateRange(start: string, end: string): string[] {
  const days: string[] = [];
  const current = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (current <= last) {
    days.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

export function isEventOnDay(
  event: typeof events.$inferSelect,
  day: string,
): boolean {
  const eventDate = event.startTime.toISOString().slice(0, 10);
  return eventDate === day;
}
