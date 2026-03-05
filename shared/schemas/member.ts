// Member validation schemas for the Tripful platform

import { z } from "zod";

/**
 * Validates member role update data
 * - isOrganizer: boolean indicating whether the member should be a co-organizer
 */
export const updateMemberRoleSchema = z.object({
  isOrganizer: z.boolean({
    error: "isOrganizer must be a boolean",
  }),
});

// Inferred TypeScript types from schemas
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
