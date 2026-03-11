import { z } from "zod";

/** Params schema for GET /calendar/:token.ics */
export const calendarTokenParamsSchema = z.object({
  token: z.string().uuid(),
});

/** Response schema for POST /users/me/calendar and POST /users/me/calendar/regenerate */
export const calendarEnableResponseSchema = z.object({
  success: z.literal(true),
  calendarUrl: z.string(),
  calendarToken: z.string().uuid(),
});

/** Body schema for PUT /trips/:tripId/members/me/calendar */
export const calendarExcludedSchema = z.object({
  excluded: z.boolean(),
});

/** Response schema for GET /users/me/calendar */
export const calendarStatusResponseSchema = z.object({
  success: z.literal(true),
  enabled: z.boolean(),
  calendarUrl: z.string().optional(),
});

/** Response for calendar toggle and disable endpoints */
export const calendarSuccessResponseSchema = z.object({
  success: z.literal(true),
});

// Inferred TypeScript types
export type CalendarTokenParams = z.infer<typeof calendarTokenParamsSchema>;
export type CalendarExcludedInput = z.infer<typeof calendarExcludedSchema>;
export type CalendarStatusResponse = z.infer<
  typeof calendarStatusResponseSchema
>;
export type CalendarEnableResponse = z.infer<
  typeof calendarEnableResponseSchema
>;
export type CalendarSuccessResponse = z.infer<
  typeof calendarSuccessResponseSchema
>;
