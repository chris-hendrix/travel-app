import type { TripContext, GapType } from "@journiful/shared/types";
import { env } from "./env.js";

export type { TripContext, GapType };

const aid = () => env.BOOKING_AFFILIATE_ID;

export const BOOKING_DEEP_LINKS = {
  flights: (ctx: TripContext) => {
    const params = new URLSearchParams({ aid: aid() });
    const dest = encodeURIComponent(ctx.destination);
    if (ctx.startDate) params.set("depart", ctx.startDate);
    if (ctx.endDate) params.set("return", ctx.endDate);
    return `https://www.booking.com/flights/index.html?type=round&from=anywhere&to=${dest}&${params}`;
  },
  hotels: (ctx: TripContext) => {
    const params = new URLSearchParams({ aid: aid() });
    if (ctx.lat && ctx.lon) {
      params.set("latitude", String(ctx.lat));
      params.set("longitude", String(ctx.lon));
    }
    if (ctx.startDate) params.set("checkin", ctx.startDate);
    if (ctx.endDate) params.set("checkout", ctx.endDate);
    return `https://www.booking.com/searchresults.html?${params}`;
  },
  attractions: (ctx: TripContext) => {
    const params = new URLSearchParams({ aid: aid() });
    const dest = encodeURIComponent(ctx.destination);
    return `https://www.booking.com/attractions/searchresults/${dest}.html?${params}`;
  },
} as const;

export type BookingLinkType = keyof typeof BOOKING_DEEP_LINKS;

interface SuggestionTemplate {
  linkType: BookingLinkType;
  title: string;
  description: string;
}

export const SUGGESTION_TEMPLATES: Record<GapType, SuggestionTemplate> = {
  missing_travel: {
    linkType: "flights",
    title: "Book your flights",
    description: "You haven't added travel details yet. Find flights to {destination}.",
  },
  no_accommodation: {
    linkType: "hotels",
    title: "Find a place to stay",
    description: "No accommodation added yet. Browse hotels in {destination}.",
  },
  empty_day: {
    linkType: "attractions",
    title: "Explore things to do",
    description: "Nothing planned for {day}. Discover activities in {destination}.",
  },
  missing_meal: {
    linkType: "attractions",
    title: "Find a restaurant",
    description: "No meals planned for {day}. Browse dining options in {destination}.",
  },
};

export const BOOKING_PARTNER = {
  slug: "booking-com",
  name: "Booking.com",
} as const;

export const MAX_SUGGESTIONS = 3;
