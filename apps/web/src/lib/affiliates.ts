/**
 * Partner display configuration for affiliate suggestions.
 * Contains only public display info — no secrets or affiliate IDs.
 */
export const PARTNER_CONFIG = {
  "booking.com": {
    name: "Booking.com",
  },
} as const;

export type PartnerSlug = keyof typeof PARTNER_CONFIG;
